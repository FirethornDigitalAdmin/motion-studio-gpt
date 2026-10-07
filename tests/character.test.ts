import { describe, it, expect } from "vitest";
import { blinkAt, rigPose, rigClips } from "../src/character";
import { emptyProject, makeLayer, layerAt } from "../src/model";
describe("character rig", () => {
  it("keeps eye and pupil sizes fixed across expressions", () => {
    const l = makeLayer("rig", emptyProject());
    const a = rigPose(l, 0).parts.filter(
      (p) => p.name.startsWith("eye_") || p.name.startsWith("pupil_"),
    );
    l.props.expression = "sleepy";
    const b = rigPose(l, 0).parts.filter(
      (p) => p.name.startsWith("eye_") || p.name.startsWith("pupil_"),
    );
    expect(b.map((p) => [p.name, p.width, p.height])).toEqual(
      a.map((p) => [p.name, p.width, p.height]),
    );
  });
  it("closes, holds, and reopens deterministically", () => {
    expect(blinkAt(1.65)).toBe(0);
    expect(blinkAt(1.75)).toBe(1);
    expect(blinkAt(1.8)).toBeGreaterThan(0);
    expect(blinkAt(1.925)).toBeCloseTo(0);
    for (let t = 0; t < 28; t += 0.01) {
      expect(blinkAt(t)).toBeGreaterThanOrEqual(0);
      expect(blinkAt(t)).toBeLessThanOrEqual(1);
      expect(blinkAt(t)).toBe(blinkAt(t));
    }
  });
  it("starts each keyed action at its own time zero", () => {
    const l = makeLayer("rig", emptyProject());
    l.keyframes.rigClip = [
      { time: 0, value: "desk_work", easing: "linear" },
      { time: 4.5, value: "desk_stand", easing: "linear" },
    ];
    const atStart = rigPose(layerAt(l, 4.5), 4.5, l),
      local = makeLayer("rig", emptyProject());
    local.props.rigClip = "desk_stand";
    expect(atStart).toEqual(rigPose(local, 0));
  });
  it("keeps all production hand and foot targets within rig reach", () => {
    const l = makeLayer("rig", emptyProject());
    for (const c of rigClips.filter(
      (c) => c.value.startsWith("tea_") || c.value.startsWith("desk_"),
    )) {
      l.props.rigClip = c.value;
      for (let t = 0; t <= 4; t += 1 / 24) {
        l.props.rigVersion = 2;
        const pose = rigPose(l, t);
        expect(
          Math.max(...Object.values(pose.ikError)),
          `${c.value} at ${t}`,
        ).toBeLessThan(0.1);
      }
    }
  });
});
