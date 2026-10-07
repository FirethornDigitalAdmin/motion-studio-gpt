import {
  sample,
  clips,
  expressions,
  type RigPart,
  type Pose,
} from "../assets/louis-animation-pack/rig/runtime.mjs";
import { layerAt, type Layer } from "./model";
import { facialActing } from "./face";
import { followedLayer } from "./followThrough";
export const rigClips = clips
  .filter((c) =>
    [
      "idle",
      "rest",
      "walk",
      "start",
      "stop",
      "seated_idle",
      "desk_work",
      "desk_stand",
      "tea_press",
      "tea_pickup",
      "tea_pour",
      "tea_hold",
      "tea_sip",
    ].includes(c.id),
  )
  .map((c) => ({ value: c.id, label: c.label }));
export const expressionsForPose = (name: string) =>
  Number(expressions[name]?.[4] || 0);
export const rigExpressions = Object.keys(expressions).map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  n = clamp(n);
  return n * n * (3 - 2 * n);
};
// A quick close, a short closed hold, and a slower release. Directly seekable.
export function blinkAt(time: number) {
  time = ((time % 29.7) + 29.7) % 29.7;
  for (const start of [1.65, 4.9, 8.35, 12.1, 15.45, 18.8, 22.35, 26.4]) {
    const t = time - start;
    if (t >= 0 && t < 0.085) return smooth(t / 0.085);
    if (t >= 0.085 && t < 0.135) return 1;
    if (t >= 0.135 && t < 0.275) return 1 - smooth((t - 0.135) / 0.14);
  }
  return 0;
}
export function rigPose(
  l: Layer,
  time: number,
  raw: Layer = l,
  targets: Record<string, { x: number; y: number }> = {},
) {
  l = followedLayer(l, raw, time);
  const c = clips.find((c) => c.id === l.props.rigClip) || clips[0];
  const switches = [...(raw.keyframes.rigClip || [])].sort(
    (a, b) => a.time - b.time,
  );
  const key = switches.filter((k) => k.time <= time).at(-1);
  const t = l.keyframes.rigTime?.length
    ? l.props.rigTime
    : Math.max(0, time - (key?.time || 0));
  const authored = l.props.poseMode === "authored";
  const pose = sample(
    authored ? "rest" : c.id,
    authored ? 0 : c.loop ? t % c.duration : Math.min(c.duration, t),
    {
      pose: authored ? l.props : undefined,
      targets,
      prop: authored ? l.props.rigProp : undefined,
      rightHand: l.props.rightHand,
      leftHand: l.props.leftHand,
      expression: l.props.expression,
      mouth: l.props.mouthShape,
      blink: "open",
      gazeX: l.props.gazeX,
      gazeY: l.props.gazeY,
      headOffset: l.props.headAngle,
      rigVersion: Math.min(2, l.props.rigVersion),
      dimensions: l.props.rigDimensions,
    },
  );
  for (const part of pose.parts) {
    if (part.name.startsWith("eye_")) {
      part.width = part.name === "eye_R" ? 60 : 49;
      part.height = part.width;
    }
    if (part.name.startsWith("pupil_")) {
      part.width = 10;
      part.height = 10;
    }
  }
  if (l.props.rigVersion === 2) {
    const head = pose.parts.find((p) => p.name === "head")!;
    const hp = (dx: number, dy: number) => {
      const a = (head.rotation * Math.PI) / 180;
      return {
        x: head.x + dx * Math.cos(a) - dy * Math.sin(a),
        y: head.y + dx * Math.sin(a) + dy * Math.cos(a),
      };
    };
    for (const p of pose.parts) {
      const near = p.name.endsWith("_R"),
        dx = near ? 10 : 76,
        dy = near ? -150 : -154;
      if (p.name.startsWith("eye_")) {
        Object.assign(p, hp(dx, dy));
        p.width = near ? 52 : 43;
        p.height = p.width;
      }
      if (p.name.startsWith("brow_")) {
        Object.assign(p, hp(dx, dy - 29));
        p.width = near ? 49 : 39;
        p.height = 12;
      }
      if (p.name === "mouth") {
        Object.assign(p, hp(48, -48));
        p.width = p.asset.endsWith("_O") || p.asset.endsWith("_U") ? 28 : 52;
        p.height *= 0.8;
      }
    }
  }
  if (l.props.rigVersion === 3) {
    const head = pose.parts.find((p) => p.name === "head")!;
    head.anchor.y = 0.9;
    head.asset =
      l.props.rigView === "front"
        ? "head_front"
        : l.props.rigView === "profile"
          ? "head_profile"
          : "head";
    const front = l.props.rigView === "front",
      profile = l.props.rigView === "profile";
    const hp = (x: number, y: number) => {
      const a = (head.rotation * Math.PI) / 180;
      const dx = x - 119,
        dy = y - 302 * 0.9;
      return {
        x: head.x + dx * Math.cos(a) - dy * Math.sin(a),
        y: head.y + dx * Math.sin(a) + dy * Math.cos(a),
      };
    };
    for (const p of pose.parts) {
      const near = p.name.endsWith("_R");
      const x = profile ? 156 : front ? (near ? 91 : 150) : near ? 109 : 163;
      if (
        p.name.startsWith("eye_") ||
        p.name.startsWith("brow_") ||
        p.name.startsWith("pupil_")
      ) {
        if (profile && !near) {
          p.width = 0;
          p.height = 0;
          continue;
        }
        Object.assign(p, hp(x, p.name.startsWith("brow_") ? 103 : 133));
        if (p.name.startsWith("eye_"))
          p.width = p.height = front ? 43 : near ? 43 : 35;
        if (p.name.startsWith("brow_")) {
          p.width = front ? 42 : near ? 43 : 35;
          p.height = 12;
        }
      }
      if (p.name === "mouth") {
        Object.assign(p, hp(profile ? 157 : front ? 120 : 132, 214));
        p.width = profile ? 37 : 49;
        p.height = 26;
      }
      if (p.name.startsWith("hand_")) {
        const arm = pose.parts.find(
          (q) => q.name === "forearm_" + (near ? "R" : "L"),
        )!;
        p.width = 46;
        p.height = 54;
        p.anchor = { x: 0.5, y: 0.1 };
        p.rotation =
          arm.rotation +
          (near ? l.props.rightHandAngle : l.props.leftHandAngle);
      }
    }
  }
  return pose;
}
export function animatedRigPose(
  l: Layer,
  time: number,
  raw: Layer = l,
  targets: Record<string, { x: number; y: number }> = {},
) {
  const pose = rigPose(l, time, raw, targets);
  const key = [...(raw.keyframes.rigClip || [])]
    .sort((a, b) => a.time - b.time)
    .filter((k) => k.time <= time)
    .at(-1);
  if (
    l.props.poseMode !== "authored" &&
    !Object.keys(targets).length &&
    key &&
    key.time > 0 &&
    time - key.time < 0.22
  ) {
    const before = key.time - 0.00001,
      previous = rigPose(layerAt(raw, before), before, raw),
      f = smooth((time - key.time) / 0.22);
    for (const p of pose.parts) {
      const old = previous.parts.find((q) => q.name === p.name);
      if (!old) continue;
      for (const prop of ["x", "y", "rotation", "width", "height"] as const)
        p[prop] = old[prop] + (p[prop] - old[prop]) * f;
    }
  }
  return pose;
}
export function drawRig(
  ctx: CanvasRenderingContext2D,
  l: Layer,
  time: number,
  globalTime: number,
  resources?: Map<string, CanvasImageSource>,
  raw: Layer = l,
  resolvedPose?: Pose,
) {
  const pose = resolvedPose || animatedRigPose(l, time, raw);
  const acting = facialActing(raw, time, globalTime);
  ctx.save();
  ctx.scale(l.props.width / 1536, l.props.height / 1408);
  for (const p of pose.parts) {
    if (l.props.rigDrawing === "hands" && !p.name.startsWith("hand_")) continue;
    if (p.name.startsWith("environment_") || p.name.startsWith("pupil_"))
      continue;
    const image = resources?.get(l.props.rigAssets[p.asset]);
    if (!image) continue;
    // Clean rig arms have a single continuous silhouette. The skeleton still
    // supplies the elbow and wrist; rounded joins preserve limb thickness.
    // Replacement drawings retain the normal asset rendering path.
    if (
      l.props.rigVersion === 3 &&
      l.props.rigAssets[p.asset]?.startsWith("louis-clean-") &&
      (p.name.startsWith("upper_arm_") || p.name.startsWith("forearm_"))
    ) {
      if (p.name.startsWith("forearm_")) continue;
      const side = p.name.endsWith("_R") ? "R" : "L";
      const forearm = pose.parts.find((q) => q.name === "forearm_" + side)!;
      const wrist = pose.attachments[("hand_" + side) as "hand_R" | "hand_L"]!;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const stroke = (colour: string, width: number, sleeve = false) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        if (sleeve)
          ctx.lineTo(
            p.x + (forearm.x - p.x) * 0.42,
            p.y + (forearm.y - p.y) * 0.42,
          );
        else {
          ctx.lineTo(forearm.x, forearm.y);
          ctx.lineTo(wrist.x, wrist.y);
        }
        ctx.stroke();
      };
      stroke("#25262b", 46);
      stroke("#efbe94", 40);
      stroke("#25262b", side === "R" ? 73 : 66, true);
      stroke("#263e57", side === "R" ? 67 : 60, true);
      // Merge the shoulder cap into the shirt rather than outlining it as a
      // separate capsule. The sleeve cuff remains a readable seam.
      ctx.fillStyle = "#263e57";
      ctx.beginPath();
      ctx.arc(p.x, p.y, side === "R" ? 37 : 33.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    if (
      l.props.smoothJoints &&
      l.props.rigDrawing !== "hands" &&
      (p.name.startsWith("thigh_") || p.name.startsWith("upper_arm_"))
    ) {
      const side = p.name.endsWith("_R") ? "R" : "L",
        isLeg = p.name.startsWith("thigh_");
      const joint = pose.parts.find(
        (q) => q.name === (isLeg ? "shin_" : "forearm_") + side,
      );
      if (joint) {
        ctx.save();
        ctx.fillStyle =
          l.props.rigVersion === 3
            ? isLeg
              ? "#373d49"
              : "#efbe94"
            : isLeg
              ? "#cbb894"
              : "#ffc398";
        ctx.beginPath();
        ctx.arc(joint.x, joint.y, isLeg ? 26 : 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    const browIndex = p.name === "brow_R" ? 0 : p.name === "brow_L" ? 1 : -1;
    const browOffset =
      browIndex >= 0
        ? acting.brow[browIndex] -
          Number(
            (expressions[l.props.expression] || expressions.neutral)[browIndex],
          )
        : 0;
    ctx.rotate(((p.rotation + browOffset) * Math.PI) / 180);
    if (p.name.startsWith("eye_")) {
      const r = l.props.rigRegistration[p.asset];
      if (r) {
        ctx.translate(
          p.width * (p.anchor.x - r.anchorX),
          p.height * (p.anchor.y - r.anchorY),
        );
        ctx.scale(r.scaleX, r.scaleY);
      }
      drawEye(
        ctx,
        p,
        image,
        Math.max(
          clamp(l.props.blink),
          acting.closures[p.name === "eye_R" ? 0 : 1],
        ),
        l.props.gazeX,
        l.props.gazeY,
      );
    } else {
      const registration = l.props.rigRegistration[p.asset];
      const ax = registration?.anchorX ?? p.anchor.x,
        ay = registration?.anchorY ?? p.anchor.y;
      const pw = p.width * (registration?.scaleX ?? 1),
        ph = p.height * (registration?.scaleY ?? 1);
      const crop = l.props.rigCrops[p.asset];
      if (crop)
        ctx.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          -pw * ax,
          -ph * ay,
          pw,
          ph,
        );
      else ctx.drawImage(image, -pw * ax, -ph * ay, pw, ph);
    }
    ctx.restore();
  }
  ctx.restore();
}
// Reveal the original underpainted face as the lids descend. No skin-colour patch,
// compressed eyeball or shrinking pupil is used. The rim closes to one curved seam.
function drawEye(
  ctx: CanvasRenderingContext2D,
  p: RigPart,
  image: CanvasImageSource,
  closure: number,
  gx: number,
  gy: number,
) {
  const size = p.width,
    r = size / 2,
    top = -r + closure * (r + 2),
    bottom = r - closure * (r - 2);
  const arc = closure * r * 0.28;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-r, top);
  ctx.quadraticCurveTo(0, top + arc, r, top);
  ctx.lineTo(r, bottom);
  ctx.quadraticCurveTo(0, bottom + arc, -r, bottom);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, -r, -r, size, size);
  ctx.fillStyle = "#141821";
  ctx.beginPath();
  ctx.ellipse(8 + gx * size * 0.15, gy * size * 0.15, 5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (closure > 0.02) {
    // Follow the circular eye edge; the upper lid is the visible eyelash-free rim.
    const edge = Math.sqrt(Math.max(0, r * r - top * top));
    ctx.strokeStyle = "#29201d";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-edge, top);
    ctx.quadraticCurveTo(0, top + arc, edge, top);
    ctx.stroke();
  }
}
