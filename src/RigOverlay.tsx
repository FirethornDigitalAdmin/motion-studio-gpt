import { useEffect, useRef } from "react";
import { useStore, editLayer } from "./store";
import { cameraAt, cameraPoint, worldPoint } from "./camera";
import { type Layer, type Scene, type AnimProperty } from "./model";
import { drawRig } from "./character";
import {
  evaluateRigScene,
  rigJoints,
  rigToWorld,
  worldToRig,
  jointProps,
  poseValues,
  recordPose,
  putKey,
  contactActive,
  inverseLayerPoint,
  effectorLabels,
  type Point,
} from "./rigging";
const bones = [
  ["pelvis", "head"],
  ["shoulder_R", "elbow_R"],
  ["elbow_R", "hand_R"],
  ["shoulder_L", "elbow_L"],
  ["elbow_L", "hand_L"],
  ["pelvis", "hip_R"],
  ["hip_R", "knee_R"],
  ["knee_R", "foot_R"],
  ["pelvis", "hip_L"],
  ["hip_L", "knee_L"],
  ["knee_L", "foot_L"],
];
const controls = {
  head_control: "Head angle",
  pelvis: "Hips",
  hand_R: "Right wrist",
  hand_L: "Left wrist",
  foot_R: "Right ankle",
  foot_L: "Left ankle",
  elbow_R: "Right elbow direction",
  elbow_L: "Left elbow direction",
  knee_R: "Right knee direction",
  knee_L: "Left knee direction",
};
export default function RigOverlay({
  layer,
  scene,
  ratio,
}: {
  layer: Layer;
  scene: Scene;
  ratio: number;
}) {
  const s = useStore(),
    ghost = useRef<HTMLCanvasElement>(null),
    view = evaluateRigScene(scene, s.time),
    at = view.layers.get(layer.id)!,
    pose = view.poses.get(layer.id),
    camera = cameraAt(scene, s.time, s.project.settings);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    const canvas = ghost.current;
    if (!canvas) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.max(
      1,
      Math.round(s.project.settings.width * ratio * dpr),
    );
    canvas.height = Math.max(
      1,
      Math.round(s.project.settings.height * ratio * dpr),
    );
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!s.onionSkin) return;
    const ghosts = [
      ...Array.from({ length: s.onionBefore }, (_, i) => ({
        direction: -1,
        distance: i + 1,
        color: "#70dcff",
      })),
      ...Array.from({ length: s.onionAfter }, (_, i) => ({
        direction: 1,
        distance: i + 1,
        color: "#ffc16b",
      })),
    ].sort((a, b) => b.distance - a.distance);
    const image = document.createElement("canvas");
    image.width = canvas.width;
    image.height = canvas.height;
    const g = image.getContext("2d")!;
    for (const { direction, distance, color } of ghosts) {
      const time =
        s.time +
        (direction * distance * s.onionFrames) / s.project.settings.fps;
      if (
        time < scene.start + layer.start ||
        time >=
          Math.min(
            scene.start + scene.duration,
            scene.start + layer.start + layer.duration,
            s.project.settings.durationSec,
          )
      )
        continue;
      const v = evaluateRigScene(scene, time),
        l = v.layers.get(layer.id)!,
        p = v.poses.get(layer.id);
      if (!p) continue;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, image.width, image.height);
      g.scale(ratio * dpr, ratio * dpr);
      if (!l.props.screenSpace) {
        g.translate(camera.width / 2, camera.height / 2);
        g.scale(camera.zoom, camera.zoom);
        g.translate(-camera.x, -camera.y);
      }
      g.translate(l.x, l.y);
      g.rotate((l.rotation * Math.PI) / 180);
      g.scale(l.scale, l.scale);
      g.translate(-l.props.width * l.anchor.x, -l.props.height * l.anchor.y);
      drawRig(
        g,
        l,
        time - scene.start - layer.start,
        time,
        s.resources,
        layer,
        p,
      );
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, image.width, image.height);
      ctx.globalAlpha = s.onionOpacity / distance;
      ctx.drawImage(image, 0, 0);
    }
    // Keep the current drawing clean; ghosts show around its silhouette rather
    // than washing out its colours where all poses overlap.
    if (pose) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, image.width, image.height);
      g.scale(ratio * dpr, ratio * dpr);
      if (!at.props.screenSpace) {
        g.translate(camera.width / 2, camera.height / 2);
        g.scale(camera.zoom, camera.zoom);
        g.translate(-camera.x, -camera.y);
      }
      g.translate(at.x, at.y);
      g.rotate((at.rotation * Math.PI) / 180);
      g.scale(at.scale, at.scale);
      g.translate(
        -at.props.width * at.anchor.x,
        -at.props.height * at.anchor.y,
      );
      drawRig(
        g,
        at,
        s.time - scene.start - layer.start,
        s.time,
        s.resources,
        layer,
        pose,
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(image, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
  }, [
    s.project,
    s.time,
    s.resources,
    s.onionSkin,
    s.onionFrames,
    s.onionBefore,
    s.onionAfter,
    s.onionOpacity,
    ratio,
    layer,
    scene,
  ]);
  if (!pose) return null;
  const joints = rigJoints(pose),
    head = pose.parts.find((p) => p.name === "head")!,
    ha = (head.rotation * Math.PI) / 180;
  joints.head_control = {
    x: head.x + Math.sin(ha) * 145,
    y: head.y - Math.cos(ha) * 145,
  };
  const local = s.time - scene.start - layer.start;
  const screen = (p: Point) => {
    const pos = cameraPoint(rigToWorld(at, p), camera, at.props.screenSpace);
    return { x: pos.x * ratio, y: pos.y * ratio };
  };
  const drag = (e: React.PointerEvent, name: string) => {
    if (layer.locked) return;
    e.preventDefault();
    e.stopPropagation();
    useStore.setState({ playing: false, poseJoint: name });
    const rect = e.currentTarget.closest(".stage")!.getBoundingClientRect(),
      values = poseValues(at, pose),
      startWorld = worldPoint(
        {
          x: (e.clientX - rect.left) / ratio,
          y: (e.clientY - rect.top) / ratio,
        },
        camera,
        at.props.screenSpace,
      ),
      start = worldToRig(at, startWorld);
    const contact = layer.props.rigConstraints
      .filter(
        (c) =>
          c.effector === name &&
          c.kind !== "carry" &&
          contactActive(c, layer, scene, s.time),
      )
      .at(-1);
    s.begin();
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved = true;
      const world = worldPoint(
          {
            x: (ev.clientX - rect.left) / ratio,
            y: (ev.clientY - rect.top) / ratio,
          },
          camera,
          at.props.screenSpace,
        ),
        q = worldToRig(at, world);
      editLayer(layer.id, (l) => {
        if (contact) {
          const c = l.props.rigConstraints.find((c) => c.id === contact.id)!;
          if (c.kind === "pin") {
            c.worldX = world.x;
            c.worldY = world.y;
          } else {
            const prop = view.layers.get(c.targetLayerId);
            if (prop) {
              const grip = inverseLayerPoint(prop, world);
              c.targetX = grip.x / prop.props.width;
              c.targetY = grip.y / prop.props.height;
            }
          }
          return;
        }
        recordPose(l, local, values);
        if (jointProps[name]) {
          const [x, y] = jointProps[name];
          putKey(l, x, local, joints[name].x + q.x - start.x);
          putKey(l, y, local, joints[name].y + q.y - start.y);
        } else if (name === "head_control") {
          const a = Math.atan2(
              start.y - joints.head.y,
              start.x - joints.head.x,
            ),
            b = Math.atan2(q.y - joints.head.y, q.x - joints.head.x);
          putKey(
            l,
            "headAngle",
            local,
            values.headAngle + ((b - a) * 180) / Math.PI,
          );
        } else {
          const side = name.endsWith("_R") ? "R" : "L",
            leg = name.startsWith("knee"),
            a = joints[(leg ? "hip_" : "shoulder_") + side],
            b = joints[(leg ? "foot_" : "hand_") + side],
            bend =
              Math.sign(
                (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x),
              ) || 1;
          putKey(
            l,
            ((side === "R" ? "right" : "left") +
              (leg ? "LegBend" : "ArmBend")) as AnimProperty,
            local,
            bend,
          );
        }
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cleanup.current = null;
      s.end();
      if (!moved) useStore.setState({ poseJoint: name });
    };
    cleanup.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
  };
  return (
    <div className="rig-overlay">
      <canvas
        ref={ghost}
        className="onion-canvas"
        aria-label="Onion skin preview"
      />
      {s.poseEditing && (
        <>
          <svg className="rig-bones" width="100%" height="100%">
            {bones.map(([a, b]) => {
              const p = screen(joints[a]),
                q = screen(joints[b]);
              return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
            })}
          </svg>
          {Object.entries(controls).map(([key, label]) => {
            const p = screen(joints[key]),
              pinned = layer.props.rigConstraints.some(
                (c) =>
                  c.effector === key &&
                  c.kind === "pin" &&
                  contactActive(c, layer, scene, s.time),
              );
            return (
              <button
                key={key}
                aria-label={"Pose " + label}
                title={
                  label + (pinned ? " · pinned in scene" : " · drag to pose")
                }
                disabled={layer.locked}
                className={
                  "rig-joint " +
                  (key === s.poseJoint ? "chosen " : "") +
                  (pinned ? "pinned " : "") +
                  (key.startsWith("elbow") || key.startsWith("knee")
                    ? "pole"
                    : "")
                }
                style={{ left: p.x, top: p.y }}
                onPointerDown={(e) => drag(e, key)}
                onClick={() => useStore.setState({ poseJoint: key })}
              >
                {pinned ? "◆" : ""}
              </button>
            );
          })}
          <div className="rig-edit-caption">
            Pose · drag joints · cyan: before · amber: after
          </div>
        </>
      )}
    </div>
  );
}
