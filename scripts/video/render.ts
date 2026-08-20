import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { narrationWordCount, videoScenes } from "./plan";

const outputRoot = path.resolve("generated", "video");
const stillRoot = path.join(outputRoot, "stills");
const narrationPath = path.join(outputRoot, "narration.wav");
const silentPreview = process.argv.includes("--silent-preview");

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function formatTime(seconds: number): string {
  const milliseconds = Math.round(seconds * 1_000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1_000);
  const ms = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function chunks(words: string[], maximum = 11): string[][] {
  const result: string[][] = [];
  for (let index = 0; index < words.length; index += maximum) result.push(words.slice(index, index + maximum));
  return result;
}

await mkdir(outputRoot, { recursive: true });
for (const scene of videoScenes) await access(path.join(stillRoot, scene.still));

let narrationDuration = 132;
let spokenDurations: number[] | undefined;
let sceneGapSeconds = 0;
if (!silentPreview) {
  await access(narrationPath);
  narrationDuration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", narrationPath]));
  if (!Number.isFinite(narrationDuration) || narrationDuration < 75 || narrationDuration > 162) {
    throw new Error(`Narration duration ${narrationDuration} seconds is outside the 75–162 second safety range.`);
  }
  const voiceMetadata = JSON.parse(await readFile(path.join(outputRoot, "voice-metadata.json"), "utf8")) as {
    sceneGapSeconds?: number;
    scenes?: Array<{ id: string; durationSeconds: number }>;
  };
  if (voiceMetadata.scenes?.length !== videoScenes.length || voiceMetadata.scenes.some((scene, index) => scene.id !== videoScenes[index]?.id || !Number.isFinite(scene.durationSeconds))) {
    throw new Error("Voice metadata does not match the current video scene plan.");
  }
  spokenDurations = voiceMetadata.scenes.map((scene) => scene.durationSeconds);
  sceneGapSeconds = voiceMetadata.sceneGapSeconds ?? 0;
}

const totalDuration = narrationDuration + 3;
const minimumScene = 4.2;
const sceneWords = videoScenes.map((scene) => narrationWordCount(scene.narration));
const weightedPool = totalDuration - minimumScene * videoScenes.length;
const totalWords = sceneWords.reduce((sum, count) => sum + count, 0);
const durations = spokenDurations
  ? spokenDurations.map((duration, index) => duration + (index < videoScenes.length - 1 ? sceneGapSeconds : 3))
  : sceneWords.map((count) => minimumScene + weightedPool * count / totalWords);
if (Math.abs(durations.reduce((sum, duration) => sum + duration, 0) - totalDuration) > 0.25) {
  throw new Error("Scene timings do not reconcile with the measured narration duration.");
}

let cursor = 0;
let captionIndex = 1;
const captions: string[] = [];
for (let sceneIndex = 0; sceneIndex < videoScenes.length; sceneIndex += 1) {
  const scene = videoScenes[sceneIndex]!;
  const words = scene.narration.split(/\s+/).filter(Boolean);
  const groups = chunks(words);
  const sceneDuration = durations[sceneIndex]!;
  const captionDuration = spokenDurations?.[sceneIndex] ?? sceneDuration;
  let sceneCursor = cursor;
  for (const group of groups) {
    const share = captionDuration * group.length / words.length;
    captions.push(String(captionIndex), `${formatTime(sceneCursor)} --> ${formatTime(sceneCursor + share)}`, group.join(" "), "");
    captionIndex += 1;
    sceneCursor += share;
  }
  cursor += sceneDuration;
}
const captionPath = path.join(outputRoot, "captions.srt");
await writeFile(captionPath, `${captions.join("\n")}\n`, "utf8");

const inputs: string[] = [];
const filters: string[] = [];
for (let index = 0; index < videoScenes.length; index += 1) {
  const duration = durations[index]!;
  inputs.push("-loop", "1", "-framerate", "30", "-t", duration.toFixed(3), "-i", path.join(stillRoot, videoScenes[index]!.still));
  const direction = index % 2 === 0 ? "0.00011" : "0.00008";
  filters.push(`[${index}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(max(zoom,pzoom)+${direction},1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`);
}
filters.push(`${videoScenes.map((_, index) => `[v${index}]`).join("")}concat=n=${videoScenes.length}:v=1:a=0,format=yuv420p[vout]`);
const baseVideo = path.join(outputRoot, "picture.mp4");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", baseVideo]);

const output = path.join(outputRoot, silentPreview ? "hydratrace-demo-silent.mp4" : "hydratrace-demo-final.mp4");
const subtitleFilter = "subtitles=generated/video/captions.srt:force_style='FontName=Arial,FontSize=14,PrimaryColour=&H00F4F8F7,OutlineColour=&H00101618,BorderStyle=3,BackColour=&H99071012,Outline=1,Shadow=0,MarginV=28,Alignment=2'";
const audioInputs = silentPreview
  ? ["-f", "lavfi", "-t", totalDuration.toFixed(3), "-i", "anoisesrc=color=pink:sample_rate=48000"]
  : ["-i", narrationPath, "-f", "lavfi", "-t", totalDuration.toFixed(3), "-i", "anoisesrc=color=pink:sample_rate=48000"];
const voiceIndex = 1;
const bedIndex = silentPreview ? 1 : 2;
const audioFilter = silentPreview
  ? `[${bedIndex}:a]highpass=f=55,lowpass=f=720,volume=0.012,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, totalDuration - 3).toFixed(2)}:d=3[aout]`
  : `[${voiceIndex}:a]highpass=f=70,acompressor=threshold=-18dB:ratio=2.2:attack=12:release=180,loudnorm=I=-16:TP=-1.5:LRA=7[voice];[${bedIndex}:a]highpass=f=55,lowpass=f=720,volume=0.009,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, totalDuration - 3).toFixed(2)}:d=3[bed];[voice][bed]amix=inputs=2:duration=longest:weights='1 0.18':normalize=0[aout]`;
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", baseVideo, ...audioInputs, "-filter_complex", `[0:v]${subtitleFilter}[vout];${audioFilter}`, "-map", "[vout]", "-map", "[aout]", "-t", totalDuration.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);

await writeFile(path.join(outputRoot, "render-metadata.json"), `${JSON.stringify({ renderedAt: new Date().toISOString(), silentPreview, narrationDuration, totalDuration, scenes: videoScenes.map((scene, index) => ({ id: scene.id, still: scene.still, duration: Number(durations[index]!.toFixed(3)) })), captions: captionIndex - 1, output }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, silentPreview, duration: Number(totalDuration.toFixed(3)), captions: captionIndex - 1, output }, null, 2));
