import { ease, type Project, type Scene } from "./model";
export type Camera = {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
};
export function cameraAt(
  scene: Scene,
  time: number,
  settings: Project["settings"],
): Camera {
  const t = time - scene.start;
  const shot = [...scene.shots]
    .sort((a, b) => a.start - b.start)
    .filter((s) => t >= s.start && t < s.start + s.duration)
    .at(-1);
  return {
    width: settings.width,
    height: settings.height,
    x: shot?.x ?? settings.width / 2,
    y: shot?.y ?? settings.height / 2,
    zoom: shot
      ? Math.max(
          0.1,
          shot.zoom +
            (shot.endZoom - shot.zoom) *
              ease((t - shot.start) / shot.duration, shot.easing),
        )
      : 1,
  };
}
export function cameraPoint(
  p: { x: number; y: number },
  c: Camera,
  fixed = false,
) {
  return fixed
    ? p
    : {
        x: c.width / 2 + (p.x - c.x) * c.zoom,
        y: c.height / 2 + (p.y - c.y) * c.zoom,
      };
}
export function worldPoint(
  p: { x: number; y: number },
  c: Camera,
  fixed = false,
) {
  return fixed
    ? p
    : {
        x: c.x + (p.x - c.width / 2) / c.zoom,
        y: c.y + (p.y - c.height / 2) / c.zoom,
      };
}
