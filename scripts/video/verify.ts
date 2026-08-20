import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve("generated", "video");
const preview = process.argv.includes("--silent-preview");
const videoPath = path.join(outputRoot, preview ? "hydratrace-demo-silent.mp4" : "hydratrace-demo-final.mp4");

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate", "-of", "json", videoPath], { encoding: "utf8" });
if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr}`);
const data = JSON.parse(probe.stdout) as { format: { duration: string; size: string }; streams: Array<Record<string, string | number>> };
const duration = Number(data.format.duration);
const video = data.streams.find((stream) => stream.codec_type === "video");
const audio = data.streams.find((stream) => stream.codec_type === "audio");
if (!video || video.codec_name !== "h264" || video.width !== 1920 || video.height !== 1080) throw new Error("Final video must be 1920x1080 H.264.");
if (!audio || audio.codec_name !== "aac" || audio.sample_rate !== "48000") throw new Error("Final video must contain 48 kHz AAC audio.");
if (duration < 90 || duration > 165) throw new Error(`Video duration ${duration.toFixed(2)}s is outside the 90–165 second submission window.`);
const file = await stat(videoPath);
if (file.size < 2_000_000) throw new Error(`Video file is unexpectedly small (${file.size} bytes).`);

let voiceQuality: number | undefined;
let loudness: { integratedLufs: number; truePeakDbfs: number; rangeLu: number } | undefined;
if (!preview) {
  const metadata = JSON.parse(await readFile(path.join(outputRoot, "voice-metadata.json"), "utf8")) as { wordErrorRate: number; maximumAggregateWer?: number };
  voiceQuality = metadata.wordErrorRate;
  const maximumAggregateWer = metadata.maximumAggregateWer ?? 0.08;
  if (voiceQuality > maximumAggregateWer) throw new Error(`ASR word error rate ${voiceQuality} exceeds the ${maximumAggregateWer} quality gate.`);
  const loudnessProbe = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", videoPath, "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (loudnessProbe.status !== 0) throw new Error(`FFmpeg loudness analysis failed: ${loudnessProbe.stderr.slice(-1_000)}`);
  const start = loudnessProbe.stderr.lastIndexOf("{");
  const end = loudnessProbe.stderr.indexOf("}", start);
  if (start < 0 || end < 0) throw new Error("FFmpeg did not return loudness measurements.");
  const measurement = JSON.parse(loudnessProbe.stderr.slice(start, end + 1)) as { input_i: string; input_tp: string; input_lra: string };
  loudness = { integratedLufs: Number(measurement.input_i), truePeakDbfs: Number(measurement.input_tp), rangeLu: Number(measurement.input_lra) };
  if (!Number.isFinite(loudness.integratedLufs) || loudness.integratedLufs < -18 || loudness.integratedLufs > -14) throw new Error(`Integrated loudness ${loudness.integratedLufs} LUFS is outside the -18 to -14 LUFS delivery range.`);
  if (!Number.isFinite(loudness.truePeakDbfs) || loudness.truePeakDbfs > -1) throw new Error(`True peak ${loudness.truePeakDbfs} dBFS exceeds the -1 dBFS ceiling.`);
  if (!Number.isFinite(loudness.rangeLu) || loudness.rangeLu > 12) throw new Error(`Loudness range ${loudness.rangeLu} LU is too wide for clear online playback.`);
}
const textArtifacts = await Promise.all(["capture.json", "render-metadata.json", ...(preview ? [] : ["voice-metadata.json", "asr-transcript.txt"])].map((name) => readFile(path.join(outputRoot, name), "utf8")));
if (textArtifacts.some((contents) => /tp-[a-z0-9]{20,}/i.test(contents))) throw new Error("A token-like secret was found in generated video metadata.");

console.log(JSON.stringify({ ok: true, preview, durationSeconds: Number(duration.toFixed(3)), bytes: file.size, video: { codec: video.codec_name, width: video.width, height: video.height, frameRate: video.r_frame_rate }, audio: { codec: audio.codec_name, sampleRate: audio.sample_rate, loudness }, asrWordErrorRate: voiceQuality, output: videoPath }, null, 2));
