import { describe, it, expect } from "vitest";
import { emptyProject, makeLayer, layerAt } from "../src/model";
import {
  curveKeys,
  moveCurveKey,
  graphSamples,
  motionFrame,
  keyIssues,
  scanTimes,
} from "../src/motionAnalysis";
const setup = () => {
  const p = emptyProject(),
    l = makeLayer("rig", p);
  p.scenes.push({
    id: "scene",
    name: "Stage",
    start: 0,
    duration: 15,
    shots: [],
    layers: [l],
  });
  return { p, l, scene: p.scenes[0] };
};
describe("motion workbench", () => {
  it("snaps graph edits to frames, keeps easing and prevents colliding or invalid keys", () => {
    const { l } = setup();
    l.keyframes.x = [
      { time: 0, value: 0, easing: "linear" },
      { time: 1, value: 100, easing: "ease-in" },
    ];
    expect(moveCurveKey(l, "x", 1, 1.049, 125, 30)).toBeCloseTo(1.033333);
    expect(curveKeys(l, "x")[1].easing).toBe("ease-in");
    const before = structuredClone(l);
    expect(() => moveCurveKey(l, "x", 1.0333333333333334, 0, 150, 30)).toThrow(
      "occupies",
    );
    expect(l).toEqual(before);
    l.keyframes.opacity = [{ time: 0, value: 1, easing: "linear" }];
    expect(() => moveCurveKey(l, "opacity", 0, 0, 2, 30)).toThrow("range");
    l.locked = true;
    expect(() => moveCurveKey(l, "x", 0, 0.5, 200, 30)).toThrow("locked");
  });
  it("graphs the real easing and smooth passage interpolation deterministically", () => {
    const { l } = setup();
    l.duration = 3;
    l.keyframes.headAngle = [
      {
        time: 0,
        value: 0,
        easing: { type: "bezier", x1: 0.4, y1: 0, x2: 0.6, y2: 1 },
      },
      { time: 1, value: 10, easing: "linear" },
      { time: 3, value: -5, easing: "linear" },
    ];
    for (const smooth of [false, true]) {
      l.props.continuousJoints = smooth;
      const samples = graphSamples(l, "headAngle");
      for (const sample of samples)
        expect(sample.value).toBe(layerAt(l, sample.time).props.headAngle);
      expect(graphSamples(l, "headAngle")).toEqual(samples);
    }
  });
  it("finds unreachable rig targets and pin errors at the exact sample frame", () => {
    const { l, scene } = setup();
    l.props.poseMode = "authored";
    l.props.handRX = 4000;
    expect(
      motionFrame(scene, 1, 6000).issues.some(
        (i) => i.kind === "reach" && i.layerId === l.id,
      ),
    ).toBe(true);
    l.props.rigConstraints.push({
      id: "pin",
      kind: "pin",
      effector: "foot_R",
      worldX: 9000,
      worldY: 9000,
      targetLayerId: "",
      targetX: 0.5,
      targetY: 0.5,
      followRotation: false,
      rotationOffset: 0,
      start: 0,
      end: 3,
    });
    const issues = motionFrame(scene, 1, 6000).issues;
    expect(issues.some((i) => i.kind === "pin" && i.time === 1)).toBe(true);
    expect(
      motionFrame(scene, 4, 6000).issues.some((i) => i.kind === "pin"),
    ).toBe(false);
  });
  it("detects world-space speed and honours the chosen threshold", () => {
    const { l, scene } = setup();
    l.props.rigClip = "rest";
    l.keyframes.x = [
      { time: 0, value: 0, easing: "linear" },
      { time: 1, value: 1000, easing: "linear" },
    ];
    const before = motionFrame(scene, 0, 500);
    expect(
      motionFrame(scene, 0.1, 500, before).issues.some(
        (i) => i.kind === "speed",
      ),
    ).toBe(true);
    expect(
      motionFrame(scene, 0.1, 1500, before).issues.some(
        (i) => i.kind === "speed",
      ),
    ).toBe(false);
  });
  it("reports duplicate and clipped keys without changing the project", () => {
    const { l, scene } = setup();
    l.keyframes.x = [
      { time: 1, value: 0, easing: "linear" },
      { time: 1, value: 1, easing: "linear" },
      { time: 20, value: 5, easing: "linear" },
    ];
    const before = structuredClone(scene);
    expect(keyIssues(scene).length).toBe(2);
    expect(scene).toEqual(before);
  });
  it("bounds scans to scene/project ranges and caps the number of samples", () => {
    const { p, scene } = setup();
    scene.start = 2;
    scene.duration = 5;
    p.settings.durationSec = 6;
    const times = scanTimes(p, scene, 0, 10, 24);
    expect(times[0]).toBe(2);
    expect(times.at(-1)).toBe(6);
    expect(times.length).toBe(97);
    expect(() => scanTimes(p, scene, 8, 9, 24)).toThrow("overlap");
    scene.duration = 10000;
    p.settings.durationSec = 10002;
    expect(scanTimes(p, scene, 2, 10002, 60).length).toBe(3600);
  });
});
