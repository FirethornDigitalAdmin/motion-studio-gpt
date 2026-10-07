import { useState } from "react";
import { activeLayer, activeScene, useStore, editLayer } from "./store";
import { preset, stagger, type Easing, type Layer } from "./model";
import { Field, EaseEditor } from "./Controls";
export function AnimationTools() {
  const s = useStore(),
    l = activeLayer(s);
  const [kind, setKind] = useState("slide-in"),
    [direction, setDirection] = useState("left"),
    [distance, setDistance] = useState(400),
    [delay, setDelay] = useState(0),
    [duration, setDuration] = useState(0.6),
    [easing, setEasing] = useState<Easing>("ease-out"),
    [order, setOrder] = useState("forward"),
    [interval, setInterval] = useState(0.1),
    [seed, setSeed] = useState(42);
  if (!l) return null;
  return (
    <>
      <div className="property-section">
        <div className="section-heading">
          Animation presets <span>↗</span>
        </div>
        <p className="muted">
          Generate keyframes you can edit on the timeline.
        </p>
        <label className="field">
          <span>Movement</span>
          <select
            aria-label="Animation preset"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {[
              "slide-in",
              "slide-out",
              "fade-in",
              "fade-out",
              "scale-in",
              "scale-out",
            ].map((k) => (
              <option key={k} value={k}>
                {k.replace("-", " ")}
              </option>
            ))}
          </select>
        </label>
        {kind.startsWith("slide") && (
          <>
            <label className="field">
              <span>Direction</span>
              <select
                aria-label="Preset direction"
                title="The side the layer enters from or exits towards"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                {["left", "right", "up", "down"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <Field
              label="Distance"
              min={0}
              value={distance}
              title="Travel in project pixels from the layer's base position"
              onChange={setDistance}
            />
          </>
        )}
        <div className="field-grid">
          <Field
            label="Preset delay"
            min={0}
            max={l.duration}
            step={0.1}
            value={delay}
            title="Seconds after this layer starts"
            onChange={setDelay}
          />
          <Field
            label="Preset duration"
            min={0.01}
            step={0.1}
            value={duration}
            title="Length of the animation in seconds"
            onChange={setDuration}
          />
        </div>
        <EaseEditor label="Preset easing" value={easing} onChange={setEasing} />
        <button
          className="wide"
          disabled={l.locked || delay + duration > l.duration}
          title="Replace keyframes for this preset's property on selected unlocked layers; Undo restores the previous keys"
          onClick={() =>
            s.edit((p) => {
              for (const sc of p.scenes)
                for (const target of sc.layers)
                  if (s.selected.includes(target.id) && !target.locked)
                    preset(
                      target,
                      kind,
                      direction,
                      distance,
                      delay,
                      Math.min(duration, target.duration - delay),
                      easing,
                    );
            })
          }
        >
          Apply preset
        </button>
        {delay + duration > l.duration && (
          <p className="muted">Delay + duration must fit inside the layer.</p>
        )}
      </div>
      {s.selected.length > 1 && (
        <div className="property-section">
          <div className="section-heading">Stagger selection</div>
          <label className="field">
            <span>Order</span>
            <select
              aria-label="Stagger order"
              title="Forward uses the scene's bottom-to-top layer order"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="forward">Forward</option>
              <option value="reverse">Reverse</option>
              <option value="random">Seeded random</option>
            </select>
          </label>
          <Field
            label="Stagger interval"
            min={0}
            step={0.05}
            value={interval}
            onChange={setInterval}
            title="Time in seconds between each selected layer's start"
          />
          {order === "random" && (
            <Field
              label="Random seed"
              min={0}
              step={1}
              value={seed}
              onChange={setSeed}
              title="The same seed always produces the same ordering"
            />
          )}
          <button
            className="wide"
            title="Offset selected unlocked layer starts from the earliest selected start"
            onClick={() =>
              s.edit((p) => {
                for (const sc of p.scenes) {
                  const layers = sc.layers.filter(
                    (l) => s.selected.includes(l.id) && !l.locked,
                  );
                  if (layers.length) stagger(layers, order, interval, seed);
                }
              })
            }
          >
            Apply stagger
          </button>
        </div>
      )}
    </>
  );
}
export function CursorTools() {
  const s = useStore(),
    l = activeLayer(s),
    sc = activeScene(s);
  if (l?.type !== "cursor") return null;
  const t = Math.max(0, s.time - (sc?.start || 0) - l.start);
  const edit = (f: (l: Layer) => void) => editLayer(l.id, f);
  return (
    <div className="property-section">
      <div className="section-heading">
        Cursor path <span>↖</span>
      </div>
      <p className="muted">
        Drag points on the canvas. Targets use offsets from the cursor layer, in
        pixels.
      </p>
      <label
        className="check-field"
        title="Use smoothstep interpolation between path targets"
      >
        <input
          aria-label="Smooth cursor path"
          type="checkbox"
          checked={l.props.smoothing}
          disabled={l.locked}
          onChange={(e) => edit((l) => (l.props.smoothing = e.target.checked))}
        />{" "}
        Smooth movement
      </label>
      <button
        className="wide"
        disabled={l.locked}
        title="Add a path target at the playhead, at the layer's origin"
        onClick={() =>
          edit((l) => l.props.points.push({ time: t, x: 0, y: 0 }))
        }
      >
        Add path point
      </button>
      {l.props.points.map((point, i) => (
        <div className="key-card" key={i}>
          <div className="section-heading">
            Target {i + 1}
            <button
              className="small-icon"
              aria-label={`Remove target ${i + 1}`}
              disabled={l.locked}
              onClick={() => edit((l) => l.props.points.splice(i, 1))}
            >
              ×
            </button>
          </div>
          <Field
            label={`Target ${i + 1} time`}
            min={0}
            max={l.duration}
            step={0.1}
            value={point.time}
            onChange={(n) => edit((l) => (l.props.points[i].time = n))}
            disabled={l.locked}
          />
          <div className="field-grid">
            <Field
              label={`Target ${i + 1} X`}
              value={point.x}
              onChange={(n) => edit((l) => (l.props.points[i].x = n))}
              disabled={l.locked}
            />
            <Field
              label={`Target ${i + 1} Y`}
              value={point.y}
              onChange={(n) => edit((l) => (l.props.points[i].y = n))}
              disabled={l.locked}
            />
          </div>
        </div>
      ))}
      <div className="section-heading" style={{ marginTop: 18 }}>
        Clicks & ripples
      </div>
      <button
        className="wide"
        disabled={l.locked}
        title="Add a click ripple at the playhead"
        onClick={() => edit((l) => l.props.clicks.push(t))}
      >
        Add click at playhead
      </button>
      {l.props.clicks.map((click, i) => (
        <div className="click-row" key={i}>
          <Field
            label={`Click ${i + 1} time`}
            min={0}
            max={l.duration}
            step={0.1}
            value={click}
            onChange={(n) => edit((l) => (l.props.clicks[i] = n))}
            disabled={l.locked}
          />
          <button
            aria-label={`Remove click ${i + 1}`}
            disabled={l.locked}
            onClick={() => edit((l) => l.props.clicks.splice(i, 1))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
