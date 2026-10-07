import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer, projectSchema, valueAt } from "../src/model";
import { facialActing, faceTemplates } from "../src/face";
describe("image character acting", () => {
  it("keeps registration per drawing through saving and blends emotional eyelids", () => {
    const p = emptyProject(),
      l = makeLayer("image", p);
    l.props.facialDrawings.one = faceTemplates["Louis portrait"];
    l.props.facialDrawings.two = faceTemplates["Louis shrug"];
    l.props.autoBlink = false;
    l.keyframes.expression = [
      { time: 0, value: "neutral", easing: "linear" },
      { time: 1, value: "tired", easing: "linear" },
    ];
    expect(facialActing(l, 1, 1).closures[0]).toBe(0);
    expect(facialActing(l, 1.12, 1.12).closures[0]).toBeCloseTo(0.25);
    expect(facialActing(l, 1.24, 1.24).closures[0]).toBe(0.5);
    p.scenes = [
      {
        id: "scene",
        name: "Scene",
        start: 0,
        duration: 15,
        layers: [l],
        shots: [],
      },
    ];
    expect(
      projectSchema.parse(p).scenes[0].layers[0].props.facialDrawings,
    ).toEqual(l.props.facialDrawings);
  });
  it("blinks across a long film and offsets the actors independently", () => {
    const l = makeLayer("image", emptyProject());
    expect(facialActing(l, 31.45, 31.45).closures[0]).toBe(1);
    l.props.actor = "Patch";
    expect(facialActing(l, 31.45, 31.45).closures[0]).toBe(0);
  });
  it("passes through keys continuously, preserves holds and never overshoots gaze", () => {
    const l = makeLayer("image", emptyProject());
    l.props.continuousJoints = true;
    l.keyframes.gazeX = [
      { time: 0, value: -1, easing: "ease-in-out" },
      { time: 1, value: 0, easing: "ease-in-out" },
      { time: 3, value: 1, easing: "ease-in-out" },
      { time: 4, value: 1, easing: "ease-in-out" },
    ];
    const eps = 0.00001,
      left = (valueAt(l, "gazeX", 1) - valueAt(l, "gazeX", 1 - eps)) / eps,
      right = (valueAt(l, "gazeX", 1 + eps) - valueAt(l, "gazeX", 1)) / eps;
    expect(left).toBeGreaterThan(0.3);
    expect(right).toBeCloseTo(left, 3);
    expect(valueAt(l, "gazeX", 3.5)).toBe(1);
    for (let t = 0; t < 4; t += 0.01) {
      expect(valueAt(l, "gazeX", t)).toBeGreaterThanOrEqual(-1);
      expect(valueAt(l, "gazeX", t)).toBeLessThanOrEqual(1);
    }
  });
});
