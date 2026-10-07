import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer, layerAt, projectSchema } from "../src/model";
import { bakeLipSync, parseSpeechAlignment, recordBlink } from "../src/lipSync";
import { rigPose, blinkAt } from "../src/character";
import { applyAuthoring } from "../src/authoring";
const setup = () => {
  const p = emptyProject();
  const actor = makeLayer("rig", p),
    audio = makeLayer("audio", p);
  actor.id = "actor";
  actor.start = 1;
  actor.duration = 10;
  audio.id = "speech";
  audio.start = 2;
  audio.duration = 4;
  audio.props.assetId = "voice";
  p.scenes.push({
    id: "scene",
    name: "Scene",
    start: 3,
    duration: 15,
    layers: [actor, audio],
    shots: [],
  });
  p.settings.durationSec = 20;
  p.assets.push({
    id: "voice",
    type: "audio",
    originalName: "voice.wav",
    relativePath: "assets/voice.wav",
    hash: "a".repeat(64),
    durationSec: 8,
    envelopeRate: 10,
    envelope: Array(80).fill(0.8),
  });
  return { p, actor, audio };
};
describe("facial speech tracks", () => {
  it("places source-aligned cues in actor-local time and closes gaps", () => {
    const { p, actor, audio } = setup();
    audio.props.audioOffset = 1;
    bakeLipSync(p, actor.id, {
      audioLayerId: audio.id,
      cues: [
        { start: 1, end: 1.4, value: "PP" },
        { start: 2, end: 2.7, value: "O" },
      ],
    });
    expect(layerAt(actor, 0).props.mouthShape).toBe("auto");
    expect(layerAt(actor, 1.1).props.mouthShape).toBe("PP");
    expect(layerAt(actor, 1.8).props.mouthShape).toBe("sil");
    expect(layerAt(actor, 2.1).props.mouthShape).toBe("O");
    expect(layerAt(actor, 5).props.mouthShape).toBe("sil");
    expect(projectSchema.parse(p)).toEqual(p);
  });
  it("clips speech to actor duration and preserves keys outside the regenerated interval", () => {
    const { p, actor, audio } = setup();
    actor.duration = 3;
    actor.keyframes.mouthShape = [{ time: 0, value: "E", easing: "linear" }];
    bakeLipSync(p, actor.id, {
      audioLayerId: audio.id,
      cues: [{ start: 0, end: 4, value: "aa" }],
    });
    expect(layerAt(actor, 0).props.mouthShape).toBe("E");
    expect(actor.keyframes.mouthShape.every((k) => k.time <= 3)).toBe(true);
  });
  it("rejects overlapping cues, locked characters, silent clips and nonoverlapping alignment", () => {
    const { p, actor, audio } = setup();
    const input = {
      audioLayerId: audio.id,
      cues: [
        { start: 0, end: 2, value: "E" },
        { start: 1, end: 3, value: "O" },
      ],
    };
    expect(() => bakeLipSync(p, actor.id, input)).toThrow("overlap");
    actor.locked = true;
    expect(() =>
      bakeLipSync(p, actor.id, { audioLayerId: audio.id, transcript: "Hello" }),
    ).toThrow("locked");
    actor.locked = false;
    p.assets[0].envelope = Array(80).fill(0);
    expect(() =>
      bakeLipSync(p, actor.id, { audioLayerId: audio.id, transcript: "Hello" }),
    ).toThrow("voiced");
    expect(() =>
      bakeLipSync(p, actor.id, {
        audioLayerId: audio.id,
        cues: [{ start: 6, end: 7, value: "E" }],
      }),
    ).toThrow("overlap");
  });
  it("makes a waveform-aware transcript draft with genuine silent holds", () => {
    const { p, actor, audio } = setup();
    p.assets[0].envelope = Array.from({ length: 80 }, (_, i) =>
      i >= 10 && i < 20 ? 0 : 0.8,
    );
    const r = bakeLipSync(p, actor.id, {
      audioLayerId: audio.id,
      transcript: "Make a cup of tea",
    });
    expect(r.mode).toBe("Transcript draft");
    expect(layerAt(actor, 2.5).props.mouthShape).toBe("sil");
    expect(
      new Set(actor.keyframes.mouthShape.map((k) => k.value)).size,
    ).toBeGreaterThan(4);
  });
  it("imports exact cues and Rhubarb visemes and rejects unknown drawings", () => {
    expect(
      parseSpeechAlignment(
        JSON.stringify({
          mouthCues: [
            { start: 0, end: 0.3, value: "A" },
            { start: 0.3, end: 0.7, value: "F" },
          ],
        }),
      ).map((c) => c.value),
    ).toEqual(["PP", "U"]);
    expect(() =>
      parseSpeechAlignment('[{"start":0,"end":1,"value":"bad"}]'),
    ).toThrow();
  });
  it("uses ElevenLabs character timestamps and rejects mismatched arrays", () => {
    const a = {
      characters: ["M", "o", " "],
      character_start_times_seconds: [0, 0.1, 0.2],
      character_end_times_seconds: [0.1, 0.2, 0.3],
    };
    expect(
      parseSpeechAlignment(JSON.stringify({ alignment: a })).map(
        (c) => c.value,
      ),
    ).toEqual(["PP", "O", "sil"]);
    expect(() =>
      parseSpeechAlignment(JSON.stringify({ ...a, characters: ["a"] })),
    ).toThrow("equal lengths");
  });
  it("drives separated rig mouth art at seeked frames without stretching eyes", () => {
    const { actor } = setup();
    actor.keyframes.mouthShape = [
      { time: 0, value: "PP", easing: "linear" },
      { time: 1, value: "O", easing: "linear" },
    ];
    const a = rigPose(layerAt(actor, 0.5), 0.5, actor),
      b = rigPose(layerAt(actor, 1), 1, actor);
    expect(a.parts.find((p) => p.name === "mouth")?.asset).toBe("mouth_PP");
    expect(b.parts.find((p) => p.name === "mouth")?.asset).toBe("mouth_O");
    expect(
      a.parts.filter((p) => p.name.startsWith("eye_")).map((p) => p.width),
    ).toEqual(
      b.parts.filter((p) => p.name.startsWith("eye_")).map((p) => p.width),
    );
  });
  it("records close hold reopen and repeats natural blinks on long scenes", () => {
    const { actor } = setup();
    recordBlink(actor, 2);
    expect(layerAt(actor, 2.11).props.blink).toBe(1);
    expect(layerAt(actor, 2.28).props.blink).toBe(0);
    expect(() => recordBlink(actor, 9.9)).toThrow();
    expect(blinkAt(31.45)).toBeCloseTo(blinkAt(1.75));
  });
  it("exposes speech and blinking through an atomic validated authoring batch", () => {
    const { p } = setup();
    const input = {
      label: "Speech",
      expectedRevision: 0,
      commands: [
        {
          op: "generateLipSync",
          layerId: "actor",
          input: {
            audioLayerId: "speech",
            cues: [{ start: 0, end: 1, value: "aa" }],
          },
        },
        { op: "addBlink", layerId: "actor", time: 2 },
      ],
    };
    const result = applyAuthoring(p, input);
    expect(
      result.project.scenes[0].layers[0].keyframes.mouthShape.length,
    ).toBeGreaterThan(0);
    expect(p.scenes[0].layers[0].keyframes.mouthShape).toBeUndefined();
    expect(() =>
      applyAuthoring(p, {
        ...input,
        commands: [
          ...input.commands,
          {
            op: "setKeyframe",
            layerId: "actor",
            property: "mouthShape",
            time: 1,
            value: "bad",
          },
        ],
      }),
    ).toThrow();
    expect(p.scenes[0].layers[0].keyframes.mouthShape).toBeUndefined();
  });
});
