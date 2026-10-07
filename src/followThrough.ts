import { valueAt, styleAt, type Layer, type Property } from "./model";

export function followProperties(layer: Layer): Property[] {
  const f = layer.props.followThrough;
  return [
    ...(f.head ? ["headAngle" as const] : []),
    ...(f.arms ? (["handRX", "handRY", "handLX", "handLY"] as const) : []),
  ];
}

// Integrate the spring's impulse response over fixed delay bins. Sampling the
// authored signal rather than accumulating simulation state makes seeks and
// out-of-order export frames identical. The finite two-second tail is normalised
// so a resting character never drifts.
export function followValue(layer: Layer, property: Property, time: number) {
  const f = layer.props.followThrough;
  const current = valueAt(layer, property, time);
  if (
    !f.enabled ||
    f.strength === 0 ||
    !followProperties(layer).includes(property) ||
    styleAt(layer, "poseMode", time) !== "authored" ||
    !layer.keyframes[property]?.length
  )
    return current;
  const omega = 2 * Math.PI * f.frequency;
  const response = (t: number) => {
    if (f.damping >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
    const q = Math.sqrt(1 - f.damping ** 2),
      w = omega * q;
    return (
      1 -
      Math.exp(-f.damping * omega * t) *
        (Math.cos(w * t) + (f.damping / q) * Math.sin(w * t))
    );
  };
  let sum = 0,
    total = 0,
    previous = 0;
  for (let i = 1; i <= 120; i++) {
    const next = response(i / 60),
      weight = next - previous;
    const t = Math.max(0, time - (i - 0.5) / 60);
    // A preset/authored mode boundary starts a new performance; don't drag
    // unrelated coordinates from the preceding action into it.
    const v =
      styleAt(layer, "poseMode", t) === "authored"
        ? valueAt(layer, property, t)
        : current;
    sum += weight * v;
    total += weight;
    previous = next;
  }
  return current + f.strength * (sum / total - current);
}

export function followedLayer(at: Layer, raw: Layer, time: number): Layer {
  if (!raw.props.followThrough.enabled || at.props.poseMode !== "authored")
    return at;
  const props = { ...at.props };
  for (const p of followProperties(raw))
    (props as unknown as Record<string, unknown>)[p] = followValue(
      raw,
      p,
      time,
    );
  return { ...at, props };
}

export function bakeFollowThrough(layer: Layer, fps: number) {
  if (layer.locked) throw new Error("Unlock this character before baking.");
  if (!layer.props.followThrough.enabled)
    throw new Error("Enable follow-through before baking.");
  if (!Number.isInteger(fps) || fps < 1 || fps > 120)
    throw new Error("Invalid frame rate.");
  const frames = Math.ceil(layer.duration * fps);
  if (frames > 18000) throw new Error("Bake up to 18,000 frames at a time.");
  const result = structuredClone(layer);
  for (const p of followProperties(layer)) {
    if (!layer.keyframes[p]?.length) continue;
    const times = new Set(
      Array.from({ length: frames + 1 }, (_, i) =>
        Math.min(i / fps, layer.duration),
      ),
    );
    // Preserve authored timing between frames, including mode boundaries.
    for (const k of [
      ...layer.keyframes[p],
      ...(layer.keyframes.poseMode || []),
    ])
      if (k.time <= layer.duration) times.add(k.time);
    result.keyframes[p] = [...times]
      .sort((a, b) => a - b)
      .map((time) => ({
        time,
        value: followValue(layer, p, time),
        easing: "linear" as const,
      }));
  }
  result.props.followThrough.enabled = false;
  return result;
}
