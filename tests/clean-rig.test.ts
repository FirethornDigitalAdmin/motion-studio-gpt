import { describe, expect, it } from "vitest";
import { emptyProject, layerAt, layerSchema, makeLayer } from "../src/model";
import { rigPose } from "../src/character";
import fs from "node:fs";
describe("Louis clean rig", () => {
  it("places face features against the registered head drawing in all views", () => {
    const l = makeLayer("rig", emptyProject());
    l.props.rigVersion = 3;
    l.props.poseMode = "authored";
    for (const view of ["front", "three-quarter", "profile"] as const) {
      l.props.rigView = view;
      for (const angle of [-15, 0, 15]) {
        l.props.headAngle = angle;
        const pose = rigPose(l, 0),
          head = pose.parts.find((p) => p.name === "head")!;
        expect(head.asset).toBe(
          view === "front"
            ? "head_front"
            : view === "profile"
              ? "head_profile"
              : "head",
        );
        const eye = pose.parts.find((p) => p.name === "eye_R")!;
        const dx = eye.x - head.x,
          dy = eye.y - head.y,
          a = (-head.rotation * Math.PI) / 180;
        expect(dx * Math.sin(a) + dy * Math.cos(a)).toBeCloseTo(
          133 - 302 * 0.9,
        );
        expect(eye.width).toBe(43);
        expect(pose.parts.find((p) => p.name === "eye_L")!.width).toBe(
          view === "profile" ? 0 : view === "front" ? 43 : 35,
        );
        for (const side of ["R", "L"]) {
          const hand = pose.parts.find((p) => p.name === "hand_" + side)!;
          expect(hand.anchor).toEqual({ x: 0.5, y: 0.1 });
          expect(hand.width).toBe(46);
          expect(hand.height).toBe(54);
          expect(hand.x).toBe(
            pose.attachments[("hand_" + side) as "hand_R" | "hand_L"]!.x,
          );
        }
      }
    }
  });
  it("supports native keyed views and rejects unsupported drawings", () => {
    const l = makeLayer("rig", emptyProject());
    l.keyframes.rigView = [
      { time: 0, value: "front", easing: "linear" },
      { time: 1, value: "profile", easing: "linear" },
    ];
    expect(layerAt(l, 0.9).props.rigView).toBe("front");
    expect(layerAt(l, 1).props.rigView).toBe("profile");
    l.keyframes.rigView[1].value = "bad";
    expect(() => layerSchema.parse(l)).toThrow();
  });
  it("supplies all rebuilt head, mouth and hand views as independent native assets", () => {
    const index = JSON.parse(
      fs.readFileSync(
        "assets/louis-animation-pack/clean-v3/parts/index.json",
        "utf8",
      ),
    );
    for (const name of [
      "head",
      "head_front",
      "head_profile",
      "torso",
      "neck",
      ...["R", "L"].flatMap((s) =>
        ["relaxed", "open", "point", "grasp", "fist"].map(
          (p) => "hand_" + s + "_" + p,
        ),
      ),
    ]) {
      expect(index[name]).toBeDefined();
      const svg = fs.readFileSync(
        "assets/louis-animation-pack/" + index[name].file,
        "utf8",
      );
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/gradient|<image/);
    }
  });
});
