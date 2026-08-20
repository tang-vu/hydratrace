import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { narrationWordCount, spokenNarration, videoScenes, voiceDescription } from "./plan";

const outputRoot = path.resolve("generated", "video");
const clipsRoot = path.join(outputRoot, "voice-clips");
const encryptedKeyPath = path.resolve(".hydratrace", "secrets", "mimo-api-key.dpapi");
const ttsModel = "mimo-v2.5-tts";
const ttsVoice = "Milo";
const asrModel = "mimo-v2.5-asr";
const playbackRate = 1.25;
const sceneGapSeconds = 0.38;
const maximumAttemptsPerScene = 3;
const maximumAggregateWer = 0.08;
const maximumSceneWer = 0.08;

function loadApiKey(): string | undefined {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY;
  if (process.platform !== "win32" || !existsSync(encryptedKeyPath)) return undefined;
  const escapedPath = encryptedKeyPath.replaceAll("'", "''");
  const command = [
    `$encrypted = Get-Content -LiteralPath '${escapedPath}' -Raw`,
    "$secure = ConvertTo-SecureString $encrypted.Trim()",
    "$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)",
    "try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Could not decrypt the local MiMo DPAPI credential. Recreate it for the current Windows user.");
  return result.stdout.trim() || undefined;
}

const apiKey = loadApiKey();
const baseUrl = new URL(process.env.MIMO_BASE_URL ?? "https://token-plan-sgp.xiaomimimo.com/v1");
const completionUrl = new URL(`${baseUrl.pathname.replace(/\/$/, "")}/chat/completions`, baseUrl.origin);

interface MiMoCompletion {
  choices?: Array<{
    message?: {
      audio?: { data?: unknown };
      content?: unknown;
    };
  }>;
  usage?: { seconds?: number };
}

if (!apiKey) throw new Error("No secure MiMo credential is available. Rotate any exposed key, then set MIMO_API_KEY or create .hydratrace/secrets/mimo-api-key.dpapi as documented in docs/VIDEO_PRODUCTION.md.");
if (baseUrl.protocol !== "https:") throw new Error("MIMO_BASE_URL must use HTTPS.");

function redact(value: string): string {
  return value.replaceAll(apiKey!, "<redacted>").slice(0, 2_000);
}

async function completion(body: Record<string, unknown>): Promise<MiMoCompletion> {
  const response = await fetch(completionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MiMo request failed (${response.status}): ${redact(text)}`);
  try { return JSON.parse(text) as MiMoCompletion; } catch { throw new Error(`MiMo returned invalid JSON: ${redact(text)}`); }
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function normalizeWords(value: string): string[] {
  return value
    .replace(/^\s*<?think>\s*/i, "")
    .replace(/^\s*<[^>]+>\s*/i, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/ninety[- ]five point two/gi, "95point2")
    .replace(/\b95\.2\b/g, "95point2")
    .replace(/eighty[- ]three/gi, "83")
    .replace(/seventeen/gi, "17")
    .replace(/four[- ]thousand/gi, "4000")
    .replace(/twenty[- ]nine/gi, "29")
    .replace(/fifty[- ]seven/gi, "57")
    .replace(/,/g, "")
    .replace(/%/g, " percent")
    .replace(/algo\.SSpaths/gi, "algo dot S S paths")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/<think>[\s\S]*?<\/think>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(expected: string[], actual: string[]): number {
  const previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (expected[row - 1] === actual[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[actual.length] ?? expected.length;
}

function containsSequence(words: string[], sequence: string[]): boolean {
  return words.some((_, index) => sequence.every((word, offset) => words[index + offset] === word));
}

function seconds(file: string): number {
  return Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]));
}

await mkdir(clipsRoot, { recursive: true });
const transcripts: string[] = [];
const sceneMetadata: Array<{ id: string; words: number; durationSeconds: number; wordErrorRate: number; attempts: number; asrSeconds?: number }> = [];
let totalEdits = 0;
let totalExpectedWords = 0;
let totalAsrSeconds = 0;

for (let index = 0; index < videoScenes.length; index += 1) {
  const scene = videoScenes[index]!;
  const prefix = `${String(index).padStart(2, "0")}-${scene.id}`;
  const sourceWavPath = path.join(clipsRoot, `${prefix}-source.wav`);
  const wavPath = path.join(clipsRoot, `${prefix}.wav`);
  const mp3Path = path.join(clipsRoot, `${prefix}.mp3`);
  const speech = spokenNarration(scene);
  const expectedWords = normalizeWords(speech);
  const protectedPhrases = ["Hydra Trace", "Hydra database"].filter((phrase) => speech.toLowerCase().includes(phrase.toLowerCase())).map(normalizeWords);
  let accepted: { transcript: string; edits: number; wer: number; attempts: number; asrSeconds?: number } | undefined;
  let bestWer = Number.POSITIVE_INFINITY;
  for (let attempt = 1; attempt <= maximumAttemptsPerScene; attempt += 1) {
    const tts = await completion({
      model: ttsModel,
      messages: [
        { role: "user", content: voiceDescription },
        { role: "assistant", content: speech },
      ],
      audio: { format: "wav", voice: ttsVoice },
    });
    const audioData = tts.choices?.[0]?.message?.audio?.data;
    if (typeof audioData !== "string" || audioData.length < 1_000) throw new Error(`MiMo TTS did not return usable audio for scene ${scene.id}.`);
    await writeFile(sourceWavPath, Buffer.from(audioData.replace(/^data:audio\/wav;base64,/, ""), "base64"));
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", sourceWavPath, "-filter:a", `atempo=${playbackRate}`, "-c:a", "pcm_s16le", wavPath]);
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "96k", mp3Path]);
    const mp3 = await readFile(mp3Path);
    const asr = await completion({
      model: asrModel,
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:audio/mpeg;base64,${mp3.toString("base64")}` } }] }],
      asr_options: { language: "en" },
    });
    totalAsrSeconds += asr.usage?.seconds ?? 0;
    const transcript = asr.choices?.[0]?.message?.content;
    if (typeof transcript !== "string" || transcript.trim().length < 5) continue;
    const actualWords = normalizeWords(transcript);
    const edits = editDistance(expectedWords, actualWords);
    const wer = edits / Math.max(1, expectedWords.length);
    bestWer = Math.min(bestWer, wer);
    await writeFile(path.join(clipsRoot, `${prefix}-attempt-${attempt}-transcript.txt`), `${transcript.trim()}\n`, "utf8");
    const protectedPhrasesPresent = protectedPhrases.every((phrase) => containsSequence(actualWords, phrase));
    if (wer <= maximumSceneWer && protectedPhrasesPresent) {
      accepted = { transcript: transcript.trim(), edits, wer, attempts: attempt, asrSeconds: asr.usage?.seconds };
      break;
    }
  }
  if (!accepted) throw new Error(`MiMo ASR best word error rate ${bestWer.toFixed(3)} for scene ${scene.id} exceeds the ${maximumSceneWer} scene quality gate after ${maximumAttemptsPerScene} attempts.`);
  await writeFile(path.join(clipsRoot, `${prefix}-transcript.txt`), `${accepted.transcript}\n`, "utf8");
  transcripts.push(`[${scene.id}]\n${accepted.transcript}`);
  sceneMetadata.push({ id: scene.id, words: expectedWords.length, durationSeconds: Number(seconds(wavPath).toFixed(3)), wordErrorRate: Number(accepted.wer.toFixed(4)), attempts: accepted.attempts, asrSeconds: accepted.asrSeconds });
  totalEdits += accepted.edits;
  totalExpectedWords += expectedWords.length;
}

const silencePath = path.join(clipsRoot, "silence.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(sceneGapSeconds), "-c:a", "pcm_s16le", silencePath]);
const concatPath = path.join(clipsRoot, "concat.txt");
const concatEntries: string[] = [];
for (const [index, scene] of videoScenes.entries()) {
  concatEntries.push(`file '${path.join(clipsRoot, `${String(index).padStart(2, "0")}-${scene.id}.wav`).replaceAll("'", "'\\''")}'`);
  if (index < videoScenes.length - 1) concatEntries.push(`file '${silencePath.replaceAll("'", "'\\''")}'`);
}
await writeFile(concatPath, `${concatEntries.join("\n")}\n`, "utf8");
const narrationPath = path.join(outputRoot, "narration.wav");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c:a", "pcm_s16le", narrationPath]);

const aggregateWer = totalEdits / Math.max(1, totalExpectedWords);
await writeFile(path.join(outputRoot, "asr-transcript.txt"), `${transcripts.join("\n\n")}\n`, "utf8");
await writeFile(path.join(outputRoot, "voice-metadata.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  baseUrl: baseUrl.origin,
  ttsModel,
  ttsVoice,
  asrModel,
  playbackRate,
  sceneGapSeconds,
  maximumAggregateWer,
  maximumSceneWer,
  protectedPhrases: ["Hydra Trace", "Hydra database"],
  narrationWords: narrationWordCount(),
  durationSeconds: Number(seconds(narrationPath).toFixed(3)),
  wordErrorRate: Number(aggregateWer.toFixed(4)),
  asrSeconds: totalAsrSeconds,
  scenes: sceneMetadata,
}, null, 2)}\n`, "utf8");
if (aggregateWer > maximumAggregateWer) throw new Error(`MiMo ASR aggregate word error rate ${aggregateWer.toFixed(3)} exceeds the ${maximumAggregateWer} quality gate.`);
console.log(JSON.stringify({ ok: true, ttsModel, ttsVoice, asrModel, words: narrationWordCount(), durationSeconds: Number(seconds(narrationPath).toFixed(3)), wordErrorRate: Number(aggregateWer.toFixed(4)), scenes: sceneMetadata.length, output: narrationPath }, null, 2));
