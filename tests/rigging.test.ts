import { describe, it, expect } from "vitest";
import {
  emptyProject,
  makeLayer,
  layerAt,
  projectSchema,
  type Scene,
  type Layer,
} from "../src/model";
import { rigPose } from "../src/character";
import {
  evaluateRigScene,
  rigJoints,
  rigToWorld,
  worldToRig,
  layerPoint,
  poseValues,
  recordPose,
  putKey,
} from "../src/rigging";
import { ik } from "../assets/louis-animation-pack/rig/runtime.mjs";
const sceneFor = (layers: Layer[]): Scene => ({
  id: "scene",
  name: "Test",
  start: 0,
  duration: 10,
  shots: [],
  layers,
});
const setup = () => {
  const p = emptyProject(),
    l = makeLayer("rig", p);
  l.props.rigVersion = 2;
  l.props.rigClip = "idle";
  l.props.width = 1536;
  l.props.height = 1408;
  l.x = 900;
  l.y = 800;
  l.scale = 0.8;
  l.rotation = 12;
  const base = rigPose(l, 0);
  recordPose(l, 0, poseValues(l, base));
  return { p, l, scene: sceneFor([l]) };
};
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
};
describe("character posing and contacts", () => {
  it("captures an action without changing joint positions, hand shapes or prop tilt", () => {
    const { l } = setup();
    for (const action of [
      "desk_work",
      "desk_stand",
      "tea_pour",
      "tea_sip",
      "walk",
    ]) {
      const raw = structuredClone(l);
      raw.keyframes = {};
      raw.props.poseMode = "preset";
      raw.props.rigClip = action;
      const before = rigPose(raw, 0.7),
        values = poseValues(raw, before);
      recordPose(raw, 0.7, values);
      const after = rigPose(layerAt(raw, 0.7), 0.7, raw);
      for (const key of [
        "pelvis",
        "head",
        "hand_R",
        "hand_L",
        "foot_R",
        "foot_L",
      ])
        close(before.attachments[key]!, after.attachments[key]!);
      expect(after.parts.find((p) => p.name === "hand_R")!.asset).toBe(
        before.parts.find((p) => p.name === "hand_R")!.asset,
      );
      expect(after.parts.find((p) => p.name === "prop")?.rotation).toBe(
        before.parts.find((p) => p.name === "prop")?.rotation,
      );
    }
  });
  it("interpolates poses while preserving exact arm and leg bone lengths", () => {
    const { l, scene } = setup(),
      first = poseValues(layerAt(l, 0), rigPose(layerAt(l, 0), 0, l));
    recordPose(l, 2, {
      ...first,
      handRX: first.handRX + 75,
      handRY: first.handRY - 70,
      pelvisY: first.pelvisY + 20,
    });
    for (const t of [0, 0.25, 0.7, 1.4, 2]) {
      const j = rigJoints(evaluateRigScene(scene, t).poses.get(l.id)!);
      expect(
        Math.hypot(j.elbow_R.x - j.shoulder_R.x, j.elbow_R.y - j.shoulder_R.y),
      ).toBeCloseTo(first.upperArmLength, 5);
      expect(
        Math.hypot(j.hand_R.x - j.elbow_R.x, j.hand_R.y - j.elbow_R.y),
      ).toBeCloseTo(first.forearmLength, 5);
      expect(
        Math.hypot(j.knee_R.x - j.hip_R.x, j.knee_R.y - j.hip_R.y),
      ).toBeCloseTo(first.thighLength, 5);
    }
  });
  it("round-trips nonuniform rig dimensions, scale, pivot and rotation", () => {
    const { l } = setup();
    l.props.width = 1100;
    l.props.height = 800;
    l.anchor = { x: 0.2, y: 0.9 };
    for (const q of [
      { x: 300, y: 400 },
      { x: 768, y: 1166 },
    ])
      close(worldToRig(l, rigToWorld(l, q)), q);
  });
  it("keeps a pinned foot fixed in the scene while hips and layer transforms move", () => {
    const { l, scene } = setup(),
      pose = evaluateRigScene(scene, 0).poses.get(l.id)!,
      world = rigToWorld(layerAt(l, 0), pose.attachments.foot_R!);
    l.props.rigConstraints.push({
      id: "pin",
      kind: "pin",
      effector: "foot_R",
      worldX: world.x,
      worldY: world.y,
      start: 0,
      end: 4,
      targetLayerId: "",
      targetX: 0.5,
      targetY: 0.5,
      followRotation: false,
      rotationOffset: 0,
    });
    putKey(l, "x", 0, l.x);
    putKey(l, "x", 3, l.x + 20);
    putKey(l, "pelvisY", 3, l.props.pelvisY + 20);
    for (const t of [0, 0.4, 1.2, 2.8]) {
      const v = evaluateRigScene(scene, t);
      close(
        rigToWorld(v.layers.get(l.id)!, v.poses.get(l.id)!.attachments.foot_R!),
        world,
      );
    }
  });
  it("makes a wrist follow an animated, rotated prop grip at arbitrary seeks", () => {
    const { p, l, scene } = setup(),
      prop = makeLayer("image", p),
      world = rigToWorld(
        layerAt(l, 0),
        evaluateRigScene(scene, 0).poses.get(l.id)!.attachments.hand_R!,
      );
    prop.x = world.x;
    prop.y = world.y;
    prop.props.width = 80;
    prop.props.height = 60;
    prop.rotation = 25;
    prop.scale = 0.7;
    scene.layers.push(prop);
    putKey(prop, "x", 0, prop.x);
    putKey(prop, "x", 3, prop.x + 30);
    l.props.rigConstraints.push({
      id: "reach",
      kind: "reach",
      effector: "hand_R",
      targetLayerId: prop.id,
      targetX: 0.5,
      targetY: 0.5,
      worldX: 0,
      worldY: 0,
      start: 0,
      end: 4,
      followRotation: false,
      rotationOffset: 0,
    });
    for (const t of [2.6, 0.3, 1.8, 0, 2.6]) {
      const v = evaluateRigScene(scene, t);
      close(
        rigToWorld(v.layers.get(l.id)!, v.poses.get(l.id)!.attachments.hand_R!),
        layerPoint(v.layers.get(prop.id)!, { x: 40, y: 30 }),
      );
    }
  });
  it("attaches a prop grip to a keyed hand and releases back to baked free transforms", () => {
    const { p, l, scene } = setup(),
      prop = makeLayer("image", p);
    prop.props.width = 60;
    prop.props.height = 70;
    scene.layers.push(prop);
    putKey(l, "handRX", 3, l.props.handRX + 60);
    l.props.rigConstraints.push({
      id: "carry",
      kind: "carry",
      effector: "hand_R",
      targetLayerId: prop.id,
      targetX: 0.15,
      targetY: 0.4,
      start: 0,
      end: 2,
      worldX: 0,
      worldY: 0,
      followRotation: true,
      rotationOffset: 10,
    });
    const at = evaluateRigScene(scene, 1),
      grip = layerPoint(at.layers.get(prop.id)!, { x: 9, y: 28 });
    close(
      grip,
      rigToWorld(at.layers.get(l.id)!, at.poses.get(l.id)!.attachments.hand_R!),
    );
    const release = evaluateRigScene(scene, 2 - 0.00001).layers.get(prop.id)!;
    for (const k of ["x", "y", "rotation"] as const)
      putKey(prop, k, 2, release[k]);
    const after = evaluateRigScene(scene, 2.5).layers.get(prop.id)!;
    expect(after.x).toBe(release.x);
    expect(after.rotation).toBe(release.rotation);
  });
  it("does not stretch limbs for unreachable targets and handles a target at the shoulder", () => {
    const { l } = setup();
    putKey(l, "handRX", 0, 10000);
    const p = rigPose(layerAt(l, 0), 0, l);
    expect(p.ikError.arm_R).toBeGreaterThan(100);
    const j = rigJoints(p);
    expect(
      Math.hypot(j.hand_R.x - j.elbow_R.x, j.hand_R.y - j.elbow_R.y),
    ).toBeCloseTo(125, 5);
    const q = ik({ x: 0, y: 0 }, { x: 0, y: 0 }, 135, 125);
    expect(Math.hypot(q.elbow.x, q.elbow.y)).toBeCloseTo(135, 5);
    expect(Number.isFinite(q.a2)).toBe(true);
  });
  it("saves all pose and drawing data, rejects cyclic or competing prop ownership, and accepts disjoint ownership", () => {
    const { p, l, scene } = setup(),
      prop = makeLayer("image", p);
    scene.layers.push(prop);
    p.scenes = [scene];
    const c = {
      id: "carry",
      kind: "carry" as const,
      effector: "hand_R" as const,
      targetLayerId: prop.id,
      targetX: 0.5,
      targetY: 0.5,
      start: 0,
      end: 2,
      worldX: 0,
      worldY: 0,
      followRotation: false,
      rotationOffset: 0,
    };
    l.props.rigConstraints = [c];
    expect(projectSchema.safeParse(p).success).toBe(true);
    l.props.rigConstraints.push({ ...c, id: "reach", kind: "reach" });
    expect(projectSchema.safeParse(p).success).toBe(false);
    l.props.rigConstraints = [c, { ...c, id: "other", effector: "hand_L" }];
    expect(projectSchema.safeParse(p).success).toBe(false);
    l.props.rigConstraints[1].start = 2;
    l.props.rigConstraints[1].end = 3;
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
  it("keeps drawing swaps and registration discrete without changing earlier frames", () => {
    const { l } = setup();
    l.props.rigAssets.head = "original";
    l.props.rigDrawings.push({
      time: 2,
      slot: "head",
      assetId: "profile",
      registration: { anchorX: 0.4, anchorY: 0.8, scaleX: 0.9, scaleY: 1 },
      crop: null,
    });
    expect(layerAt(l, 1).props.rigAssets.head).toBe("original");
    expect(layerAt(l, 2).props.rigAssets.head).toBe("profile");
    expect(layerAt(l, 3).props.rigRegistration.head.anchorX).toBe(0.4);
    expect(l.props.rigAssets.head).toBe("original");
  });
});
