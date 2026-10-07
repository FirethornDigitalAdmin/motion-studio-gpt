import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer, layerAt, layerSchema } from "../src/model";
import { followValue, bakeFollowThrough } from "../src/followThrough";
import { rigPose } from "../src/character";
import { evaluateRigScene, rigToWorld } from "../src/rigging";
import { applyAuthoring } from "../src/authoring";
function fixture() {
  const l = makeLayer("rig", emptyProject());
  l.duration = 3;
  l.props.poseMode = "authored";
  l.props.followThrough.enabled = true;
  l.props.followThrough.strength = 1;
  l.keyframes.headAngle = [
    { time: 0, value: 0, easing: "linear" },
    { time: 0.5, value: 15, easing: "linear" },
    { time: 3, value: 15, easing: "linear" },
  ];
  return l;
}
describe("follow-through", () => {
  it("defaults older projects to unchanged motion and validates settings", () => {
    const raw = fixture() as any;
    delete raw.props.followThrough;
    expect(layerSchema.parse(raw).props.followThrough.enabled).toBe(false);
    raw.props.followThrough = { frequency: 0 };
    expect(() => layerSchema.parse(raw)).toThrow();
  });
  it("lags moving targets, settles, and is deterministic when seeking backwards", () => {
    const l = fixture();
    expect(followValue(l, "headAngle", 0)).toBeCloseTo(0);
    expect(followValue(l, "headAngle", 0.3)).toBeLessThan(9);
    const v = followValue(l, "headAngle", 0.6);
    followValue(l, "headAngle", 2.5);
    expect(followValue(l, "headAngle", 0.6)).toBe(v);
    expect(followValue(l, "headAngle", 2.8)).toBeCloseTo(15, 5);
    l.props.followThrough.strength = 0;
    expect(followValue(l, "headAngle", 0.3)).toBeCloseTo(9);
    l.props.followThrough.strength = 1;
    l.props.poseMode = "preset";
    expect(followValue(l, "headAngle", 0.3)).toBeCloseTo(9);
  });
  it("keeps pinned hands in place while wrists have lag", () => {
    const l = fixture();
    l.keyframes.handRX = [
      { time: 0, value: 671, easing: "linear" },
      { time: 1, value: 700, easing: "linear" },
    ];
    const initial = rigPose(layerAt(l, 0), 0, l);
    const world = rigToWorld(l, initial.attachments.hand_R!);
    l.props.rigConstraints = [
      {
        id: "pin",
        kind: "pin",
        effector: "hand_R",
        worldX: world.x,
        worldY: world.y,
        targetLayerId: "",
        targetX: 0.5,
        targetY: 0.5,
        followRotation: false,
        rotationOffset: 0,
        start: 0,
        end: 3,
      },
    ];
    const s = {
      id: "scene",
      name: "Scene",
      start: 0,
      duration: 3,
      layers: [l],
      shots: [],
    };
    const resolved = evaluateRigScene(s, 0.8);
    const actual = rigToWorld(
      resolved.layers.get(l.id)!,
      resolved.poses.get(l.id)!.attachments.hand_R!,
    );
    expect(actual.x).toBeCloseTo(world.x, 3);
    expect(actual.y).toBeCloseTo(world.y, 3);
  });
  it("bakes preview values at each output frame without changing the input", () => {
    const l = fixture(),
      original = structuredClone(l),
      baked = bakeFollowThrough(l, 30);
    expect(l).toEqual(original);
    expect(baked.props.followThrough.enabled).toBe(false);
    for (let i = 0; i <= 90; i++) {
      const t = i / 30;
      expect(followValue(baked, "headAngle", t)).toBeCloseTo(
        followValue(l, "headAngle", t),
        8,
      );
      expect(rigPose(layerAt(baked, t), t, baked).parts).toEqual(
        rigPose(layerAt(l, t), t, l).parts,
      );
    }
    l.locked = true;
    expect(() => bakeFollowThrough(l, 30)).toThrow("Unlock");
  });
  it("patches and bakes through atomic authoring without resetting other settings", () => {
    const p = emptyProject(),
      l = fixture();
    p.scenes.push({
      id: "scene",
      name: "Scene",
      start: 0,
      duration: 3,
      layers: [l],
      shots: [],
    });
    const r = applyAuthoring(p, {
      label: "Set spring",
      expectedRevision: 0,
      commands: [
        { op: "setFollowThrough", layerId: l.id, values: { damping: 0.8 } },
        { op: "bakeFollowThrough", layerId: l.id },
      ],
    });
    const after = r.project.scenes[0].layers[0];
    expect(after.props.followThrough).toMatchObject({
      enabled: false,
      damping: 0.8,
      strength: 1,
    });
    expect(after.keyframes.headAngle.length).toBe(91);
    expect(p.scenes[0].layers[0]).toEqual(l);
  });
});
