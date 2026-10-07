import { spawn } from "node:child_process";
import { ffmpegPath } from "./render";
import { audioClips } from "../src/audio";
import type { Project } from "../src/model";
import path from "node:path";

export async function analyseAudio(filename: string) {
  const proc = spawn(ffmpegPath(), [
    "-v",
    "error",
    "-i",
    filename,
    "-f",
    "f32le",
    "-ac",
    "1",
    "-ar",
    "16000",
    "pipe:1",
  ]);
  const chunks: Buffer[] = [];
  let error = "";
  proc.stdout.on("data", (chunk) => chunks.push(chunk));
  proc.stderr.on("data", (chunk) => (error += chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(error || "Unable to decode audio")),
    );
  });
  const data = Buffer.concat(chunks),
    count = Math.floor(data.length / 4),
    rate = 60;
  if (!count) throw new Error("Audio file is empty");
  const rms: number[] = [];
  for (let frame = 0; frame < Math.ceil((count / 16000) * rate); frame++) {
    const begin = Math.floor((frame * 16000) / rate),
      end = Math.min(count, Math.floor(((frame + 1) * 16000) / rate));
    let energy = 0;
    for (let sample = begin; sample < end; sample++)
      energy += data.readFloatLE(sample * 4) ** 2;
    rms.push(Math.sqrt(energy / Math.max(1, end - begin)));
  }
  const sorted = [...rms].sort((a, b) => a - b),
    level = Math.max(0.02, sorted[Math.floor(sorted.length * 0.9)]);
  return {
    durationSec: count / 16000,
    envelopeRate: rate,
    envelope: rms.map((n) => Math.round(Math.min(1, n / level) * 1000) / 1000),
  };
}

export function audioExportArgs(project: Project, folder: string, cached = false) {
  const clips = audioClips(project);
  if (!clips.length) return ["-an"];
  const args = clips.flatMap((clip) => [
    "-i",
    path.join(folder, cached ? path.basename(clip.asset.relativePath) : clip.asset.relativePath),
  ]);
  const filters = clips.map(
    (clip, i) =>
      `[${i + 1}:a]atrim=start=${clip.layer.props.audioOffset}:duration=${clip.duration},asetpts=PTS-STARTPTS,volume=${clip.layer.props.volume},adelay=${Math.round(clip.start * 1000)}:all=1[a${i}]`,
  );
  filters.push(
    clips.map((_, i) => `[a${i}]`).join("") +
      `amix=inputs=${clips.length}:duration=longest:normalize=0,apad,atrim=duration=${project.settings.durationSec}[mix]`,
  );
  return [
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[mix]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
  ];
}
