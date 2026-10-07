import { it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { emptyProject, makeLayer, projectSchema } from "../src/model";
import { audioClips, mouthOpeningAt } from "../src/audio";
import { audioExportArgs } from "../server/audio";
Object.defineProperty(globalThis, "crypto", { value: webcrypto });
function fixture() {
  const p = emptyProject();
  p.settings.durationSec = 12;
  p.assets.push({
    id: "voice",
    originalName: "voice.wav",
    relativePath: "assets/voice.wav",
    hash: "0".repeat(64),
    type: "audio",
    durationSec: 5,
    envelopeRate: 2,
    envelope: [0, 0, 1, 1, 0, 0, 0.8, 0.8, 0, 0],
  });
  const layer = makeLayer("audio", p);
  layer.start = 1;
  layer.duration = 10;
  layer.props.assetId = "voice";
  layer.props.actor = "Louis";
  p.scenes.push({
    id: "scene",
    name: "Scene",
    start: 2,
    duration: 6,
    shots: [],
    layers: [layer],
  });
  return { p, layer };
}
it("clips speech to its source, scene and project boundaries", () => {
  const { p, layer } = fixture();
  expect(audioClips(p)[0]).toMatchObject({ start: 3, duration: 5 });
  layer.props.audioOffset = 2;
  expect(audioClips(p)[0].duration).toBe(3);
  p.settings.durationSec = 4;
  expect(audioClips(p)[0].duration).toBe(1);
});
it("opens only the speaking actor's mouth and respects pauses, trim and mute", () => {
  const { p, layer } = fixture();
  expect(mouthOpeningAt(p, "Louis", 2.9)).toBe(0);
  expect(mouthOpeningAt(p, "Patch", 4)).toBe(0);
  expect(mouthOpeningAt(p, "Louis", 4)).toBe(1);
  expect(mouthOpeningAt(p, "Louis", 5)).toBe(0);
  layer.props.audioOffset = 2;
  expect(mouthOpeningAt(p, "Louis", 4)).toBeGreaterThan(0.8);
  layer.visible = false;
  expect(mouthOpeningAt(p, "Louis", 4)).toBe(0);
  layer.visible = true;
  layer.props.volume = 0;
  expect(audioClips(p)).toEqual([]);
});
it("builds the same trimmed, delayed voice mix for MP4", () => {
  const { p, layer } = fixture();
  layer.props.audioOffset = 1;
  layer.props.volume = 0.7;
  const args = audioExportArgs(p, "/project");
  expect(args).toContain("/project/assets/voice.wav");
  expect(args.join(" ")).toContain("atrim=start=1:duration=4");
  expect(args.join(" ")).toContain("volume=0.7,adelay=3000:all=1");
  expect(args.join(" ")).toContain("atrim=duration=12");
  expect(args).toContain("aac");
  expect(projectSchema.parse(p).assets[0].envelope).toHaveLength(10);
});
