import { animatedRigPose, expressionsForPose } from "./character";
import {
  layerAt,
  poseProperties,
  type Layer,
  type Scene,
  type Project,
  type AnimProperty,
} from "./model";
import type { Pose } from "../assets/louis-animation-pack/rig/runtime.mjs";
export type Point = { x: number; y: number };
export const effectorLabels = {
  hand_R: "Right wrist",
  hand_L: "Left wrist",
  foot_R: "Right ankle",
  foot_L: "Left ankle",
} as const;
export type Effector = keyof typeof effectorLabels;
export const jointProps: Record<string, readonly [AnimProperty, AnimProperty]> =
  {
    pelvis: ["pelvisX", "pelvisY"],
    hand_R: ["handRX", "handRY"],
    hand_L: ["handLX", "handLY"],
    foot_R: ["footRX", "footRY"],
    foot_L: ["footLX", "footLY"],
  };
export const poseLabels: Record<
  keyof typeof import("./model").poseFields,
  string
> = {
  pelvisX: "Hip X",
  pelvisY: "Hip Y",
  bodyLean: "Body lean",
  handRX: "Right wrist X",
  handRY: "Right wrist Y",
  handLX: "Left wrist X",
  handLY: "Left wrist Y",
  footRX: "Right ankle X",
  footRY: "Right ankle Y",
  footLX: "Left ankle X",
  footLY: "Left ankle Y",
  rightArmBend: "Right elbow bend",
  leftArmBend: "Left elbow bend",
  rightLegBend: "Right knee bend",
  leftLegBend: "Left knee bend",
  upperArmLength: "Upper arm length",
  forearmLength: "Forearm length",
  thighLength: "Thigh length",
  shinLength: "Shin length",
  rightHandAngle: "Right hand angle",
  leftHandAngle: "Left hand angle",
  propAngle: "Built-in prop angle",
};
export function layerPoint(l: Layer, p: Point): Point {
  const a = (l.rotation * Math.PI) / 180,
    x = (p.x - l.props.width * l.anchor.x) * l.scale,
    y = (p.y - l.props.height * l.anchor.y) * l.scale;
  return {
    x: l.x + x * Math.cos(a) - y * Math.sin(a),
    y: l.y + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function inverseLayerPoint(l: Layer, p: Point): Point {
  const a = (l.rotation * Math.PI) / 180,
    x = (p.x - l.x) / l.scale,
    y = (p.y - l.y) / l.scale;
  return {
    x: x * Math.cos(a) + y * Math.sin(a) + l.props.width * l.anchor.x,
    y: -x * Math.sin(a) + y * Math.cos(a) + l.props.height * l.anchor.y,
  };
}
export function rigToWorld(l: Layer, p: Point): Point {
  return layerPoint(l, {
    x: (p.x * l.props.width) / 1536,
    y: (p.y * l.props.height) / 1408,
  });
}
export function worldToRig(l: Layer, p: Point): Point {
  const q = inverseLayerPoint(l, p);
  return { x: (q.x * 1536) / l.props.width, y: (q.y * 1408) / l.props.height };
}
export function rigJoints(p: Pose): Record<string, Point> {
  const result: Record<string, Point> = {};
  for (const [key, v] of Object.entries(p.attachments))
    if (v) result[key] = { x: v.x, y: v.y };
  for (const side of ["R", "L"])
    for (const [name, part] of [
      ["shoulder", "upper_arm"],
      ["elbow", "forearm"],
      ["hip", "thigh"],
      ["knee", "shin"],
    ]) {
      const q = p.parts.find((p) => p.name === part + "_" + side);
      if (q) result[name + "_" + side] = { x: q.x, y: q.y };
    }
  return result;
}
export function contactActive(
  c: Layer["props"]["rigConstraints"][number],
  raw: Layer,
  scene: Scene,
  time: number,
) {
  const t = time - scene.start - raw.start;
  return (
    time >= scene.start &&
    time < scene.start + scene.duration &&
    raw.visible &&
    t >= 0 &&
    t < raw.duration &&
    t >= c.start &&
    t < c.end
  );
}
// One resolver supplies preview, contact handles and export. All transforms are functions of time.
export function evaluateRigScene(scene: Scene, time: number) {
  const layers = new Map<string, Layer>(),
    poses = new Map<string, Pose>(),
    busy = new Set<string>(),
    warnings: string[] = [];
  const active = (l: Layer) =>
    time >= scene.start &&
    time < scene.start + scene.duration &&
    l.visible &&
    time >= scene.start + l.start &&
    time < scene.start + l.start + l.duration;
  const rawById = new Map(scene.layers.map((l) => [l.id, l]));
  const base = (l: Layer) => layerAt(l, time - scene.start - l.start);
  const getLayer = (id: string): Layer | undefined => {
    if (layers.has(id)) return layers.get(id);
    const raw = rawById.get(id);
    if (!raw) return;
    let at = base(raw);
    const mark = "layer:" + id;
    if (busy.has(mark)) {
      warnings.push("Circular prop contact: " + raw.name);
      return at;
    }
    busy.add(mark);
    const owner = scene.layers
      .flatMap((r) =>
        r.type === "rig"
          ? r.props.rigConstraints
              .filter(
                (c) =>
                  c.kind === "carry" &&
                  c.targetLayerId === id &&
                  contactActive(c, r, scene, time),
              )
              .map((c) => ({ r, c }))
          : [],
      )
      .at(-1);
    if (owner && active(raw)) {
      const actor = getLayer(owner.r.id)!;
      const pose = getPose(owner.r.id);
      const hand = pose?.attachments[owner.c.effector];
      if (hand) {
        const world = rigToWorld(actor, hand),
          part = pose!.parts.find((p) => p.name === owner.c.effector);
        if (owner.c.followRotation)
          at = {
            ...at,
            rotation:
              actor.rotation + (part?.rotation || 0) + owner.c.rotationOffset,
          };
        const grip = layerPoint(
          { ...at, x: 0, y: 0 },
          {
            x: owner.c.targetX * at.props.width,
            y: owner.c.targetY * at.props.height,
          },
        );
        at = { ...at, x: world.x - grip.x, y: world.y - grip.y };
      }
    }
    busy.delete(mark);
    layers.set(id, at);
    return at;
  };
  const getPose = (id: string): Pose | undefined => {
    if (poses.has(id)) return poses.get(id);
    const raw = rawById.get(id);
    if (!raw || raw.type !== "rig") return;
    const at = getLayer(id)!;
    const local = time - scene.start - raw.start,
      mark = "pose:" + id;
    if (busy.has(mark)) {
      warnings.push("Circular hand contact: " + raw.name);
      return animatedRigPose(at, local, raw);
    }
    busy.add(mark);
    const targets: Record<string, Point> = {};
    for (const c of raw.props.rigConstraints) {
      if (!contactActive(c, raw, scene, time) || c.kind === "carry") continue;
      if (c.kind === "pin")
        targets[c.effector] = worldToRig(at, { x: c.worldX, y: c.worldY });
      else {
        const target = getLayer(c.targetLayerId);
        if (target && active(rawById.get(c.targetLayerId)!))
          targets[c.effector] = worldToRig(
            at,
            layerPoint(target, {
              x: c.targetX * target.props.width,
              y: c.targetY * target.props.height,
            }),
          );
        else warnings.push("Contact target missing or out of time");
      }
    }
    const pose = animatedRigPose(at, local, raw, targets);
    busy.delete(mark);
    poses.set(id, pose);
    return pose;
  };
  for (const raw of scene.layers) {
    getLayer(raw.id);
    if (raw.type === "rig" && active(raw)) getPose(raw.id);
  }
  return { layers, poses, warnings };
}
export function poseValues(l: Layer, p: Pose) {
  const j = rigJoints(p),
    torso = p.parts.find((q) => q.name === "torso")!,
    head = p.parts.find((q) => q.name === "head")!;
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const bend = (a: Point, b: Point, m: Point) =>
    Math.sign((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x)) || 1;
  const hand = (side: string) =>
    p.parts
      .find((q) => q.name === "hand_" + side)
      ?.asset.replace("hand_" + side + "_", "") || "relaxed";
  return {
    ...Object.fromEntries(poseProperties.map((k) => [k, l.props[k]])),
    pelvisX: j.pelvis.x,
    pelvisY: j.pelvis.y,
    bodyLean: torso.rotation,
    handRX: j.hand_R.x,
    handRY: j.hand_R.y,
    handLX: j.hand_L.x,
    handLY: j.hand_L.y,
    footRX: j.foot_R.x,
    footRY: j.foot_R.y,
    footLX: j.foot_L.x,
    footLY: j.foot_L.y,
    rightArmBend: bend(j.shoulder_R, j.hand_R, j.elbow_R),
    leftArmBend: bend(j.shoulder_L, j.hand_L, j.elbow_L),
    rightLegBend: bend(j.hip_R, j.foot_R, j.knee_R),
    leftLegBend: bend(j.hip_L, j.foot_L, j.knee_L),
    upperArmLength: distance(j.shoulder_R, j.elbow_R),
    forearmLength: distance(j.elbow_R, j.hand_R),
    thighLength: distance(j.hip_R, j.knee_R),
    shinLength: distance(j.knee_R, j.foot_R),
    headAngle:
      head.rotation - torso.rotation - expressionsForPose(l.props.expression),
    expression: l.props.expression,
    gazeX: l.props.gazeX,
    gazeY: l.props.gazeY,
    blink: l.props.blink,
    propAngle: p.parts.find((q) => q.name === "prop")?.rotation || 0,
    rightHand: hand("R"),
    leftHand: hand("L"),
    rigProp:
      p.parts.find((q) => q.name === "prop")?.asset.replace("prop_", "") ||
      "none",
    rightHandAngle:
      l.props.poseMode === "authored" ? l.props.rightHandAngle : 0,
    leftHandAngle: l.props.poseMode === "authored" ? l.props.leftHandAngle : 0,
  } as Project["poses"][number]["values"];
}
export function putKey(
  l: Layer,
  prop: AnimProperty,
  time: number,
  value: number | string,
  easing: "linear" | "ease-in-out" = "ease-in-out",
) {
  const keys = l.keyframes[prop] || [];
  const key = keys.find((k) => Math.abs(k.time - time) < 0.0001);
  if (key) key.value = value;
  else keys.push({ time: Math.max(0, time), value, easing });
  l.keyframes[prop] = keys;
}
export function recordPose(
  l: Layer,
  time: number,
  values: Project["poses"][number]["values"],
) {
  if (!l.keyframes.poseMode?.length && time > 0)
    putKey(l, "poseMode", 0, l.props.poseMode, "linear");
  putKey(l, "poseMode", time, "authored", "linear");
  for (const [key, value] of Object.entries(values))
    putKey(l, key as AnimProperty, time, value);
}
