import { useEffect, useRef, useState } from "react";
import { activeScene, useStore, editLayer } from "./store";
import { cameraAt, cameraPoint, worldPoint } from "./camera";
import RigOverlay from "./RigOverlay";
import { evaluateRigScene } from "./rigging";
import { layerAt, valueAt, type Layer } from "./model";
import {
  bounds,
  cursorPoint,
  renderFrame,
  type RenderContext,
} from "./renderer";
export default function Preview() {
  const s = useStore();
  const wrap = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [view, setView] = useState(1);
  const selected = s.project.scenes
    .flatMap((sc) => sc.layers.map((l) => ({ sc, l })))
    .filter(({ l }) => s.selected.includes(l.id));
  useEffect(() => {
    const o = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    if (wrap.current) o.observe(wrap.current);
    return () => o.disconnect();
  }, []);
  const ratio =
    Math.min(
      (size.w - 100) / s.project.settings.width,
      (size.h - 80) / s.project.settings.height,
    ) * view;
  const w = s.project.settings.width * ratio,
    h = s.project.settings.height * ratio;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = devicePixelRatio || 1;
    el.width = Math.max(1, Math.round(w * dpr));
    el.height = Math.max(1, Math.round(h * dpr));
    const ctx = el.getContext("2d") as RenderContext;
    ctx.resources = s.resources;
    renderFrame(s.project, s.time, ctx, ratio * dpr);
  }, [s.project, s.time, s.resources, w, h, ratio]);
  const layerBox = (l: Layer, scStart: number) => {
    const sc = s.project.scenes.find(
      (sc) => sc.start === scStart && sc.layers.some((q) => q.id === l.id),
    );
    const at = sc
      ? evaluateRigScene(sc, s.time).layers.get(l.id)!
      : layerAt(l, s.time - scStart - l.start);
    const ctx = canvas.current?.getContext("2d");
    const b = ctx ? bounds(ctx, at) : { width: 100, height: 100 };
    return { at, b };
  };
  const drag = (
    e: React.PointerEvent,
    kind: "move" | "scale" | "rotate",
    l: Layer,
  ) => {
    if (l.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const scene = s.project.scenes.find((sc) =>
      sc.layers.some((x) => x.id === l.id),
    )!;
    const time = s.time - scene.start - l.start;
    const initial = layerAt(l, time);
    const startX = e.clientX,
      startY = e.clientY;
    const ids = s.selected.includes(l.id) ? s.selected : [l.id];
    s.select(ids, scene.id);
    const snapshots = ids
      .map((id) => {
        const raw = scene.layers.find((x) => x.id === id);
        return raw
          ? { raw, at: layerAt(raw, s.time - scene.start - raw.start) }
          : null;
      })
      .filter(Boolean) as { raw: Layer; at: Layer }[];
    s.begin();
    const rect = canvas.current!.getBoundingClientRect();
    const camera = cameraAt(scene, s.time, s.project.settings);
    const pivot = cameraPoint(initial, camera, l.props.screenSpace);
    const cx = rect.left + pivot.x * ratio,
      cy = rect.top + pivot.y * ratio;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx),
      distance = Math.hypot(e.clientX - cx, e.clientY - cy);
    const apply = (
      target: Layer,
      prop: "x" | "y" | "rotation" | "scale",
      v: number,
    ) => {
      const targetTime = s.time - scene.start - target.start;
      const keys = target.keyframes[prop];
      if (keys?.length) {
        const key = keys.find(
          (k) => Math.abs(k.time - targetTime) < 0.5 / s.project.settings.fps,
        );
        if (key) key.value = v;
        else
          keys.push({
            time: Math.max(0, targetTime),
            value: v,
            easing: "linear",
          });
      } else target[prop] = v;
    };
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - startX) / ratio,
        dy = (ev.clientY - startY) / ratio;
      if (ev.shiftKey && kind === "move") {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      s.edit((p) => {
        for (const snap of snapshots) {
          const target = p.scenes
            .flatMap((sc) => sc.layers)
            .find((x) => x.id === snap.raw.id)!;
          if (target.locked) continue;
          if (kind === "move") {
            const zoom = target.props.screenSpace ? 1 : camera.zoom;
            apply(target, "x", snap.at.x + dx / zoom);
            apply(target, "y", snap.at.y + dy / zoom);
          } else if (kind === "scale")
            apply(
              target,
              "scale",
              Math.max(
                0.01,
                (initial.scale * Math.hypot(ev.clientX - cx, ev.clientY - cy)) /
                  Math.max(distance, 1),
              ),
            );
          else {
            let degrees =
              initial.rotation +
              ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - angle) * 180) /
                Math.PI;
            if (ev.shiftKey) degrees = Math.round(degrees / 15) * 15;
            apply(target, "rotation", degrees);
          }
        }
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      s.end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  const selectCanvas = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / ratio,
      y = (e.clientY - rect.top) / ratio;
    let hit: Layer | undefined, scId: string | undefined;
    for (const sc of [...s.project.scenes].reverse()) {
      if (s.time < sc.start || s.time >= sc.start + sc.duration) continue;
      for (const raw of [...sc.layers].reverse()) {
        const t = s.time - sc.start - raw.start;
        if (!raw.visible || raw.type === "audio" || t < 0 || t >= raw.duration)
          continue;
        const { at, b } = layerBox(raw, sc.start);
        const a = (-at.rotation * Math.PI) / 180;
        const point = worldPoint(
          { x, y },
          cameraAt(sc, s.time, s.project.settings),
          raw.props.screenSpace,
        );
        const dx = (point.x - at.x) / at.scale,
          dy = (point.y - at.y) / at.scale;
        const pathOffset =
          raw.type === "cursor" ? cursorPoint(raw, t) : { x: 0, y: 0 };
        const px =
            dx * Math.cos(a) -
            dy * Math.sin(a) +
            b.width * at.anchor.x -
            pathOffset.x,
          py =
            dx * Math.sin(a) +
            dy * Math.cos(a) +
            b.height * at.anchor.y -
            pathOffset.y;
        if (px >= 0 && py >= 0 && px <= b.width && py <= b.height) {
          hit = raw;
          scId = sc.id;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      const ids = e.shiftKey
        ? s.selected.includes(hit.id)
          ? s.selected.filter((id) => id !== hit!.id)
          : [...s.selected, hit.id]
        : s.selected.includes(hit.id)
          ? s.selected
          : [hit.id];
      s.select(ids, scId);
      if (!e.shiftKey) drag(e, "move", hit);
    } else s.select([]);
  };
  return (
    <section className="preview">
      <div className="preview-toolbar">
        <div>
          <span className="tiny-label">COMPOSITION</span>
          <span className="crumb">
            {activeScene(s)?.name || "Empty project"}
          </span>
        </div>
        <div className="preview-tools">
          {selected.some(({ l }) => l.type === "rig") && (
            <>
              <button
                aria-label="Pose editor"
                aria-pressed={s.poseEditing}
                title="Drag character joints to record poses"
                onClick={() =>
                  useStore.setState({
                    poseEditing: !s.poseEditing,
                    playing: false,
                  })
                }
              >
                ♙ Pose
              </button>
              <button
                aria-label="Onion skin preview"
                aria-pressed={s.onionSkin}
                title="Show the selected character before and after this frame"
                onClick={() => useStore.setState({ onionSkin: !s.onionSkin })}
              >
                ◌ Onion
              </button>
            </>
          )}
          <span>
            {s.project.settings.width} × {s.project.settings.height}
          </span>
          <select
            aria-label="Preview zoom"
            value={view}
            title="Scale the preview without changing export resolution"
            onChange={(e) => setView(+e.target.value)}
          >
            <option value={1}>Fit</option>
            <option value={0.75}>75% of fit</option>
            <option value={1.5}>150% of fit</option>
            <option value={2}>200% of fit</option>
          </select>
        </div>
      </div>
      <div
        className="stage-wrap"
        ref={wrap}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) s.select([]);
        }}
      >
        <div className="stage" style={{ width: w, height: h }}>
          <canvas
            ref={canvas}
            aria-label="Composition preview"
            onPointerDown={selectCanvas}
          />
          {!s.project.scenes.some((sc) => sc.layers.length) && (
            <div className="empty-stage">
              <div className="empty-mark">↗</div>
              <h2>Make your first move.</h2>
              <p>
                Add text, a shape or an image.
                <br />
                Your canvas is ready when you are.
              </p>
              <div className="empty-actions">
                <button onClick={() => s.add("text")}>
                  T <span>Add text</span>
                </button>
                <button onClick={() => s.add("shape")}>
                  □ <span>Add shape</span>
                </button>
              </div>
            </div>
          )}
          {selected.map(({ l, sc }) => {
            if (
              !l.visible ||
              l.type === "audio" ||
              s.time < sc.start + l.start ||
              s.time >=
                Math.min(
                  sc.start + sc.duration,
                  sc.start + l.start + l.duration,
                )
            )
              return null;
            const { at, b } = layerBox(l, sc.start);
            const offset =
              l.type === "cursor"
                ? cursorPoint(l, s.time - sc.start - l.start)
                : { x: 0, y: 0 };
            const radians = (at.rotation * Math.PI) / 180;
            const cx =
              at.x +
              at.scale *
                (offset.x * Math.cos(radians) - offset.y * Math.sin(radians));
            const cy =
              at.y +
              at.scale *
                (offset.x * Math.sin(radians) + offset.y * Math.cos(radians));
            const camera = cameraAt(sc, s.time, s.project.settings);
            const pivot = cameraPoint(
              { x: cx, y: cy },
              camera,
              l.props.screenSpace,
            );
            const zoom = l.props.screenSpace ? 1 : camera.zoom;
            return (
              <div
                key={l.id}
                className={"selection " + (l.locked ? "locked" : "")}
                style={{
                  left:
                    (pivot.x - b.width * at.anchor.x * at.scale * zoom) * ratio,
                  top:
                    (pivot.y - b.height * at.anchor.y * at.scale * zoom) *
                    ratio,
                  width: b.width * at.scale * zoom * ratio,
                  height: b.height * at.scale * zoom * ratio,
                  transform: `rotate(${at.rotation}deg)`,
                  transformOrigin: `${at.anchor.x * 100}% ${at.anchor.y * 100}%`,
                }}
                onPointerDown={(e) => drag(e, "move", l)}
              >
                <span className="selection-name">
                  {l.name}
                  {l.locked ? " · locked" : ""}
                </span>
                {!l.locked && (
                  <>
                    <button
                      aria-label="Scale selected layer"
                      title="Drag to scale uniformly"
                      className="handle scale-handle"
                      onPointerDown={(e) => drag(e, "scale", l)}
                    />
                    <button
                      aria-label="Rotate selected layer"
                      title="Drag to rotate; hold Shift for 15° steps"
                      className="handle rotate-handle"
                      onPointerDown={(e) => drag(e, "rotate", l)}
                    />
                  </>
                )}
              </div>
            );
          })}
          {selected
            .filter(
              ({ l, sc }) =>
                l.type === "rig" &&
                l.visible &&
                s.time >= sc.start + l.start &&
                s.time <
                  Math.min(
                    sc.start + sc.duration,
                    sc.start + l.start + l.duration,
                  ),
            )
            .map(({ l, sc }) => (
              <RigOverlay
                key={"rig-" + l.id}
                layer={l}
                scene={sc}
                ratio={ratio}
              />
            ))}
          {selected
            .filter(
              ({ l, sc }) =>
                l.type === "cursor" &&
                l.visible &&
                s.time >= sc.start + l.start &&
                s.time < sc.start + sc.duration,
            )
            .map(({ l, sc }) => (
              <CursorPath
                key={"path-" + l.id}
                layer={l}
                sceneStart={sc.start}
                ratio={ratio}
              />
            ))}
        </div>
        <span className="stage-caption">
          {s.project.settings.aspect} · {s.project.settings.fps} FPS · CANVAS 2D
        </span>
      </div>
    </section>
  );
}

function CursorPath({
  layer,
  sceneStart,
  ratio,
}: {
  layer: Layer;
  sceneStart: number;
  ratio: number;
}) {
  const s = useStore();
  const at = layerAt(layer, s.time - sceneStart - layer.start),
    a = (at.rotation * Math.PI) / 180;
  const scene = s.project.scenes.find((sc) =>
    sc.layers.some((l) => l.id === layer.id),
  )!;
  const camera = cameraAt(scene, s.time, s.project.settings);
  const zoom = layer.props.screenSpace ? 1 : camera.zoom;
  const screen = (p: { x: number; y: number }) => {
    const x = p.x - 72 * at.anchor.x + 8,
      y = p.y - 92 * at.anchor.y + 4;
    const pos = cameraPoint(
      {
        x: at.x + at.scale * (x * Math.cos(a) - y * Math.sin(a)),
        y: at.y + at.scale * (x * Math.sin(a) + y * Math.cos(a)),
      },
      camera,
      layer.props.screenSpace,
    );
    return { x: pos.x * ratio, y: pos.y * ratio };
  };
  const pointDrag = (e: React.PointerEvent, i: number) => {
    if (layer.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX,
      y = e.clientY,
      initial = layer.props.points[i];
    s.begin();
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - x) / ratio / at.scale / zoom,
        dy = (ev.clientY - y) / ratio / at.scale / zoom;
      let lx = dx * Math.cos(a) + dy * Math.sin(a),
        ly = -dx * Math.sin(a) + dy * Math.cos(a);
      if (ev.shiftKey) {
        if (Math.abs(lx) > Math.abs(ly)) ly = 0;
        else lx = 0;
      }
      editLayer(layer.id, (l) => {
        l.props.points[i].x = initial.x + lx;
        l.props.points[i].y = initial.y + ly;
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      s.end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  const ordered = [...layer.props.points]
    .sort((a, b) => a.time - b.time)
    .map(screen);
  return (
    <div className="cursor-path">
      <svg>
        <polyline
          points={ordered.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#adc4ff"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>
      {layer.props.points.map((p, i) => {
        const pos = screen(p);
        return (
          <button
            key={i}
            disabled={layer.locked}
            aria-label={`Cursor target ${i + 1}`}
            title={`Target ${i + 1}: drag to move; Shift constrains direction`}
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={(e) => pointDrag(e, i)}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
