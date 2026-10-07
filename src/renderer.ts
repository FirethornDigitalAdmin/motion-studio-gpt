import { layerAt, type Layer, type Project } from "./model";
import { cameraAt } from "./camera";
import { mouthOpeningAt } from "./audio";
import { evaluateRigScene } from "./rigging";
import { drawRig } from "./character";
import { facialActing } from "./face";
// Resources are supplied by the caller on its own context. Frame drawing never loads or mutates them.
export type RenderContext = CanvasRenderingContext2D & {
  resources?: Map<string, CanvasImageSource>;
};
export function bounds(ctx: CanvasRenderingContext2D, l: Layer) {
  if (l.type === "text") {
    ctx.font = `${l.props.fontWeight} ${l.props.fontSize}px "${l.props.fontFamily}"`;
    const lines = l.props.content.split("\n");
    return {
      width: Math.max(
        1,
        ...lines.map(
          (s) =>
            ctx.measureText(s).width +
            Math.max(0, s.length - 1) * l.props.letterSpacing,
        ),
      ),
      height: lines.length * l.props.fontSize * l.props.lineHeight,
    };
  }
  if (l.type === "cursor") return { width: 72, height: 92 };
  return { width: l.props.width, height: l.props.height };
}
export function cursorPoint(l: Layer, t: number) {
  const ps = [...l.props.points].sort((a, b) => a.time - b.time);
  if (!ps.length) return { x: 0, y: 0 };
  if (t <= ps[0].time) return ps[0];
  for (let i = 1; i < ps.length; i++) {
    if (t <= ps[i].time) {
      const a = ps[i - 1],
        b = ps[i];
      let f = (t - a.time) / (b.time - a.time);
      if (l.props.smoothing) f = f * f * (3 - 2 * f);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return ps.at(-1)!;
}
export function renderFrame(
  project: Project,
  timeSec: number,
  ctx: RenderContext,
  scale = 1,
) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.font = "10px Arial";
  ctx.clearRect(0, 0, project.settings.width, project.settings.height);
  ctx.fillStyle = "#000000";
  ctx.fillStyle = project.settings.background;
  ctx.fillRect(0, 0, project.settings.width, project.settings.height);
  for (const scene of project.scenes) {
    if (timeSec < scene.start || timeSec >= scene.start + scene.duration)
      continue;
    const rigScene = evaluateRigScene(scene, timeSec);
    for (const raw of scene.layers) {
      const t = timeSec - scene.start - raw.start;
      if (!raw.visible || raw.type === "audio" || t < 0 || t >= raw.duration)
        continue;
      const l = rigScene.layers.get(raw.id) || layerAt(raw, t);
      const b = bounds(ctx, l);
      ctx.save();
      if (!l.props.screenSpace) {
        const camera = cameraAt(scene, timeSec, project.settings);
        ctx.translate(project.settings.width / 2, project.settings.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
      }
      ctx.translate(l.x, l.y);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.scale(l.scale, l.scale);
      ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity));
      ctx.translate(-b.width * l.anchor.x, -b.height * l.anchor.y);
      ctx.fillStyle = l.props.color;
      if (l.type === "text") {
        ctx.font = `${l.props.fontWeight} ${l.props.fontSize}px "${l.props.fontFamily}"`;
        ctx.textBaseline = "top";
        l.props.content.split("\n").forEach((line, i) => {
          const w =
            ctx.measureText(line).width +
            Math.max(0, line.length - 1) * l.props.letterSpacing;
          let x =
            l.props.align === "center"
              ? (b.width - w) / 2
              : l.props.align === "right"
                ? b.width - w
                : 0;
          if (l.props.letterSpacing === 0)
            ctx.fillText(line, x, i * l.props.fontSize * l.props.lineHeight);
          else
            for (const c of line) {
              ctx.fillText(c, x, i * l.props.fontSize * l.props.lineHeight);
              x += ctx.measureText(c).width + l.props.letterSpacing;
            }
        });
      } else if (l.type === "shape") {
        ctx.beginPath();
        if (l.props.shape === "ellipse")
          ctx.ellipse(
            b.width / 2,
            b.height / 2,
            b.width / 2,
            b.height / 2,
            0,
            0,
            Math.PI * 2,
          );
        else ctx.roundRect(0, 0, b.width, b.height, l.props.radius);
        ctx.fill();
      } else if (l.type === "rig") {
        drawRig(
          ctx,
          l,
          t,
          timeSec,
          ctx.resources,
          raw,
          rigScene.poses.get(raw.id),
        );
      } else if (l.type === "image") {
        const img = ctx.resources?.get(l.props.assetId || "");
        if (img) {
          drawActor(
            ctx,
            img,
            l,
            b,
            l.props.mouthEnabled
              ? mouthOpeningAt(project, l.props.actor, timeSec)
              : 0,
            raw,
            t,
            timeSec,
          );
        } else {
          ctx.fillStyle = "#262a36";
          ctx.fillRect(0, 0, b.width, b.height);
          ctx.strokeStyle = "#7e8599";
          ctx.lineWidth = 3;
          ctx.strokeRect(0, 0, b.width, b.height);
          ctx.font = "40px Arial";
          ctx.fillStyle = "#b5bad0";
          ctx.textAlign = "center";
          ctx.fillText("Missing asset", b.width / 2, b.height / 2);
        }
      } else {
        const p = cursorPoint(l, t);
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        ctx.moveTo(8, 4);
        ctx.lineTo(12, 78);
        ctx.lineTo(31, 59);
        ctx.lineTo(46, 87);
        ctx.lineTo(60, 79);
        ctx.lineTo(44, 52);
        ctx.lineTo(71, 49);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.stroke();
        for (const click of l.props.clicks) {
          const d = t - click;
          if (d >= 0 && d < 0.45) {
            ctx.beginPath();
            ctx.globalAlpha = l.opacity * (1 - d / 0.45);
            ctx.strokeStyle = l.props.color;
            ctx.lineWidth = 4;
            ctx.arc(8, 4, 24 + 100 * d, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  l: Layer,
  b: { width: number; height: number },
  opening: number,
) {
  const shape = l.props.mouthShape;
  if (shape !== "auto")
    opening =
      shape === "sil" || shape === "PP"
        ? 0
        : ["aa", "O"].includes(shape)
          ? 1
          : shape === "FF" || shape === "SS"
            ? 0.2
            : 0.55;
  if (opening > 0.025) {
    const mx = b.width * l.props.mouthX,
      my = b.height * l.props.mouthY;
    const mw =
        l.props.mouthWidth *
        (["O", "U"].includes(shape) ? 0.55 : 0.75 + opening * 0.25),
      mh = Math.max(2, l.props.mouthHeight * opening);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#26131e";
    ctx.fill();
    ctx.strokeStyle = "#17181d";
    ctx.lineWidth = Math.max(1, mw * 0.06);
    ctx.stroke();
    ctx.clip();
    if (opening > 0.35) {
      ctx.fillStyle = "#f5eadb";
      ctx.fillRect(mx - mw / 2, my - mh / 2, mw, Math.min(4, mh * 0.22));
    }
    ctx.fillStyle = "#cf6e81";
    ctx.beginPath();
    ctx.ellipse(mx, my + mh * 0.43, mw * 0.3, mh * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
type Part = {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
  angle: number;
  head: boolean;
};
const partCanvases = new WeakMap<
  CanvasImageSource,
  Map<string, OffscreenCanvas>
>();
function partWeight(r: Part, x: number, y: number) {
  const smooth = (n: number) => {
    n = Math.max(0, Math.min(1, n));
    return n * n * (3 - 2 * n);
  };
  const fx = r.w * 0.15,
    fy = r.h * 0.15;
  return (
    smooth((x - r.x) / fx) *
    smooth((r.x + r.w - x) / fx) *
    smooth((y - r.y) / fy) *
    smooth((r.y + r.h - y) / fy)
  );
}
function bendPoint(
  r: Part,
  x: number,
  y: number,
  b: { width: number; height: number },
) {
  const weight = partWeight(r, x / b.width, y / b.height),
    angle = (r.angle * Math.PI) / 180;
  const dx = x - r.px * b.width,
    dy = y - r.py * b.height;
  return {
    x: x + weight * (dx * Math.cos(angle) - dy * Math.sin(angle) - dx),
    y: y + weight * (dx * Math.sin(angle) + dy * Math.cos(angle) - dy),
  };
}
// Deform a continuous patch with fixed outer edges. Joints keep their original
// registration, so movement cannot reveal holes or duplicate the original limb.
function bentPart(
  img: CanvasImageSource,
  b: { width: number; height: number },
  r: Part,
) {
  const key = JSON.stringify([b.width, b.height, r.x, r.y, r.w, r.h]);
  let cache = partCanvases.get(img);
  if (!cache) {
    cache = new Map();
    partCanvases.set(img, cache);
  }
  const density = 2,
    w = r.w * b.width,
    h = r.h * b.height;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = new OffscreenCanvas(
      Math.ceil(w * density),
      Math.ceil(h * density),
    );
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    cache.set(key, canvas);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "copy";
  const densityX = canvas.width / w,
    densityY = canvas.height / h;
  const nx = 6,
    ny = 8;
  const nodes = Array.from({ length: ny + 1 }, (_, j) =>
    Array.from({ length: nx + 1 }, (_, i) => {
      const x = (r.x + (r.w * i) / nx) * b.width,
        y = (r.y + (r.h * j) / ny) * b.height;
      const p = bendPoint(r, x, y, b);
      return {
        x,
        y,
        tx: (p.x - r.x * b.width) * densityX,
        ty: (p.y - r.y * b.height) * densityY,
      };
    }),
  );
  type Node = (typeof nodes)[number][number];
  const triangle = (a: Node, c: Node, d: Node) => {
    const det = (c.x - a.x) * (d.y - a.y) - (d.x - a.x) * (c.y - a.y);
    const ux =
      ((c.tx - a.tx) * (d.y - a.y) - (d.tx - a.tx) * (c.y - a.y)) / det;
    const uy =
      ((c.ty - a.ty) * (d.y - a.y) - (d.ty - a.ty) * (c.y - a.y)) / det;
    const vx =
      ((d.tx - a.tx) * (c.x - a.x) - (c.tx - a.tx) * (d.x - a.x)) / det;
    const vy =
      ((d.ty - a.ty) * (c.x - a.x) - (c.ty - a.ty) * (d.x - a.x)) / det;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    const cx = (a.tx + c.tx + d.tx) / 3,
      cy = (a.ty + c.ty + d.ty) / 3;
    // Slightly overlap triangle clips; copy compositing preserves source alpha.
    for (const [i, n] of [a, c, d].entries()) {
      const length = Math.hypot(n.tx - cx, n.ty - cy) || 1;
      const x = n.tx + ((n.tx - cx) / length) * 3,
        y = n.ty + ((n.ty - cy) / length) * 3;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(
      ux,
      uy,
      vx,
      vy,
      a.tx - ux * a.x - vx * a.y,
      a.ty - uy * a.x - vy * a.y,
    );
    ctx.drawImage(img, 0, 0, b.width, b.height);
    ctx.restore();
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = nodes[j][i],
        c = nodes[j][i + 1],
        d = nodes[j + 1][i],
        e = nodes[j + 1][i + 1];
      triangle(a, c, e);
      triangle(a, e, d);
    }
  return canvas;
}
function drawActor(
  ctx: RenderContext,
  img: CanvasImageSource,
  l: Layer,
  b: { width: number; height: number },
  opening: number,
  raw: Layer,
  time: number,
  globalTime: number,
) {
  const draw = () => ctx.drawImage(img, 0, 0, b.width, b.height),
    p = l.props;
  if (!p.puppetEnabled) {
    draw();
    drawFace(ctx, img, l, b, raw, time, globalTime);
    drawMouth(ctx, l, b, opening);
    return;
  }
  const head: Part = {
    x: p.headX,
    y: p.headY,
    w: p.headW,
    h: p.headH,
    px: p.headPivotX,
    py: p.headPivotY,
    angle: p.headAngle,
    head: true,
  };
  const regions = [head];
  if (p.armEnabled)
    regions.push({
      x: p.armX,
      y: p.armY,
      w: p.armW,
      h: p.armH,
      px: p.armPivotX,
      py: p.armPivotY,
      angle: p.armAngle,
      head: false,
    });
  const moving = regions.filter((r) => Math.abs(r.angle) > 0.000001);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, b.width, b.height);
  for (const r of moving)
    ctx.rect(r.x * b.width, r.y * b.height, r.w * b.width, r.h * b.height);
  ctx.clip("evenodd");
  draw();
  ctx.restore();
  for (const r of moving)
    ctx.drawImage(
      bentPart(img, b, r),
      r.x * b.width,
      r.y * b.height,
      r.w * b.width,
      r.h * b.height,
    );
  drawFace(ctx, img, l, b, raw, time, globalTime, head);
  const mx = p.mouthX * b.width,
    my = p.mouthY * b.height,
    pos = bendPoint(head, mx, my, b),
    angle = (head.angle * partWeight(head, p.mouthX, p.mouthY) * Math.PI) / 180;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.translate(-mx, -my);
  drawMouth(ctx, l, b, opening);
  ctx.restore();
}

const faceSamples = new WeakMap<CanvasImageSource, Map<string, string[]>>();
function drawFace(
  ctx: RenderContext,
  img: CanvasImageSource,
  l: Layer,
  b: { width: number; height: number },
  raw: Layer,
  time: number,
  globalTime: number,
  head?: Part,
) {
  if (!l.props.facialEnabled) return;
  const registration = l.props.facialDrawings[l.props.assetId];
  if (!registration) return;
  const acting = facialActing(raw, time, globalTime);
  let colors = faceSamples.get(img);
  if (!colors) {
    colors = new Map();
    faceSamples.set(img, colors);
  }
  const key = JSON.stringify(registration);
  let skin = colors.get(key);
  if (!skin) {
    // Sample untouched cheek colours once. This is a rendering mask, and the
    // source artwork remains intact in the project asset library.
    const canvas = new OffscreenCanvas(1024, 1536),
      sample = canvas.getContext("2d")!;
    sample.drawImage(img, 0, 0, 1024, 1536);
    skin = registration.eyes.flatMap((e) =>
      [-0.55, 0.55].map((dx) => {
        const rgba = sample.getImageData(
          Math.round((e.x + dx * e.rx) * 1024),
          Math.round((e.y + e.ry) * 1536 + 6),
          1,
          1,
        ).data;
        return `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
      }),
    );
    colors.set(key, skin);
  }
  registration.eyes.forEach((e, index) => {
    const x = e.x * b.width,
      y = e.y * b.height,
      rx = e.rx * b.width,
      ry = e.ry * b.height;
    const closure = Math.max(l.props.blink, acting.closures[index]);
    const pos = head ? bendPoint(head, x, y, b) : { x, y };
    ctx.save();
    ctx.translate(pos.x, pos.y);
    if (head)
      ctx.rotate((head.angle * partWeight(head, e.x, e.y) * Math.PI) / 180);
    const shade = ctx.createLinearGradient(-rx, 0, rx, 0);
    shade.addColorStop(0, skin![index * 2]);
    shade.addColorStop(1, skin![index * 2 + 1]);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      rx + (b.width / 1024) * 2.2,
      ry + (b.height / 1536) * 2.2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#17191c";
    ctx.lineWidth = (b.width / 1024) * 2.6;
    if (closure >= 0.995) {
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.quadraticCurveTo(0, ry * 0.25, rx, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#f9f8f5";
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.arc(
        l.props.gazeX * rx * 0.62,
        l.props.gazeY * ry * 0.62,
        rx * 0.18,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "#111315";
      ctx.fill();
      ctx.restore();
      if (closure > 0) {
        // The upper lid sweeps over a fixed eyeball and fixed-size pupil.
        // A small lower-lid rise completes the blink near closure.
        const top = -ry + ry * 1.12 * closure,
          lower = ry * (1 - closure);
        const eyelid = (y: number, above: boolean) => {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            rx + ctx.lineWidth,
            ry + ctx.lineWidth,
            0,
            0,
            Math.PI * 2,
          );
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(-rx - ctx.lineWidth, y);
          ctx.quadraticCurveTo(
            0,
            y + ry * 0.18 * closure,
            rx + ctx.lineWidth,
            y,
          );
          ctx.lineTo(
            rx + ctx.lineWidth,
            above ? -ry - ctx.lineWidth : ry + ctx.lineWidth,
          );
          ctx.lineTo(
            -rx - ctx.lineWidth,
            above ? -ry - ctx.lineWidth : ry + ctx.lineWidth,
          );
          ctx.closePath();
          ctx.fillStyle = shade;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-rx - ctx.lineWidth, y);
          ctx.quadraticCurveTo(
            0,
            y + ry * 0.18 * closure,
            rx + ctx.lineWidth,
            y,
          );
          ctx.stroke();
          ctx.restore();
        };
        eyelid(top, true);
        if (closure > 0.7) eyelid(lower, false);
      }
    }
    ctx.restore();
  });
}

export async function loadResources(
  project: Project,
  urlFor: (path: string) => string,
) {
  const images = new Map<string, CanvasImageSource>();
  const audio = new Map<string, AudioBuffer>();
  const missing: string[] = [];
  await Promise.all(
    project.assets.map(async (a) => {
      try {
        const url = urlFor(a.relativePath);
        if (a.type === "font") {
          const f = new FontFace(
            a.originalName.replace(/\.[^.]+$/, ""),
            `url("${url}")`,
          );
          await f.load();
          document.fonts.add(f);
        } else if (a.type === "audio") {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Missing audio");
          const context = new OfflineAudioContext(1, 1, 24000);
          audio.set(
            a.id,
            await context.decodeAudioData(await response.arrayBuffer()),
          );
        } else {
          if (a.relativePath.endsWith(".svg")) {
            const source = await (await fetch(url)).text();
            if (
              /<(?:animate|animateTransform|animateMotion|set)\b|animation\s*:/i.test(
                source,
              )
            )
              throw new Error("Animated SVG is not supported");
          }
          const im = new Image();
          im.src = url;
          await im.decode();
          // Freeze decoded images so animated raster files cannot introduce wall-clock state.
          images.set(
            a.id,
            a.relativePath.endsWith(".svg") ? im : await createImageBitmap(im),
          );
        }
      } catch {
        missing.push(a.id);
      }
    }),
  );
  await document.fonts.ready;
  return { images, audio, missing };
}
