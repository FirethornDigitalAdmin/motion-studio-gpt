import { z } from "zod";
import { mouthShapeSchema, styleAt, type Layer, type Project } from "./model";
import { audioClips } from "./audio";
import { putKey } from "./rigging";
export const speechCueSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    value: mouthShapeSchema.exclude(["auto"]),
  })
  .strict()
  .refine((c) => c.end > c.start, {
    message: "A mouth cue must end after it starts",
  });
export type SpeechCue = z.infer<typeof speechCueSchema>;
export const lipSyncInputSchema = z
  .object({
    audioLayerId: z.string().min(1),
    transcript: z.string().max(5000).optional(),
    cues: z.array(speechCueSchema).min(1).max(5000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.cues?.length || v.transcript?.trim()), {
    message: "Provide a transcript or timed mouth cues",
  });
// A spelling-based draft, deliberately distinct from an imported phonetic alignment.
export function spellingShapes(text: string): SpeechCue["value"][] {
  const tokens = text.toLowerCase().match(/th|sh|ch|ng|oo|ee|ou|[a-z]/g) || [];
  return tokens.map((t) =>
    /^(m|b|p)$/.test(t)
      ? "PP"
      : /^(f|v)$/.test(t)
        ? "FF"
        : t === "th"
          ? "TH"
          : /^(t|d)$/.test(t)
            ? "DD"
            : /^(k|g|c|q)$/.test(t)
              ? "kk"
              : /^(ch|sh|j)$/.test(t)
                ? "CH"
                : /^(s|z)$/.test(t)
                  ? "SS"
                  : /^(n|l|ng)$/.test(t)
                    ? "nn"
                    : t === "r"
                      ? "RR"
                      : t === "a"
                        ? "aa"
                        : /^(e|ee)$/.test(t)
                          ? "E"
                          : /^(i|y)$/.test(t)
                            ? "I"
                            : /^(o|ou)$/.test(t)
                              ? "O"
                              : /^(u|oo|w)$/.test(t)
                                ? "U"
                                : "aa",
  );
}
export function validateCues(input: unknown): SpeechCue[] {
  const cues = z
    .array(speechCueSchema)
    .min(1)
    .max(5000)
    .parse(input)
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < cues.length; i++)
    if (cues[i].start < cues[i - 1].end - 0.000001)
      throw new Error("Mouth cues overlap");
  return cues;
}
// Explicit support for Rhubarb mouthCues and ElevenLabs character timestamps.
export function parseSpeechAlignment(json: string): SpeechCue[] {
  const value = JSON.parse(json);
  if (Array.isArray(value)) return validateCues(value);
  if (value.cues) return validateCues(value.cues);
  if (value.mouthCues) {
    const shapes: Record<string, SpeechCue["value"]> = {
      A: "PP",
      B: "kk",
      C: "E",
      D: "aa",
      E: "O",
      F: "U",
      G: "FF",
      H: "nn",
      X: "sil",
    };
    return validateCues(
      value.mouthCues.map(
        (c: { start: number; end: number; value: string }) => ({
          ...c,
          value: shapes[c.value],
        }),
      ),
    );
  }
  const a = value.alignment || value;
  const schema = z.object({
    characters: z.array(z.string()).max(5000),
    character_start_times_seconds: z.array(z.number().nonnegative()),
    character_end_times_seconds: z.array(z.number().nonnegative()),
  });
  const parsed = schema.parse(a);
  if (
    parsed.characters.length !== parsed.character_start_times_seconds.length ||
    parsed.characters.length !== parsed.character_end_times_seconds.length
  )
    throw new Error("Character timing arrays must have equal lengths");
  const cues = parsed.characters.flatMap((c, i) => {
    const start = parsed.character_start_times_seconds[i],
      end = parsed.character_end_times_seconds[i];
    return end > start
      ? [
          {
            start,
            end,
            value: spellingShapes(c)[0] || ("sil" as SpeechCue["value"]),
          },
        ]
      : [];
  });
  return validateCues(cues);
}
export function bakeLipSync(project: Project, layerId: string, input: unknown) {
  const request = lipSyncInputSchema.parse(input);
  const scene = project.scenes.find((s) =>
      s.layers.some((l) => l.id === layerId),
    ),
    layer = scene?.layers.find((l) => l.id === layerId);
  if (!scene || !layer || !["rig", "image"].includes(layer.type))
    throw new Error("Lip sync needs an image or rig character");
  if (layer.locked) throw new Error("Character is locked");
  const clip = audioClips(project).find(
    (c) => c.layer.id === request.audioLayerId,
  );
  if (!clip || !scene.layers.some((l) => l.id === request.audioLayerId))
    throw new Error("Choose audible speech in the character’s scene");
  const actorStart = scene.start + layer.start,
    sourceOffset = clip.layer.props.audioOffset;
  const begin = Math.max(0, clip.start - actorStart),
    end = Math.min(layer.duration, clip.start + clip.duration - actorStart);
  if (end <= begin) throw new Error("Speech and character do not overlap");
  let cues: SpeechCue[];
  if (request.cues) cues = validateCues(request.cues);
  else {
    const shapes = spellingShapes(request.transcript!);
    if (!shapes.length) throw new Error("Transcript needs spoken words");
    const step = 1 / (clip.asset.envelopeRate || 60),
      spans: { start: number; end: number }[] = [];
    for (let t = sourceOffset; t < sourceOffset + clip.duration; t += step) {
      const energy = clip.asset.envelope?.[Math.floor(t / step)] ?? 1;
      if (energy < 0.09) continue;
      const last = spans.at(-1),
        stop = Math.min(t + step, sourceOffset + clip.duration);
      if (last && t - last.end < step * 0.2) last.end = stop;
      else spans.push({ start: t, end: stop });
    }
    const total = spans.reduce((s, c) => s + c.end - c.start, 0);
    if (!total) throw new Error("No voiced audio was detected");
    let elapsed = 0;
    cues = [];
    for (const span of spans) {
      let t = span.start;
      while (t < span.end - 0.000001) {
        const index = Math.min(
          shapes.length - 1,
          Math.floor((elapsed / total) * shapes.length + 0.000001),
        );
        const length = Math.min(
          span.end - t,
          ((index + 1) * total) / shapes.length - elapsed,
        );
        if (length <= 0.000001) break;
        cues.push({ start: t, end: t + length, value: shapes[index] });
        t += length;
        elapsed += length;
      }
    }
  }
  const mapped = cues
    .map((c) => ({
      ...c,
      start: Math.max(begin, clip.start - actorStart + c.start - sourceOffset),
      end: Math.min(end, clip.start - actorStart + c.end - sourceOffset),
    }))
    .filter((c) => c.end > c.start);
  if (!mapped.length)
    throw new Error("Aligned cues do not overlap the audible clip");
  const keys = layer.keyframes.mouthShape || [];
  // Anchor the preceding performance so the first style key cannot backfill earlier frames.
  const before = styleAt(layer, "mouthShape", Math.max(0, begin - 0.000001));
  layer.keyframes.mouthShape = keys.filter(
    (k) => k.time < begin || k.time > end,
  );
  if (begin > 0 && !layer.keyframes.mouthShape.some((k) => k.time === 0))
    putKey(layer, "mouthShape", 0, before, "linear");
  putKey(layer, "mouthShape", begin, "sil", "linear");
  for (const c of mapped) {
    putKey(layer, "mouthShape", c.start, c.value, "linear");
    putKey(layer, "mouthShape", c.end, "sil", "linear");
  }
  putKey(layer, "mouthShape", end, "sil", "linear");
  layer.props.mouthEnabled = true;
  return {
    count: mapped.length,
    begin,
    end,
    mode: request.cues ? "Aligned timing" : "Transcript draft",
  };
}
export function recordBlink(layer: Layer, time: number) {
  if (layer.locked) throw new Error("Character is locked");
  if (time < 0 || time + 0.28 > layer.duration)
    throw new Error("A blink needs 0.28 seconds inside this character");
  if (time > 0 && !layer.keyframes.blink?.length)
    putKey(layer, "blink", 0, layer.props.blink, "linear");
  for (const [offset, value] of [
    [0, 0],
    [0.085, 1],
    [0.135, 1],
    [0.28, 0],
  ])
    putKey(layer, "blink", time + offset, value, "ease-in-out");
}
