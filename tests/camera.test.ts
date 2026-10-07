import { expect, it } from "vitest";
import { cameraAt, cameraPoint, worldPoint } from "../src/camera";
import { emptyProject, projectSchema } from "../src/model";
const p = projectSchema.parse({
  ...emptyProject(),
  scenes: [
    {
      id: "s",
      name: "Test",
      start: 2,
      duration: 8,
      layers: [],
      shots: [
        {
          id: "a",
          name: "Face",
          start: 1,
          duration: 3,
          x: 800,
          y: 400,
          zoom: 2,
          endZoom: 3,
          easing: "linear",
        },
      ],
    },
  ],
});
it("cuts at exact scene-relative boundaries and returns to wide in gaps", () => {
  expect(cameraAt(p.scenes[0], 2.99, p.settings).zoom).toBe(1);
  expect(cameraAt(p.scenes[0], 3, p.settings)).toMatchObject({
    x: 800,
    y: 400,
    zoom: 2,
  });
  expect(cameraAt(p.scenes[0], 4.5, p.settings).zoom).toBe(2.5);
  expect(cameraAt(p.scenes[0], 6, p.settings).zoom).toBe(1);
});
it("maps selection and drag coordinates through the same camera and preserves frame overlays", () => {
  const c = cameraAt(p.scenes[0], 4.5, p.settings),
    point = { x: 920, y: 470 };
  expect(worldPoint(cameraPoint(point, c), c)).toEqual(point);
  expect(cameraPoint(point, c, true)).toEqual(point);
  expect(cameraPoint({ x: 800, y: 400 }, c)).toEqual({ x: 1920, y: 1080 });
});
it("opens older projects with a wide camera and static image parts", () => {
  const legacy = projectSchema.parse({
    ...emptyProject(),
    scenes: [{ id: "s", name: "Legacy", start: 0, duration: 3, layers: [] }],
  });
  expect(legacy.scenes[0].shots).toEqual([]);
});
