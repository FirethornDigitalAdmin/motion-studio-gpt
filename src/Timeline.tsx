import { useRef } from "react";
import { useStore, activeScene } from "./store";
import { type Layer, type Scene } from "./model";
import { Field } from "./Controls";
export default function Timeline() {
  const s = useStore(),
    scroll = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null);
  const px = s.zoom,
    width = Math.max(700, s.project.settings.durationSec * px);
  const scene = activeScene(s);
  const gesture = (e: React.PointerEvent, change: (dt: number) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const x = e.clientX;
    s.begin();
    const move = (ev: PointerEvent) =>
      change(
        Math.round(((ev.clientX - x) / px) * s.project.settings.fps) /
          s.project.settings.fps,
      );
    const up = () => {
      s.end();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  const dragScene = (e: React.PointerEvent, sc: Scene, mode: string) =>
    gesture(e, (dt) =>
      s.edit((p) => {
        const target = p.scenes.find((x) => x.id === sc.id)!;
        if (mode === "move")
          target.start = Math.max(
            0,
            Math.min(p.settings.durationSec - sc.duration, sc.start + dt),
          );
        if (mode === "start") {
          const start = Math.max(
            0,
            Math.min(
              sc.start + sc.duration - 1 / p.settings.fps,
              sc.start + dt,
            ),
          );
          target.duration = sc.duration + sc.start - start;
          target.start = start;
        }
        if (mode === "end")
          target.duration = Math.max(
            1 / p.settings.fps,
            Math.min(p.settings.durationSec - sc.start, sc.duration + dt),
          );
      }),
    );
  const dragLayer = (
    e: React.PointerEvent,
    l: Layer,
    sc: Scene,
    mode: string,
  ) => {
    if (l.locked) return;
    s.select(s.selected.includes(l.id) ? s.selected : [l.id], sc.id);
    gesture(e, (dt) =>
      s.edit((p) => {
        const target = p.scenes
          .flatMap((x) => x.layers)
          .find((x) => x.id === l.id)!;
        if (mode === "move")
          target.start = Math.max(
            0,
            Math.min(sc.duration - 1 / p.settings.fps, l.start + dt),
          );
        if (mode === "start") {
          const start = Math.max(
            0,
            Math.min(l.start + l.duration - 1 / p.settings.fps, l.start + dt),
          );
          target.duration = l.start + l.duration - start;
          target.start = start;
        }
        if (mode === "end")
          target.duration = Math.max(
            1 / p.settings.fps,
            Math.min(sc.duration - l.start, l.duration + dt),
          );
      }),
    );
  };
  const scrub = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const update = (x: number) => s.setTime((x - rect.left) / px);
    update(e.clientX);
    const move = (ev: PointerEvent) => update(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  return (
    <section className="timeline">
      <header className="timeline-toolbar">
        <div>
          <span className="tiny-label">TIMELINE</span>
          <span className="tag">{s.project.scenes.length} scenes</span>
        </div>
        <div className="playback">
          <button
            aria-label="Replay"
            title="Return to frame zero and play"
            onClick={() => useStore.setState({ time: 0, playing: true })}
          >
            ↶
          </button>
          <button
            aria-label="Previous frame"
            title="Step one frame left (←)"
            onClick={() => {
              useStore.setState({ playing: false });
              s.setTime(s.time - 1 / s.project.settings.fps);
            }}
          >
            ‹
          </button>
          <button
            className="play"
            aria-label={s.playing ? "Pause" : "Play"}
            title="Play or pause (Space)"
            onClick={() => useStore.setState({ playing: !s.playing })}
          >
            {s.playing ? "Ⅱ" : "▶"}
          </button>
          <button
            aria-label="Next frame"
            title="Step one frame right (→)"
            onClick={() => {
              useStore.setState({ playing: false });
              s.setTime(s.time + 1 / s.project.settings.fps);
            }}
          >
            ›
          </button>
          <button
            aria-label="Loop"
            title="Repeat playback at the end"
            className={s.loop ? "active" : ""}
            onClick={() => useStore.setState({ loop: !s.loop })}
          >
            ↻
          </button>
          <span className="timecode">
            {s.time.toFixed(2)}
            <small> / {s.project.settings.durationSec.toFixed(2)} s</small>
            <b>F {Math.round(s.time * s.project.settings.fps)}</b>
          </span>
          <Field
            label="Playhead time"
            min={0}
            max={s.project.settings.durationSec - 1 / s.project.settings.fps}
            step={1 / s.project.settings.fps}
            value={s.time}
            onChange={s.setTime}
          />
        </div>
        <label className="zoom-label" title="Change timeline scale">
          −{" "}
          <input
            aria-label="Timeline zoom"
            type="range"
            min={30}
            max={240}
            value={px}
            onChange={(e) => useStore.setState({ zoom: +e.target.value })}
          />{" "}
          +
        </label>
      </header>
      <div className="timeline-body">
        <div className="track-labels" ref={labels}>
          <div className="ruler-label">TRACKS</div>
          <div className="scene-track-label">Scenes</div>
          {scene?.layers.map((l) => (
            <div
              className={
                "track-name " + (s.selected.includes(l.id) ? "selected" : "")
              }
              key={l.id}
              onClick={(e) =>
                s.select(
                  e.shiftKey ? [...new Set([...s.selected, l.id])] : [l.id],
                  scene.id,
                )
              }
            >
              <span className="type-symbol">
                {l.type === "text"
                  ? "T"
                  : l.type === "image"
                    ? "▧"
                    : l.type === "audio"
                      ? "♫"
                      : l.type === "cursor"
                        ? "↖"
                        : "□"}
              </span>
              {l.name}
            </div>
          ))}
          {!scene?.layers.length && (
            <div className="timeline-empty-label">No layers yet</div>
          )}
        </div>
        <div
          className="timeline-scroll"
          ref={scroll}
          onScroll={(e) => {
            if (labels.current)
              labels.current.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div
            className="tracks"
            style={{
              width,
              minHeight: Math.max(175, 86 + (scene?.layers.length || 0) * 38),
            }}
          >
            <div className="ruler" onPointerDown={scrub}>
              {Array.from(
                { length: Math.ceil(s.project.settings.durationSec) + 1 },
                (_, i) => (
                  <span key={i} style={{ left: i * px }}>
                    {i === 0 ? "0" : `${i}s`}
                  </span>
                ),
              )}
            </div>
            <div className="scene-track">
              {s.project.scenes.map((sc) => (
                <div
                  key={sc.id}
                  data-testid={"scene-" + sc.id}
                  className={
                    "scene-block " + (sc.id === s.sceneId ? "active" : "")
                  }
                  style={{ left: sc.start * px, width: sc.duration * px }}
                  onPointerDown={(e) => {
                    s.select([], sc.id);
                    dragScene(e, sc, "move");
                  }}
                >
                  <i
                    className="bar-edge left"
                    title="Drag scene start"
                    onPointerDown={(e) => dragScene(e, sc, "start")}
                  />
                  <span>{sc.name}</span>
                  <i
                    className="bar-edge right"
                    title="Drag scene end"
                    onPointerDown={(e) => dragScene(e, sc, "end")}
                  />
                </div>
              ))}
            </div>
            {scene?.layers.map((l) => (
              <div className="layer-track" key={l.id} onPointerDown={scrub}>
                <div
                  className={
                    "layer-bar " +
                    (s.selected.includes(l.id) ? "selected" : "") +
                    (l.locked ? " locked" : "")
                  }
                  data-testid={"bar-" + l.id}
                  style={{
                    left: (scene.start + l.start) * px,
                    width: l.duration * px,
                    opacity: l.visible ? 1 : 0.4,
                  }}
                  onPointerDown={(e) => dragLayer(e, l, scene, "move")}
                >
                  <i
                    className="bar-edge left"
                    title="Drag layer start"
                    onPointerDown={(e) => dragLayer(e, l, scene, "start")}
                  />
                  {l.type === "audio" && <Waveform layer={l} />}
                  <span>{l.name}</span>
                  <i
                    className="bar-edge right"
                    title="Drag layer end"
                    onPointerDown={(e) => dragLayer(e, l, scene, "end")}
                  />
                </div>
                {Object.entries(l.keyframes).flatMap(([prop, keys], pi) =>
                  keys.map((k, ki) => (
                    <button
                      key={prop + ki}
                      className="diamond"
                      data-testid={`key-${prop}-${ki}`}
                      title={`${prop}: ${k.value} at ${k.time.toFixed(2)}s. Drag to change time.`}
                      style={{
                        left: (scene.start + l.start + k.time) * px,
                        top: 7 + (pi % 3) * 8,
                      }}
                      onPointerDown={(e) => {
                        if (l.locked) return;
                        s.select([l.id], scene.id);
                        gesture(e, (dt) =>
                          s.edit((p) => {
                            const target = p.scenes
                              .flatMap((sc) => sc.layers)
                              .find((x) => x.id === l.id)!;
                            target.keyframes[prop][ki].time = Math.max(
                              0,
                              Math.min(l.duration, k.time + dt),
                            );
                          }),
                        );
                      }}
                      onDoubleClick={() =>
                        s.setTime(scene.start + l.start + k.time)
                      }
                    />
                  )),
                )}
              </div>
            ))}
            <div className="playhead" style={{ left: s.time * px }}>
              <span />
            </div>
            {!scene?.layers.length && (
              <div className="timeline-empty">
                Add a layer to start building your timeline
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function Waveform({ layer }: { layer: Layer }) {
  const asset = useStore((s) =>
    s.project.assets.find((a) => a.id === layer.props.assetId),
  );
  const envelope = asset?.envelope;
  if (!envelope?.length) return null;
  const rate = asset?.envelopeRate ?? 60;
  const points = Array.from({ length: 80 }, (_, i) => {
    const position =
      (layer.props.audioOffset + (i / 79) * layer.duration) * rate;
    return `${(i / 79) * 100},${50 - (envelope[Math.floor(position)] ?? 0) * 43}`;
  }).join(" ");
  return (
    <svg
      className="audio-waveform"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="Audio waveform"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        transform="translate(0 100) scale(1 -1)"
      />
    </svg>
  );
}
