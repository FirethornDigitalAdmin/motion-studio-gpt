import { styleAt, type Layer } from "./model";
import { blinkAt } from "./character";
import { expressions } from "../assets/louis-animation-pack/rig/runtime.mjs";

// Registrations describe the original drawing. Eyeballs never change size.
export const faceTemplates = {
  "Louis portrait": {
    eyes: [
      { x: 479 / 1024, y: 203 / 1536, rx: 32 / 1024, ry: 32 / 1536 },
      { x: 560 / 1024, y: 197 / 1536, rx: 28 / 1024, ry: 28 / 1536 },
    ],
  },
  "Louis shrug": {
    eyes: [
      { x: 461 / 1024, y: 199 / 1536, rx: 32 / 1024, ry: 31 / 1536 },
      { x: 544 / 1024, y: 185 / 1536, rx: 29 / 1024, ry: 29 / 1536 },
    ],
  },
  "Patch portrait": {
    eyes: [
      { x: 443 / 1024, y: 212 / 1536, rx: 27 / 1024, ry: 30 / 1536 },
      { x: 521 / 1024, y: 214 / 1536, rx: 31 / 1024, ry: 31 / 1536 },
    ],
  },
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function facialActing(raw: Layer, time: number, globalTime: number) {
  const keys = [...(raw.keyframes.expression || [])].sort(
    (a, b) => a.time - b.time,
  );
  let index = -1;
  for (let i = 0; i < keys.length; i++) if (keys[i].time <= time) index = i;
  const name = styleAt(raw, "expression", time);
  const previous =
    index > 0 ? String(keys[index - 1].value) : raw.props.expression;
  const amount = index >= 0 ? clamp((time - keys[index].time) / 0.24) : 1;
  const f = amount * amount * (3 - 2 * amount);
  const a = expressions[previous] || expressions.neutral;
  const b = expressions[name] || expressions.neutral;
  const mix = (i: number) => Number(a[i]) + (Number(b[i]) - Number(a[i])) * f;
  const base = clamp(1 - mix(2));
  const asymmetry = name === "sceptical" || name === "confused" ? 0.18 * f : 0;
  const automatic = raw.props.autoBlink
    ? blinkAt((globalTime + (raw.props.actor === "Patch" ? 0.83 : 0)) % 29.7)
    : 0;
  return {
    closures: [
      Math.max(base + asymmetry, automatic),
      Math.max(base - asymmetry, automatic),
    ].map(clamp),
    brow: [mix(0), mix(1)],
  };
}
