import { useMemo, useState } from "react";
import { mouthShapes, layerAt, type Layer, type Scene } from "./model";
import { useStore, editLayer } from "./store";
import { bakeLipSync, parseSpeechAlignment, recordBlink } from "./lipSync";
import { putKey } from "./rigging";
import { rigExpressions } from "./character";
import { Field } from "./Controls";
const names: Record<string, string> = {
  auto: "Automatic",
  sil: "Rest / silence",
  PP: "M · B · P",
  FF: "F · V",
  TH: "TH",
  DD: "T · D",
  kk: "K · G",
  CH: "CH · SH",
  SS: "S · Z",
  nn: "N · L",
  RR: "R",
  aa: "AH",
  E: "EH / EE",
  I: "IH",
  O: "OH",
  U: "OO",
};
export default function FacialTools({
  layer,
  scene,
}: {
  layer: Layer;
  scene: Scene;
}) {
  const s = useStore(),
    time = Math.max(0, s.time - scene.start - layer.start),
    at = layerAt(layer, time);
  const audio = scene.layers.filter((l) => l.type === "audio");
  const [audioId, setAudioId] = useState(audio[0]?.id || ""),
    [transcript, setTranscript] = useState(""),
    [alignment, setAlignment] = useState(""),
    [status, setStatus] = useState("");
  const run = (f: () => void) => {
    try {
      f();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const mouthKeys = useMemo(
    () =>
      [...(layer.keyframes.mouthShape || [])].sort((a, b) => a.time - b.time),
    [layer.keyframes.mouthShape],
  );
  const current = mouthKeys.reduce(
    (index, k, i) => (k.time <= time ? i : index),
    -1,
  );
  const windowStart = Math.max(0, current - 30);
  const key = (
    property: "mouthShape" | "expression" | "gazeX" | "gazeY",
    value: string | number,
  ) =>
    editLayer(layer.id, (l) => {
      if (time > 0 && !l.keyframes[property]?.length)
        putKey(l, property, 0, l.props[property], "linear");
      putKey(l, property, time, value, "ease-in-out");
    });
  const missing =
    layer.type === "rig"
      ? mouthShapes.filter(
          (v) => v !== "auto" && !layer.props.rigAssets["mouth_" + v],
        )
      : [];
  return (
    <details className="facial-tools" open>
      <summary>Facial performance</summary>
      <div className="face-now">
        <span>AT {time.toFixed(2)}s</span>
        <strong>{names[at.props.mouthShape]}</strong>
      </div>
      <fieldset disabled={layer.locked || time >= layer.duration}>
        <label className="field">
          <span>Mouth shape</span>
          <select
            aria-label="Mouth shape"
            value={at.props.mouthShape}
            onChange={(e) => key("mouthShape", e.target.value)}
          >
            {mouthShapes.map((v) => (
              <option key={v} value={v}>
                {names[v]}
              </option>
            ))}
          </select>
        </label>
        <div className="mouth-palette" aria-label="Mouth drawing palette">
          {mouthShapes
            .filter((v) => v !== "auto")
            .map((v) => {
              const a = s.project.assets.find(
                (a) => a.id === layer.props.rigAssets["mouth_" + v],
              );
              return (
                <button
                  key={v}
                  aria-label={"Record mouth " + v}
                  aria-pressed={at.props.mouthShape === v}
                  title={names[v]}
                  onClick={() => key("mouthShape", v)}
                >
                  {a ? (
                    <img
                      alt=""
                      src={
                        "/api/asset?" +
                        new URLSearchParams({
                          path: a.relativePath,
                          folder: s.folder || "",
                        })
                      }
                    />
                  ) : (
                    <span>{v}</span>
                  )}
                  <small>{v}</small>
                </button>
              );
            })}
        </div>
        {missing.length > 0 && (
          <p className="muted">
            Missing rig mouth drawings: {missing.join(", ")}. Assign them in Rig
            builder.
          </p>
        )}
        {layer.type === "image" && (
          <p className="muted">
            Image characters use the registered mouth position and a drawn mouth
            overlay. Rigs use their separated mouth artwork.
          </p>
        )}
        <label className="field">
          <span>Acting expression</span>
          <select
            aria-label="Acting expression"
            value={at.props.expression}
            onChange={(e) => key("expression", e.target.value)}
          >
            {rigExpressions.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid">
          <Field
            label="Look X"
            value={at.props.gazeX}
            min={-1}
            max={1}
            step={0.1}
            onChange={(v) => key("gazeX", v)}
          />
          <Field
            label="Look Y"
            value={at.props.gazeY}
            min={-1}
            max={1}
            step={0.1}
            onChange={(v) => key("gazeY", v)}
          />
        </div>
        <button
          onClick={() =>
            run(() => {
              editLayer(layer.id, (l) => recordBlink(l, time));
              setStatus("Blink recorded: close, hold, reopen.");
            })
          }
        >
          Record blink
        </button>
        <details>
          <summary>Build speech track</summary>
          <label className="field">
            <span>Speech audio</span>
            <select
              aria-label="Speech audio"
              value={audioId}
              onChange={(e) => setAudioId(e.target.value)}
            >
              <option value="">Choose an audio layer</option>
              {audio.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Transcript</span>
            <textarea
              aria-label="Speech transcript"
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="The spoken words, exactly as recorded."
            />
          </label>
          <label className="field">
            <span>Alignment JSON (optional)</span>
            <textarea
              aria-label="Speech alignment JSON"
              rows={3}
              value={alignment}
              onChange={(e) => setAlignment(e.target.value)}
              placeholder="Timed mouth cues, Rhubarb or ElevenLabs alignment"
            />
          </label>
          <p className="muted">
            Transcript drafts follow the waveform and use approximate mouth
            shapes. Import timestamps for accurate timing. Times refer to the
            original audio file, before trimming.
          </p>
          <button
            disabled={!audioId || (!transcript.trim() && !alignment.trim())}
            onClick={() =>
              run(() => {
                const cues = alignment.trim()
                  ? parseSpeechAlignment(alignment)
                  : undefined;
                let message = "";
                s.edit((p) => {
                  const result = bakeLipSync(p, layer.id, {
                    audioLayerId: audioId,
                    transcript,
                    cues,
                  });
                  message = `${result.mode}: ${result.count} mouth cues recorded.`;
                });
                setStatus(message);
              })
            }
          >
            Generate mouth track
          </button>
        </details>
      </fieldset>
      {status && (
        <p role="status" className="face-status">
          {status}
        </p>
      )}
      <details>
        <summary>Mouth keys · {mouthKeys.length}</summary>
        <p className="muted">
          Showing up to 100 keys around the playhead. Seek on the timeline to
          edit another passage.
        </p>
        <div className="mouth-key-list">
          {mouthKeys.slice(windowStart, windowStart + 100).map((k, j) => {
            const i = windowStart + j;
            return (
              <div key={i} className={i === current ? "current" : ""}>
                <button
                  aria-label={"Seek mouth key " + i}
                  onClick={() => s.setTime(scene.start + layer.start + k.time)}
                >
                  {k.time.toFixed(2)}s
                </button>
                <input
                  aria-label={"Mouth key time " + i}
                  type="number"
                  min={0}
                  max={layer.duration}
                  step={0.01}
                  disabled={layer.locked}
                  value={k.time}
                  onFocus={s.begin}
                  onBlur={s.end}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (t < 0 || t > layer.duration || !Number.isFinite(t))
                      return;
                    editLayer(layer.id, (l) => {
                      if (
                        l.keyframes.mouthShape.some(
                          (q) =>
                            q !==
                              l.keyframes.mouthShape.find(
                                (q) => q.time === k.time,
                              ) && q.time === t,
                        )
                      )
                        return;
                      const item = l.keyframes.mouthShape.find(
                        (q) => q.time === k.time,
                      );
                      if (item) item.time = t;
                    });
                  }}
                />
                <select
                  aria-label={"Mouth key shape " + i}
                  disabled={layer.locked}
                  value={String(k.value)}
                  onChange={(e) =>
                    editLayer(layer.id, (l) => {
                      const item = l.keyframes.mouthShape.find(
                        (q) => q.time === k.time,
                      );
                      if (item) item.value = e.target.value;
                    })
                  }
                >
                  {mouthShapes.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={"Delete mouth key " + i}
                  disabled={layer.locked}
                  onClick={() =>
                    editLayer(layer.id, (l) => {
                      l.keyframes.mouthShape = l.keyframes.mouthShape.filter(
                        (q) => q.time !== k.time,
                      );
                    })
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </details>
    </details>
  );
}
