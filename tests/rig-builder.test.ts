import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer, projectSchema } from "../src/model";
import { coreSlots, commitRig, rigIssues } from "../src/rigWorkshop";
import { rigPose } from "../src/character";
const setup = () => {
  const p = emptyProject(),
    l = makeLayer("rig", p);
  l.name = "Custom actor";
  for (const slot of coreSlots) {
    p.assets.push({
      id: slot,
      type: "image",
      originalName: slot + ".png",
      relativePath: "assets/" + slot + ".png",
      hash: "a".repeat(64),
    });
    l.props.rigAssets[slot] = slot;
  }
  return { p, l };
};
describe("rig builder", () => {
  it("blocks incomplete artwork and supports old projects", () => {
    const p = emptyProject();
    delete (p as Partial<typeof p>).rigTemplates;
    expect(projectSchema.parse(p).rigTemplates).toEqual([]);
    const l = makeLayer("rig", projectSchema.parse(p));
    expect(rigIssues(l, projectSchema.parse(p))).toHaveLength(16);
    expect(() => commitRig(l, projectSchema.parse(p), "scene")).toThrow(
      "Assign head",
    );
  });
  it("persists artwork, pivots, proportions and reusable rigs in native projects", () => {
    const { p, l } = setup();
    l.props.rigRegistration.head = {
      anchorX: 0.42,
      anchorY: 0.85,
      scaleX: 1.2,
      scaleY: 1,
    };
    l.props.rigDimensions = {
      upperArmLength: 180,
      forearmLength: 160,
      thighLength: 210,
      shinLength: 205,
    };
    const placed = commitRig(l, p, "scene");
    const q = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    expect(q.scenes[0].layers[0].id).toBe(placed);
    expect(q.rigTemplates[0].props.rigRegistration.head.anchorX).toBe(0.42);
    expect(q.scenes[0].layers[0].props.rigDimensions).toEqual(
      l.props.rigDimensions,
    );
    const pose = rigPose(q.scenes[0].layers[0], 0.2);
    const a = pose.parts.find((p) => p.name === "upper_arm_R")!,
      b = pose.parts.find((p) => p.name === "forearm_R")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(180, 4);
  });
  it("updates artwork without replacing animation, pose or contacts", () => {
    const { p, l } = setup();
    const id = commitRig(l, p, "scene");
    const original = p.scenes[0].layers[0];
    original.keyframes.handRX = [
      { time: 1, value: 500, easing: "ease-in-out" },
    ];
    original.props.pelvisY = 900;
    original.props.rigConstraints.push({
      id: "pin",
      kind: "pin",
      effector: "foot_R",
      start: 0,
      end: 2,
      worldX: 700,
      worldY: 1200,
      targetLayerId: "",
      targetX: 0.5,
      targetY: 0.5,
      followRotation: false,
      rotationOffset: 0,
    });
    l.props.rigRegistration.head = {
      anchorX: 0.3,
      anchorY: 0.8,
      scaleX: 1,
      scaleY: 1,
    };
    commitRig(l, p, "scene", id);
    expect(p.scenes[0].layers).toHaveLength(1);
    expect(original.props.pelvisY).toBe(900);
    expect(original.keyframes.handRX[0].value).toBe(500);
    expect(original.props.rigConstraints).toHaveLength(1);
    expect(p.rigTemplates).toHaveLength(1);
  });
});
