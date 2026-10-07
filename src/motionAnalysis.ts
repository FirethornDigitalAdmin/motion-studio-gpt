import {
  layerSchema,
  valueAt,
  properties,
  type Layer,
  type Property,
  type Project,
  type Scene,
} from "./model";
import {
  contactActive,
  evaluateRigScene,
  rigToWorld,
  type Point,
} from "./rigging";
export function curveKeys(layer: Layer, property: Property) {
  return [...(layer.keyframes[property] || [])].sort((a, b) => a.time - b.time);
}
export function moveCurveKey(
  layer: Layer,
  property: Property,
  originalTime: number,
  time: number,
  value: number,
  fps: number,
) {
  const key = layer.keyframes[property]?.find(
    (k) => Math.abs(k.time - originalTime) < 1e-7,
  );
  if (!key) throw new Error("The selected key no longer exists");
  if (layer.locked) throw new Error("Layer is locked");
  const t =
    Math.abs(time - originalTime) < 1e-8
      ? originalTime
      : Math.max(0, Math.min(layer.duration, Math.round(time * fps) / fps));
  if (
    layer.keyframes[property].some(
      (k) => k !== key && Math.abs(k.time - t) < 1e-7,
    )
  )
    throw new Error("Another key occupies that frame");
  const schema =
    property === "anchorX" || property === "anchorY"
      ? null
      : property in layerSchema.shape.props.shape
        ? layerSchema.shape.props.shape[
            property as keyof typeof layerSchema.shape.props.shape
          ]
        : property in layerSchema.shape
          ? layerSchema.shape[property as keyof typeof layerSchema.shape]
          : null;
  if (!Number.isFinite(value) || (schema && !schema.safeParse(value).success))
    throw new Error("Value is outside the supported range");
  const candidate = structuredClone(layer);
  const next = candidate.keyframes[property].find((k) => k.time === key.time)!;
  next.time = t;
  next.value = value;
  layerSchema.parse(candidate);
  key.time = t;
  key.value = value;
  return t;
}
export function graphSamples(layer: Layer, property: Property, count = 161) {
  return Array.from({ length: count }, (_, i) => {
    const time = (layer.duration * i) / (count - 1);
    return { time, value: valueAt(layer, property, time) };
  });
}
export type MotionIssue = {
  kind: "reach" | "pin" | "contact" | "speed" | "keys";
  severity: "warning" | "info";
  layerId: string;
  time: number;
  message: string;
  amount?: number;
};
export function motionFrame(
  scene: Scene,
  time: number,
  speedLimit: number,
  previous?: { time: number; points: Map<string, Point> },
) {
  const result = evaluateRigScene(scene, time),
    issues: MotionIssue[] = [],
    points = new Map<string, Point>();
  for (const warning of result.warnings)
    issues.push({
      kind: "contact",
      severity: "warning",
      layerId: "",
      time,
      message: warning,
    });
  for (const [id, pose] of result.poses) {
    const raw = scene.layers.find((l) => l.id === id)!,
      at = result.layers.get(id)!;
    for (const [joint, error] of Object.entries(pose.ikError))
      if (error > 1)
        issues.push({
          kind: "reach",
          severity: "warning",
          layerId: id,
          time,
          message: `${raw.name}: ${joint.replaceAll("_", " ")} target is ${error.toFixed(1)} rig pixels beyond reach`,
          amount: error,
        });
    for (const c of raw.props.rigConstraints) {
      if (c.kind !== "pin" || !contactActive(c, raw, scene, time)) continue;
      const point = pose.attachments[c.effector];
      if (!point) continue;
      const actual = rigToWorld(at, point),
        error = Math.hypot(actual.x - c.worldX, actual.y - c.worldY);
      if (error > 2)
        issues.push({
          kind: "pin",
          severity: "warning",
          layerId: id,
          time,
          message: `${raw.name}: pinned ${c.effector.replaceAll("_", " ")} misses its contact by ${error.toFixed(1)} scene pixels`,
          amount: error,
        });
    }
    for (const name of ["head", "hand_R", "hand_L", "foot_R", "foot_L"]) {
      const point = pose.attachments[name];
      if (!point) continue;
      const world = rigToWorld(at, point),
        key = id + ":" + name;
      points.set(key, world);
      const old = previous?.points.get(key),
        dt = time - (previous?.time ?? time);
      if (old && dt > 0) {
        const speed = Math.hypot(world.x - old.x, world.y - old.y) / dt;
        if (speed > speedLimit)
          issues.push({
            kind: "speed",
            severity: "info",
            layerId: id,
            time,
            message: `${raw.name}: fast ${name.replaceAll("_", " ")} movement (${Math.round(speed)} scene pixels/s)`,
            amount: speed,
          });
      }
    }
  }
  return { issues, time, points };
}
export function keyIssues(scene: Scene): MotionIssue[] {
  return scene.layers.flatMap((layer) =>
    Object.entries(layer.keyframes).flatMap(([property, keys]) => {
      const sorted = [...keys].sort((a, b) => a.time - b.time),
        out: MotionIssue[] = [];
      for (let i = 0; i < sorted.length; i++) {
        const key = sorted[i];
        if (key.time > layer.duration)
          out.push({
            kind: "keys",
            severity: "info",
            layerId: layer.id,
            time: scene.start + layer.start + layer.duration,
            message: `${layer.name}: ${property} key at ${key.time.toFixed(2)}s is outside this layer’s duration`,
          });
        if (i && key.time - sorted[i - 1].time < 1e-7)
          out.push({
            kind: "keys",
            severity: "warning",
            layerId: layer.id,
            time: scene.start + layer.start + key.time,
            message: `${layer.name}: duplicate ${property} keys at ${key.time.toFixed(2)}s`,
          });
      }
      return out;
    }),
  );
}
export function scanTimes(
  project: Project,
  scene: Scene,
  start: number,
  end: number,
  rate: number,
) {
  const begin = Math.max(scene.start, start),
    stop = Math.min(
      scene.start + scene.duration,
      project.settings.durationSec,
      end,
    );
  if (stop < begin)
    throw new Error("The scan range does not overlap this scene");
  const count = Math.min(
    3600,
    Math.max(
      1,
      Math.ceil((stop - begin) * Math.min(project.settings.fps, rate)) + 1,
    ),
  );
  return Array.from(
    { length: count },
    (_, i) => begin + ((stop - begin) * i) / Math.max(1, count - 1),
  );
}
export const numericProperties = properties;
