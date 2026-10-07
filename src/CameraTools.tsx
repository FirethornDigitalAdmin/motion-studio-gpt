import { useState } from "react";
import { activeScene, useStore } from "./store";
import { id, type Scene } from "./model";
import { Field, EaseEditor } from "./Controls";
export default function CameraTools() {
  const s = useStore(),
    scene = activeScene(s);
  const [selected, setSelected] = useState("");
  if (!scene) return null;
  const shot = scene.shots.find((x) => x.id === selected);
  const edit = (f: (shot: Scene["shots"][number]) => void) =>
    s.edit((p) => {
      const target = p.scenes
        .find((x) => x.id === scene.id)!
        .shots.find((x) => x.id === selected);
      if (target) f(target);
    });
  return (
    <div className="property-section">
      <div className="section-heading">
        Camera cuts <span>◉</span>
      </div>
      <p className="muted">
        Cut to a face, then gently push in. Gaps return to the wide shot.
      </p>
      <select
        aria-label="Camera shot"
        value={shot?.id || ""}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Choose a shot</option>
        {scene.shots.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} · {x.start.toFixed(1)}s
          </option>
        ))}
      </select>
      <button
        className="subtle"
        onClick={() => {
          const key = id();
          const start = Math.max(
            0,
            Math.min(scene.duration - 0.01, s.time - scene.start),
          );
          s.edit((p) =>
            p.scenes
              .find((x) => x.id === scene.id)!
              .shots.push({
                id: key,
                name: `Shot ${scene.shots.length + 1}`,
                start,
                duration: Math.min(4, scene.duration - start),
                x: p.settings.width / 2,
                y: p.settings.height / 2,
                zoom: 1,
                endZoom: 1,
                easing: "ease-in-out",
              }),
          );
          setSelected(key);
        }}
      >
        Add camera shot
      </button>
      {shot && (
        <>
          <label className="field">
            <span>Shot name</span>
            <input
              aria-label="Shot name"
              value={shot.name}
              onFocus={s.begin}
              onBlur={s.end}
              onChange={(e) => edit((x) => (x.name = e.target.value))}
            />
          </label>
          <div className="field-grid">
            {(["start", "duration", "x", "y", "zoom", "endZoom"] as const).map(
              (prop) => (
                <Field
                  key={prop}
                  label={
                    {
                      start: "Shot start",
                      duration: "Shot duration",
                      x: "Focus X",
                      y: "Focus Y",
                      zoom: "Shot zoom",
                      endZoom: "End zoom",
                    }[prop]
                  }
                  value={shot[prop]}
                  min={
                    prop === "start"
                      ? 0
                      : prop === "duration"
                        ? 0.01
                        : prop === "zoom" || prop === "endZoom"
                          ? 0.1
                          : undefined
                  }
                  max={prop === "zoom" || prop === "endZoom" ? 10 : undefined}
                  step={0.05}
                  onChange={(n) => edit((x) => (x[prop] = n))}
                />
              ),
            )}
          </div>
          <EaseEditor
            value={shot.easing}
            onChange={(e) => edit((x) => (x.easing = e))}
          />
          <button
            className="subtle"
            onClick={() => s.setTime(scene.start + shot.start)}
          >
            Go to shot
          </button>
          <button
            className="subtle"
            onClick={() => {
              s.edit((p) => {
                const sc = p.scenes.find((x) => x.id === scene.id)!;
                sc.shots = sc.shots.filter((x) => x.id !== shot.id);
              });
              setSelected("");
            }}
          >
            Remove camera shot
          </button>
        </>
      )}
    </div>
  );
}
