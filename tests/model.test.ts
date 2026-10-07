import { describe, it, expect } from "vitest";
import {
  ease,
  emptyProject,
  makeLayer,
  valueAt,
  layerAt,
  projectSchema,
  preset,
  stagger,
  type Easing,
} from "../src/model";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis, "crypto", { value: webcrypto });
describe("schema and interpolation", () => {
  it("starts genuinely empty at 4K", () => {
    const p = emptyProject();
    expect(p.scenes).toEqual([]);
    expect(p.assets).toEqual([]);
    expect(p.settings).toMatchObject({
      width: 3840,
      height: 2160,
      fps: 30,
      durationSec: 15,
    });
    expect(projectSchema.parse(p)).toEqual(p);
  });
  it("interpolates unordered keys, endpoints, independent time and fallback", () => {
    const l = makeLayer("text", emptyProject());
    l.keyframes.x = [
      { time: 2, value: 200, easing: "linear" },
      { time: 0, value: 0, easing: "linear" },
    ];
    expect(valueAt(l, "x", 1)).toBe(100);
    expect(valueAt(l, "x", -1)).toBe(0);
    expect(valueAt(l, "x", 4)).toBe(200);
    expect(valueAt(l, "opacity", 1)).toBe(1);
    expect(layerAt(l, 1)).toEqual(layerAt(l, 1));
    expect(l.x).toBe(1920);
  });
  it("rejects invalid schemas", () => {
    expect(
      projectSchema.safeParse({
        ...emptyProject(),
        settings: { ...emptyProject().settings, fps: 0 },
      }).success,
    ).toBe(false);
  });
});
describe("easing", () => {
  const all: Easing[] = [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    { type: "bezier", x1: 0.17, y1: -0.2, x2: 0.8, y2: 1.3 },
    { type: "spring", stiffness: 100, damping: 10, mass: 1 },
    { type: "spring", stiffness: 100, damping: 20, mass: 1 },
    { type: "spring", stiffness: 100, damping: 30, mass: 1 },
  ];
  for (const e of all)
    it(JSON.stringify(e) + " has stable finite endpoints", () => {
      expect(ease(0, e)).toBe(0);
      expect(ease(1, e)).toBe(1);
      for (let i = 0; i <= 100; i++) {
        expect(Number.isFinite(ease(i / 100, e))).toBe(true);
        expect(ease(i / 100, e)).toBe(ease(i / 100, e));
      }
    });
  it("accelerates correctly", () => {
    expect(ease(0.5, "linear")).toBe(0.5);
    expect(ease(0.5, "ease-in")).toBeLessThan(0.5);
    expect(ease(0.5, "ease-out")).toBeGreaterThan(0.5);
    expect(ease(0.5, "ease-in-out")).toBeCloseTo(0.5, 6);
    expect(
      ease(0.5, { type: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 }),
    ).toBeCloseTo(0.5, 6);
  });
});

describe("editable styles and advanced generators", () => {
  it("interpolates colours and pivots; discrete text switches at the exact key", () => {
    const l = makeLayer("text", emptyProject());
    l.keyframes.color = [
      { time: 0, value: "#000000", easing: "linear" },
      { time: 2, value: "#ffffff", easing: "linear" },
    ];
    l.keyframes.content = [
      { time: 0, value: "First", easing: "linear" },
      { time: 2, value: "Second", easing: "linear" },
    ];
    l.keyframes.anchorX = [
      { time: 0, value: 0, easing: "linear" },
      { time: 2, value: 1, easing: "linear" },
    ];
    expect(layerAt(l, 1).props.color).toBe("#808080");
    expect(layerAt(l, 1).anchor.x).toBe(0.5);
    expect(layerAt(l, 1).props.content).toBe("First");
    expect(layerAt(l, 2).props.content).toBe("Second");
  });
  it("every preset creates regular keys and overwrites previous ones", () => {
    for (const kind of [
      "slide-in",
      "slide-out",
      "fade-in",
      "fade-out",
      "scale-in",
      "scale-out",
    ])
      for (const direction of ["left", "right", "up", "down"]) {
        const l = makeLayer("shape", emptyProject());
        preset(l, kind, direction, 100, 0.2, 0.5, "ease-out");
        const keys = Object.values(l.keyframes)[0];
        expect(keys).toHaveLength(2);
        expect(keys.map((k) => k.time)).toEqual([0.2, 0.7]);
        preset(l, kind, direction, 200, 0, 1, "linear");
        expect(Object.values(l.keyframes)[0]).toHaveLength(2);
      }
  });
  it("stagger supports forward, reverse and stable seeded random order", () => {
    const base = [1, 2, 3, 4, 5].map(() => makeLayer("shape", emptyProject()));
    const a = structuredClone(base),
      b = structuredClone(base);
    stagger(a, "random", 0.1, 42);
    stagger(b, "random", 0.1, 42);
    expect(a.map((l) => l.start)).toEqual(b.map((l) => l.start));
    stagger(a, "forward", 0.2, 42);
    expect(a.map((l) => l.start)).toEqual([
      0, 0.2, 0.4, 0.6000000000000001, 0.8,
    ]);
    stagger(b, "reverse", 0.2, 42);
    expect(b[0].start).toBe(0.8);
    expect(b.at(-1)!.start).toBe(0);
  });
});
it("spring overshoot cannot create invalid geometry or text metrics", () => {
  const l = makeLayer("shape", emptyProject());
  for (const prop of [
    "scale",
    "fontSize",
    "width",
    "height",
    "radius",
  ] as const)
    l.keyframes[prop] = [
      {
        time: 0,
        value: 1,
        easing: { type: "spring", stiffness: 100, damping: 5, mass: 1 },
      },
      { time: 1, value: prop === "radius" ? 0 : 0.001, easing: "linear" },
    ];
  for (let t = 0; t < 1; t += 0.01) {
    for (const prop of ["scale", "fontSize", "width", "height"] as const)
      expect(valueAt(l, prop, t)).toBeGreaterThan(0);
    expect(valueAt(l, "radius", t)).toBeGreaterThanOrEqual(0);
  }
});
