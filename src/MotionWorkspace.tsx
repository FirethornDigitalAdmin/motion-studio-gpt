import { useEffect, useMemo, useRef, useState } from "react";
import { activeLayer, activeScene, editLayer, useStore } from "./store";
import {
  ease,
  properties,
  poseProperties,
  valueAt,
  type Layer,
  type Property,
  type Easing,
} from "./model";
import { Field, EaseEditor } from "./Controls";
import { putKey } from "./rigging";
import { followProperties, followValue } from "./followThrough";
import {
  curveKeys,
  graphSamples,
  moveCurveKey,
  motionFrame,
  keyIssues,
  scanTimes,
  type MotionIssue,
} from "./motionAnalysis";
import Timeline from "./Timeline";
const name = (p: string) =>
  p === "rigTime"
    ? "Action time"
    : p.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
function useDrag() {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return (
    e: React.PointerEvent,
    change: (e: PointerEvent) => void,
    complete?: () => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup.current?.();
    useStore.getState().begin();
    useStore.setState({ playing: false });
    const move = (ev: PointerEvent) => change(ev),
      end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        cleanup.current = null;
        useStore.getState().end();
        complete?.();
      };
    cleanup.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  };
}
function BezierHandles({
  value,
  onChange,
  disabled,
}: {
  value: Easing;
  onChange: (e: Easing) => void;
  disabled: boolean;
}) {
  const drag = useDrag();
  if (typeof value !== "object" || value.type !== "bezier") return null;
  const low = Math.min(-0.2, value.y1, value.y2),
    high = Math.max(1.2, value.y1, value.y2),
    X = (n: number) => 18 + n * 154,
    Y = (n: number) => 94 - ((n - low) / (high - low)) * 80;
  return (
    <svg
      className="bezier-handles"
      viewBox="0 0 190 112"
      aria-label="Draggable Bézier handles"
    >
      <path
        d={`M${X(0)} ${Y(0)} L${X(value.x1)} ${Y(value.y1)} M${X(1)} ${Y(1)} L${X(value.x2)} ${Y(value.y2)}`}
        stroke="#67708f"
        fill="none"
      />
      <path
        d={`M${X(0)} ${Y(0)} C${X(value.x1)} ${Y(value.y1)} ${X(value.x2)} ${Y(value.y2)} ${X(1)} ${Y(1)}`}
        stroke="#aabaff"
        strokeWidth="2"
        fill="none"
      />
      {([1, 2] as const).map((i) => (
        <circle
          key={i}
          cx={X(value[i === 1 ? "x1" : "x2"])}
          cy={Y(value[i === 1 ? "y1" : "y2"])}
          r={6}
          fill={i === 1 ? "#70dcff" : "#ffc16b"}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={`Curve handle ${i}`}
          onKeyDown={(e) => {
            if (
              disabled ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            const axis =
                e.key === "ArrowLeft" || e.key === "ArrowRight" ? "x" : "y",
              key = (axis + i) as "x1" | "x2" | "y1" | "y2",
              delta =
                e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0.05;
            onChange({
              ...value,
              [key]:
                axis === "x"
                  ? Math.max(0, Math.min(1, value[key] + delta))
                  : value[key] + delta,
            });
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            const rect =
              e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            drag(e, (ev) => {
              onChange({
                ...value,
                [i === 1 ? "x1" : "x2"]: Math.max(
                  0,
                  Math.min(
                    1,
                    (((ev.clientX - rect.left) / rect.width) * 190 - 18) / 154,
                  ),
                ),
                [i === 1 ? "y1" : "y2"]:
                  low +
                  ((94 - ((ev.clientY - rect.top) / rect.height) * 112) / 80) *
                    (high - low),
              });
            });
          }}
        />
      ))}
      <text x="18" y="109" fill="#aab0c4" fontSize="9">
        drag handles · arrows nudge
      </text>
    </svg>
  );
}
function CurveEditor({ layer }: { layer: Layer }) {
  const s = useStore(),
    scene = activeScene(s)!,
    [property, setProperty] = useState<Property>(
      () => properties.find((p) => layer.keyframes[p]?.length) || "x",
    ),
    [selected, setSelected] = useState<number | null>(null),
    [message, setMessage] = useState("");
  const [dragDomain, setDragDomain] = useState<{
    low: number;
    high: number;
  } | null>(null);
  const keys = curveKeys(layer, property),
    selectedKey =
      keys.find((k) => Math.abs(k.time - (selected ?? -1)) < 1e-7) || keys[0],
    time = Math.max(0, s.time - scene.start - layer.start),
    samples = useMemo(() => graphSamples(layer, property), [layer, property]);
  const hasFollow =
    layer.type === "rig" &&
    layer.props.followThrough.enabled &&
    followProperties(layer).includes(property);
  const settled = useMemo(
    () =>
      hasFollow
        ? samples.map((p) => ({
            time: p.time,
            value: followValue(layer, property, p.time),
          }))
        : [],
    [hasFollow, samples, layer, property],
  );
  const values = [
      ...settled.map((s) => s.value),
      ...samples.map((s) => s.value),
      ...keys.map((k) => Number(k.value)),
    ],
    min = Math.min(...values),
    max = Math.max(...values),
    pad = Math.max(0.05, (max - min) * 0.15);
  const domain = dragDomain || { low: min - pad, high: max + pad },
    width = 720,
    height = 192,
    X = (t: number) => 52 + (t / layer.duration) * 650,
    Y = (v: number) =>
      168 - ((v - domain.low) / (domain.high - domain.low)) * 145;
  const path = samples
      .map((p, i) => `${i ? "L" : "M"}${X(p.time)},${Y(p.value)}`)
      .join(" "),
    drag = useDrag();
  const smooth =
    layer.props.continuousJoints &&
    [
      ...poseProperties,
      "headAngle",
      "armAngle",
      "gazeX",
      "gazeY",
      "blink",
    ].includes(property) &&
    !property.endsWith("Length") &&
    !property.endsWith("Bend");
  const move = (oldTime: number, t: number, v: number) => {
    let next = oldTime;
    try {
      editLayer(layer.id, (l) => {
        next = moveCurveKey(l, property, oldTime, t, v, s.project.settings.fps);
      });
      setSelected(next);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
    return next;
  };
  const setEase = (e: Easing) => {
    if (!selectedKey || layer.locked) return;
    editLayer(layer.id, (l) => {
      const k = l.keyframes[property].find((k) => k.time === selectedKey.time);
      if (k) k.easing = e;
    });
  };
  return (
    <div className="curve-workspace">
      <div className="curve-main">
        <div className="curve-toolbar">
          <strong>{layer.name}</strong>
          <label>
            Property{" "}
            <select
              aria-label="Graph property"
              value={property}
              onChange={(e) => {
                setProperty(e.target.value as Property);
                setSelected(null);
              }}
            >
              {properties.map((p) => (
                <option key={p} value={p}>
                  {name(p)}
                  {layer.keyframes[p]?.length
                    ? " · " + layer.keyframes[p].length
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {keys.length > 0 && (
            <label>
              Key
              <select
                aria-label="Graph selected key"
                value={selectedKey.time}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {keys.map((k, i) => (
                  <option key={i} value={k.time}>
                    {k.time.toFixed(3)}s · {Number(k.value).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={layer.locked || time > layer.duration}
            onClick={() => {
              editLayer(layer.id, (l) => {
                if (time > 0 && !l.keyframes[property]?.length)
                  putKey(l, property, 0, valueAt(l, property, 0), "linear");
                putKey(
                  l,
                  property,
                  time,
                  valueAt(l, property, time),
                  "ease-in-out",
                );
              });
              setSelected(time);
            }}
          >
            Add key at playhead
          </button>
          <span>{valueAt(layer, property, time).toFixed(3)}</span>
        </div>
        <svg
          className="value-graph"
          viewBox={`0 0 ${width} ${height}`}
          aria-label="Animation value graph"
        >
          {Array.from({ length: 5 }, (_, i) => {
            const v = domain.low + ((domain.high - domain.low) * i) / 4;
            return (
              <g key={i}>
                <line x1="52" x2="702" y1={Y(v)} y2={Y(v)} stroke="#303747" />
                <text
                  x="46"
                  y={Y(v) + 3}
                  textAnchor="end"
                  fill="#939db6"
                  fontSize="10"
                >
                  {v.toFixed(Math.abs(v) > 20 ? 0 : 2)}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 7 }, (_, i) => {
            const t = (layer.duration * i) / 6;
            return (
              <g key={i}>
                <line x1={X(t)} x2={X(t)} y1="23" y2="168" stroke="#252d3c" />
                <text
                  x={X(t)}
                  y="187"
                  textAnchor="middle"
                  fill="#939db6"
                  fontSize="10"
                >
                  {t.toFixed(1)}s
                </text>
              </g>
            );
          })}
          <path d={path} fill="none" stroke="#aabaff" strokeWidth="2.4" />
          {hasFollow && (
            <path
              aria-label="Follow-through result"
              d={settled
                .map((p, i) => `${i ? "L" : "M"}${X(p.time)},${Y(p.value)}`)
                .join(" ")}
              fill="none"
              stroke="#69d9c9"
              strokeWidth="2"
            />
          )}
          <line
            x1={X(time)}
            x2={X(time)}
            y1="23"
            y2="168"
            stroke="#ffc16b"
            strokeDasharray="4 3"
          />
          {keys.map((k, i) => (
            <circle
              key={i}
              cx={X(k.time)}
              cy={Y(Number(k.value))}
              r={k === selectedKey ? 6 : 4}
              fill={k === selectedKey ? "#ffc16b" : "#c1cdff"}
              stroke="#191e29"
              strokeWidth="2"
              role="button"
              tabIndex={0}
              aria-label={`Graph key at ${k.time.toFixed(3)} seconds`}
              aria-pressed={k === selectedKey}
              aria-disabled={layer.locked}
              onClick={() => {
                setSelected(k.time);
                s.setTime(scene.start + layer.start + k.time);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(k.time);
                  s.setTime(scene.start + layer.start + k.time);
                  return;
                }
                if (
                  layer.locked ||
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                e.stopPropagation();
                const factor = e.shiftKey ? 10 : 1;
                const horizontal =
                  e.key === "ArrowLeft" || e.key === "ArrowRight";
                move(
                  k.time,
                  k.time +
                    (horizontal
                      ? ((e.key === "ArrowLeft" ? -1 : 1) * factor) /
                        s.project.settings.fps
                      : 0),
                  Number(k.value) +
                    (horizontal
                      ? 0
                      : (e.key === "ArrowUp" ? 1 : -1) *
                        factor *
                        (max - min > 10 ? 1 : 0.1)),
                );
              }}
              onPointerDown={(e) => {
                if (layer.locked) return;
                setSelected(k.time);
                const rect =
                    e.currentTarget.ownerSVGElement!.getBoundingClientRect(),
                  d = { ...domain };
                let current = k.time;
                setDragDomain(d);
                drag(
                  e,
                  (ev) => {
                    const t =
                        ((((ev.clientX - rect.left) / rect.width) * width -
                          52) /
                          650) *
                        layer.duration,
                      v =
                        d.low +
                        ((168 -
                          ((ev.clientY - rect.top) / rect.height) * height) /
                          145) *
                          (d.high - d.low);
                    current = move(current, t, v);
                  },
                  () => setDragDomain(null),
                );
              }}
            />
          ))}
        </svg>
        <p className="curve-caption">
          Layer-local seconds · drag a key or use arrow keys · Shift moves ten
          steps.{" "}
          {hasFollow &&
            "Lavender: authored keys. Mint: follow-through before contact solving. "}
          {smooth
            ? "Shape-preserving joint interpolation is active; outgoing easing is bypassed."
            : "The graph samples the same interpolation used in preview and export."}{" "}
          {layer.props.rigConstraints.length > 0
            ? "Contacts can override joint positions in the scene."
            : ""}
        </p>
        {message && (
          <p role="status" className="motion-message">
            {message}
          </p>
        )}
      </div>
      <aside className="curve-inspector">
        {selectedKey ? (
          <>
            <strong>Selected key · {selectedKey.time.toFixed(3)}s</strong>
            <div className="field-grid">
              <Field
                label="Graph key time"
                min={0}
                max={layer.duration}
                step={1 / s.project.settings.fps}
                value={selectedKey.time}
                disabled={layer.locked}
                onChange={(t) =>
                  move(selectedKey.time, t, Number(selectedKey.value))
                }
              />
              <Field
                label="Graph key value"
                step={0.1}
                value={Number(selectedKey.value)}
                disabled={layer.locked}
                onChange={(v) => move(selectedKey.time, selectedKey.time, v)}
              />
            </div>
            <fieldset disabled={layer.locked || smooth}>
              <legend>Outgoing segment</legend>
              <EaseEditor
                compact
                label="Graph easing"
                value={selectedKey.easing}
                onChange={setEase}
              />
              <BezierHandles
                value={selectedKey.easing}
                onChange={setEase}
                disabled={layer.locked || smooth}
              />
            </fieldset>
            <button
              disabled={layer.locked}
              onClick={() => {
                editLayer(layer.id, (l) => {
                  l.keyframes[property] = l.keyframes[property].filter(
                    (k) => k.time !== selectedKey.time,
                  );
                });
                setSelected(null);
              }}
            >
              Delete selected key
            </button>
          </>
        ) : (
          <p>
            Add a key or choose an animated property to start shaping movement.
          </p>
        )}
      </aside>
    </div>
  );
}
function Diagnostics() {
  const s = useStore(),
    scene = activeScene(s),
    [issues, setIssues] = useState<MotionIssue[]>([]),
    [status, setStatus] = useState("Not scanned"),
    [running, setRunning] = useState(false),
    [limit, setLimit] = useState(6000),
    [rate, setRate] = useState(24),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(scene?.duration || 1),
    [scannedProject, setScannedProject] = useState<typeof s.project | null>(
      null,
    );
  const [scannedSettings, setScannedSettings] = useState("");
  const settingsKey = [start, end, rate, limit].join(":");
  const cancelled = useRef(0),
    currentProject = useRef(s.project);
  currentProject.current = s.project;
  useEffect(
    () => () => {
      cancelled.current++;
    },
    [],
  );
  const live = scene ? motionFrame(scene, s.time, limit).issues : [];
  const scan = async () => {
    if (!scene) return;
    const generation = ++cancelled.current,
      project = s.project;
    let times: number[];
    try {
      times = scanTimes(
        project,
        scene,
        scene.start + start,
        scene.start + end,
        rate,
      );
    } catch (e) {
      setStatus((e as Error).message);
      return;
    }
    setRunning(true);
    setIssues([]);
    const found = new Map<string, MotionIssue>();
    for (const issue of keyIssues(scene)) found.set(issue.message, issue);
    let previous: ReturnType<typeof motionFrame> | undefined;
    try {
      for (let i = 0; i < times.length; i++) {
        if (generation !== cancelled.current) return;
        const frame = motionFrame(scene, times[i], limit, previous);
        previous = frame;
        for (const issue of frame.issues) {
          const key =
            issue.layerId +
            ":" +
            issue.kind +
            ":" +
            issue.message.split("(")[0].split(" target")[0].split(" misses")[0];
          const old = found.get(key);
          if (!old || (issue.amount || 0) > (old.amount || 0))
            found.set(key, issue);
        }
        if (i % 16 === 0) {
          setStatus(`Scanning ${i + 1} / ${times.length} frames`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (generation === cancelled.current) {
        setIssues(
          [...found.values()].sort((a, b) => a.time - b.time).slice(0, 150),
        );
        setScannedProject(project);
        setScannedSettings(settingsKey);
        setStatus(
          `${times.length} sampled frames · ${found.size} findings · ${times.length > 1 ? ((times.length - 1) / (times.at(-1)! - times[0])).toFixed(1) : "0"} samples/s`,
        );
      }
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      if (generation === cancelled.current) setRunning(false);
    }
  };
  const seek = (issue: MotionIssue) => {
    if (!scene) return;
    if (issue.layerId) s.select([issue.layerId], scene.id);
    s.setTime(
      Math.min(
        issue.time,
        s.project.settings.durationSec - 1 / s.project.settings.fps,
      ),
    );
    useStore.setState({ playing: false });
  };
  return (
    <div className="diagnostics-workspace">
      <aside>
        <strong>Motion diagnostics</strong>
        <p>
          Sample the selected scene for unreachable targets, missed pins,
          contact failures and fast joint movement. This is a technical check;
          it cannot judge acting quality.
        </p>
        <div className="field-grid">
          <Field
            label="Scan start"
            value={start}
            min={0}
            max={scene?.duration}
            step={0.1}
            onChange={setStart}
          />
          <Field
            label="Scan end"
            value={end}
            min={start}
            max={scene?.duration}
            step={0.1}
            onChange={setEnd}
          />
          <Field
            label="Sample rate"
            value={rate}
            min={1}
            max={60}
            onChange={setRate}
          />
          <Field
            label="Speed threshold"
            value={limit}
            min={1}
            step={100}
            onChange={setLimit}
          />
        </div>
        <button
          disabled={!scene || running || end <= start}
          onClick={() => void scan()}
        >
          Scan scene motion
        </button>
        {running && (
          <button
            onClick={() => {
              cancelled.current++;
              setRunning(false);
              setStatus("Scan cancelled");
            }}
          >
            Cancel scan
          </button>
        )}
        <p role="status">{status}</p>
        {scannedProject &&
          (scannedProject !== currentProject.current ||
            scannedSettings !== settingsKey) && (
            <p className="motion-message">
              Scene or scan settings changed. Scan again to refresh the
              findings.
            </p>
          )}
      </aside>
      <main>
        <strong>At the playhead · {s.time.toFixed(2)}s</strong>
        {live.length ? (
          live.slice(0, 15).map((v, i) => (
            <p key={i} className="live-motion-warning">
              {v.message}
            </p>
          ))
        ) : (
          <p className="muted">
            No reach or contact problems detected at this frame.
          </p>
        )}
        <strong>Scene findings · click to inspect the frame</strong>
        <div className="motion-issue-list">
          {issues.map((v, i) => (
            <button key={i} onClick={() => seek(v)}>
              <span className={"motion-severity " + v.severity}>
                {v.severity}
              </span>
              <time>{v.time.toFixed(2)}s</time>
              <span>{v.message}</span>
            </button>
          ))}
          {scannedProject && !issues.length && (
            <p className="muted">
              No problems found in the sampled frames. Shorter events between
              samples can still be missed.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
export default function MotionWorkspace() {
  const s = useStore(),
    layer = activeLayer(s),
    scene = activeScene(s);
  return (
    <section className="motion-workspace" aria-label="Motion workspace">
      <header className="motion-tabs">
        <div role="tablist" aria-label="Animation workspace">
          {(["timeline", "curves", "diagnostics"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={s.motionTab === t}
              aria-controls={"motion-" + t}
              onKeyDown={(e) => {
                const tabs = ["timeline", "curves", "diagnostics"] as const;
                let index = tabs.indexOf(t);
                if (e.key === "ArrowRight") index = (index + 1) % 3;
                else if (e.key === "ArrowLeft") index = (index + 2) % 3;
                else if (e.key === "Home") index = 0;
                else if (e.key === "End") index = 2;
                else return;
                e.preventDefault();
                e.stopPropagation();
                useStore.setState({ motionTab: tabs[index], playing: false });
                (
                  e.currentTarget.parentElement?.children[
                    index
                  ] as HTMLButtonElement
                )?.focus();
              }}
              onClick={() =>
                useStore.setState({ motionTab: t, playing: false })
              }
            >
              {t === "timeline"
                ? "Timeline"
                : t === "curves"
                  ? "Curve editor"
                  : "Diagnostics"}
            </button>
          ))}
        </div>
        {s.motionTab !== "timeline" && (
          <div className="motion-playback">
            <button
              aria-label={s.playing ? "Motion pause" : "Motion play"}
              onClick={() => useStore.setState({ playing: !s.playing })}
            >
              {s.playing ? "Ⅱ" : "▶"}
            </button>
            <input
              aria-label="Motion playhead"
              type="number"
              min={0}
              max={s.project.settings.durationSec}
              step={1 / s.project.settings.fps}
              value={Number(s.time.toFixed(3))}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (t >= 0 && t <= s.project.settings.durationSec) {
                  s.setTime(t);
                  useStore.setState({ playing: false });
                }
              }}
            />
            <span>s</span>
          </div>
        )}
        <div className="onion-options">
          <label title="Ghost poses for selected rig characters">
            <input
              aria-label="Motion onion skins"
              type="checkbox"
              checked={s.onionSkin}
              onChange={(e) =>
                useStore.setState({ onionSkin: e.target.checked })
              }
            />
            Rig onion skins
          </label>
          {s.onionSkin && (
            <>
              <label>
                Before
                <select
                  aria-label="Onion before poses"
                  value={s.onionBefore}
                  onChange={(e) =>
                    useStore.setState({ onionBefore: Number(e.target.value) })
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                After
                <select
                  aria-label="Onion after poses"
                  value={s.onionAfter}
                  onChange={(e) =>
                    useStore.setState({ onionAfter: Number(e.target.value) })
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Every
                <input
                  aria-label="Onion frame spacing"
                  type="number"
                  min={1}
                  max={30}
                  value={s.onionFrames}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= 30)
                      useStore.setState({ onionFrames: Math.round(n) });
                  }}
                />
                fr
              </label>
              <label>
                Opacity
                <input
                  aria-label="Onion opacity"
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={s.onionOpacity}
                  onChange={(e) =>
                    useStore.setState({ onionOpacity: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
        </div>
      </header>
      <div
        role="tabpanel"
        id={"motion-" + s.motionTab}
        className="motion-content"
      >
        {s.motionTab === "timeline" ? (
          <Timeline />
        ) : s.motionTab === "curves" ? (
          layer ? (
            <CurveEditor key={layer.id} layer={layer} />
          ) : (
            <p className="motion-empty">
              Select a layer to edit its animation curves. Mouth drawings and
              expressions are discrete keys; use the timeline for those.
            </p>
          )
        ) : (
          <Diagnostics key={scene?.id || "none"} />
        )}
      </div>
    </section>
  );
}
