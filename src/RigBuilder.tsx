import { useEffect, useRef, useState } from "react";
import { id, makeLayer, type Layer } from "./model";
import { useStore, activeScene } from "./store";
import { drawRig, rigPose } from "./character";
import { rigJoints, jointProps, poseLabels } from "./rigging";
import {
  coreSlots,
  allSlots,
  parentForSlot,
  rigIssues,
  commitRig,
} from "./rigWorkshop";

const names = (s: string) => s.replaceAll("_", " ");
const api = async (url: string, body: FormData | object) => {
  const r = await fetch(
    url,
    body instanceof FormData
      ? { method: "POST", body }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || "Could not import artwork");
  return json;
};
function NumberControl({
  label,
  value,
  onChange,
  min = -2000,
  max = 3000,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="0.01"
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </label>
  );
}
export default function RigBuilder({ close }: { close: () => void }) {
  const s = useStore(),
    scene = activeScene(s);
  const selected = scene?.layers.find(
    (l) => l.id === s.selected[0] && l.type === "rig",
  );
  const [target, setTarget] = useState(selected?.id);
  const [draft, setDraft] = useState<Layer>(() => {
    const l = selected
      ? structuredClone(selected)
      : makeLayer("rig", s.project);
    l.name = selected?.name || "My character";
    l.keyframes = {};
    l.props.rigDrawings = [];
    l.props.width = 1536;
    l.props.height = 1408;
    l.props.poseMode = "authored";
    return l;
  });
  const [slot, setSlot] = useState("head"),
    [preview, setPreview] = useState("rest"),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [bones, setBones] = useState(true),
    [saveTemplate, setSaveTemplate] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    art = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null);
  const artBounds = useRef({ x: 20, y: 20, width: 360, height: 260 });
  const patch = (f: (l: Layer) => void) =>
    setDraft((old) => {
      const next = structuredClone(old);
      f(next);
      return next;
    });
  const poseLayer = structuredClone(draft);
  poseLayer.props.poseMode = preview === "rest" ? "authored" : "preset";
  poseLayer.props.rigClip = preview;
  poseLayer.props.rigTime = time;
  const pose = rigPose(poseLayer, time),
    joints = rigJoints(pose);
  const slots = [
    ...new Set([...allSlots, ...Object.keys(draft.props.rigAssets)]),
  ];
  const part = pose.parts.find((p) => p.asset === slot),
    reg = draft.props.rigRegistration[slot] || {
      anchorX: part?.anchor.x ?? 0.5,
      anchorY: part?.anchor.y ?? 0.1,
      scaleX: 1,
      scaleY: 1,
    };
  const asset = s.project.assets.find(
    (a) => a.id === draft.props.rigAssets[slot],
  );
  const issues = rigIssues(draft, s.project);
  const editReg = (key: keyof typeof reg, value: number) =>
    patch((l) => {
      l.props.rigRegistration[slot] = { ...reg, [key]: value };
    });
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime(((now - start) / 1000) % 4);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 768, 704);
    ctx.save();
    ctx.scale(0.5, 0.5);
    drawRig(ctx, poseLayer, time, time, s.resources);
    ctx.restore();
  }, [draft, preview, time, s.resources]);
  useEffect(() => {
    const ctx = art.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 400, 300);
    const image = s.resources.get(draft.props.rigAssets[slot]);
    if (!image) return;
    const crop = draft.props.rigCrops[slot];
    const bitmap = image as HTMLImageElement;
    const iw = crop?.width || bitmap.naturalWidth || bitmap.width || 360;
    const ih = crop?.height || bitmap.naturalHeight || bitmap.height || 260;
    const scale = Math.min(360 / iw, 260 / ih),
      width = iw * scale,
      height = ih * scale;
    const box = { x: (400 - width) / 2, y: (300 - height) / 2, width, height };
    artBounds.current = box;
    if (crop)
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        box.x,
        box.y,
        box.width,
        box.height,
      );
    else ctx.drawImage(image, box.x, box.y, box.width, box.height);
    ctx.strokeStyle = "#a6ffad";
    ctx.lineWidth = 2;
    const x = box.x + reg.anchorX * box.width,
      y = box.y + reg.anchorY * box.height;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }, [draft, slot, s.resources]);
  const loadBase = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/character-library", {
        item: "louis",
        folder: s.folder,
      });
      s.edit((p) => {
        for (const a of data.assets)
          if (!p.assets.some((q) => q.id === a.id)) p.assets.push(a);
      });
      patch((l) => {
        l.props.rigAssets = data.slots;
        l.props.rigCrops = data.crops;
        l.props.rigRegistration = {};
        l.props.rigVersion = data.rigVersion;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importParts = async (files: File[]) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (s.folder) form.append("folder", s.folder);
      files.forEach((f) => form.append("files", f));
      const data = await api("/api/import", form);
      s.edit((p) => {
        p.assets.push(...data);
      });
      patch((l) => {
        for (const a of data) {
          const name = a.originalName.replace(/\.[^.]+$/, "");
          if (slots.includes(name)) {
            l.props.rigAssets[name] = a.id;
            delete l.props.rigCrops[name];
            delete l.props.rigRegistration[name];
          }
        }
        if (data.length === 1) {
          l.props.rigAssets[slot] = data[0].id;
          delete l.props.rigCrops[slot];
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = () => {
    const sceneId = scene?.id || id();
    let placed = "";
    s.edit((p) => {
      placed = commitRig(draft, p, sceneId, target, saveTemplate);
    });
    if (placed) {
      s.select([placed], sceneId);
      close();
    }
  };
  const artPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerdown")
      e.currentTarget.setPointerCapture(e.pointerId);
    if (e.type === "pointermove" && !e.buttons) return;
    const r = e.currentTarget.getBoundingClientRect();
    const box = artBounds.current;
    patch((l) => {
      l.props.rigRegistration[slot] = {
        ...reg,
        anchorX: Math.max(
          0,
          Math.min(
            1,
            (((e.clientX - r.left) * 400) / r.width - box.x) / box.width,
          ),
        ),
        anchorY: Math.max(
          0,
          Math.min(
            1,
            (((e.clientY - r.top) * 300) / r.height - box.y) / box.height,
          ),
        ),
      };
    });
  };
  return (
    <div className="modal-backdrop">
      <section
        className="rig-builder"
        role="dialog"
        aria-modal="true"
        aria-label="Rig builder"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            const elements = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), [tabindex="0"]',
              ),
            ).filter((el) => el.getClientRects().length);
            const first = elements[0],
              last = elements.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            }
            if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <small>CHARACTER WORKSHOP</small>
            <h2>Rig builder</h2>
          </div>
          <button aria-label="Close rig builder" onClick={close}>
            ×
          </button>
        </header>
        <div className="rig-builder-body">
          <aside>
            <label className="field">
              <span>Character name</span>
              <input
                aria-label="Character name"
                value={draft.name}
                onChange={(e) =>
                  patch((l) => {
                    l.name = e.target.value;
                  })
                }
              />
            </label>
            <button disabled={busy} onClick={() => void loadBase()}>
              Load Louis artwork
            </button>
            <button disabled={busy} onClick={() => input.current?.click()}>
              Import part artwork
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              multiple
              hidden
              onChange={(e) => {
                void importParts(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <p className="muted">
              Separate transparent parts work best. Matching filenames fill
              slots automatically. R and L refer to the character’s right and
              left.
            </p>
            <label className="field">
              <span>Saved character</span>
              <select
                aria-label="Saved character"
                value=""
                onChange={(e) => {
                  const t = s.project.rigTemplates.find(
                    (t) => t.id === e.target.value,
                  );
                  if (t) {
                    setTarget(undefined);
                    patch((l) => {
                      l.name = t.name;
                      l.props = structuredClone(t.props);
                    });
                  }
                }}
              >
                <option value="">Choose from project library…</option>
                {s.project.rigTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <h3>Artwork hierarchy</h3>
            <div className="rig-slot-list">
              {slots.map((k) => (
                <button
                  key={k}
                  className={k === slot ? "on" : ""}
                  onClick={() => setSlot(k)}
                  style={{ paddingLeft: parentForSlot(k) !== "root" ? 20 : 10 }}
                >
                  <span
                    className={
                      draft.props.rigAssets[k] ? "assigned" : "missing"
                    }
                  >
                    ●
                  </span>{" "}
                  {names(k)}
                  <small>↳ {names(parentForSlot(k))}</small>
                </button>
              ))}
            </div>
          </aside>
          <main>
            <div className="rig-preview-controls">
              <label className="field">
                <span>Preview action</span>
                <select
                  aria-label="Preview action"
                  value={preview}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(0);
                    setPreview(e.target.value);
                  }}
                >
                  <option value="rest">Rest pose · edit joints</option>
                  <option value="idle">Idle</option>
                  <option value="walk">Walk</option>
                  <option value="seated_idle">Seated</option>
                </select>
              </label>
              <button onClick={() => setPlaying(!playing)}>
                {playing ? "Pause rig preview" : "Play rig preview"}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={bones}
                  onChange={(e) => setBones(e.target.checked)}
                />{" "}
                Show joints
              </label>
            </div>
            <div className="rig-stage">
              <canvas
                ref={canvas}
                width="768"
                height="704"
                aria-label="Live character preview"
              />
              {bones && (
                <svg viewBox="0 0 1536 1408" aria-label="Rig joint overlay">
                  {[
                    ["hip_R", "knee_R"],
                    ["knee_R", "foot_R"],
                    ["hip_L", "knee_L"],
                    ["knee_L", "foot_L"],
                    ["shoulder_R", "elbow_R"],
                    ["elbow_R", "hand_R"],
                    ["shoulder_L", "elbow_L"],
                    ["elbow_L", "hand_L"],
                  ].map(([a, b]) =>
                    joints[a] && joints[b] ? (
                      <line
                        key={a + b}
                        x1={joints[a].x}
                        y1={joints[a].y}
                        x2={joints[b].x}
                        y2={joints[b].y}
                      />
                    ) : null,
                  )}
                  {Object.entries(jointProps).map(([key]) => {
                    const p = joints[key];
                    return p ? (
                      <circle
                        key={key}
                        aria-label={"Move " + names(key)}
                        role="button"
                        tabIndex={0}
                        cx={p.x}
                        cy={p.y}
                        r="15"
                        onKeyDown={(e) => {
                          const arrows: Record<string, number[]> = {
                            ArrowLeft: [-5, 0],
                            ArrowRight: [5, 0],
                            ArrowUp: [0, -5],
                            ArrowDown: [0, 5],
                          };
                          const d = arrows[e.key];
                          if (d) {
                            e.preventDefault();
                            setPreview("rest");
                            patch((l) => {
                              const [x, y] = jointProps[key];
                              Object.assign(l.props, {
                                [x]: p.x + d[0],
                                [y]: p.y + d[1],
                              });
                            });
                          }
                        }}
                        onPointerDown={(e) => {
                          setPlaying(false);
                          setPreview("rest");
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (!e.buttons) return;
                          const r =
                            e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                          patch((l) => {
                            const [x, y] = jointProps[key];
                            Object.assign(l.props, {
                              [x]: ((e.clientX - r.left) * 1536) / r.width,
                              [y]: ((e.clientY - r.top) * 1408) / r.height,
                            });
                          });
                        }}
                      />
                    ) : null;
                  })}
                </svg>
              )}
            </div>
            <label className="field">
              <span>Preview time</span>
              <input
                aria-label="Preview time"
                type="range"
                min="0"
                max="4"
                step="0.0333"
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(Number(e.target.value));
                }}
              />
            </label>
            <p className="muted">
              Drag wrists, ankles or hips to test a pose. Arrow keys move a
              focused joint. Preview uses the same renderer as the scene and
              export.
            </p>
          </main>
          <aside>
            <h3>{names(slot)}</h3>
            <p className="muted">
              Parent: {names(parentForSlot(slot))}. The connected humanoid
              hierarchy is fixed.
            </p>
            <label className="field">
              <span>Slot artwork</span>
              <select
                aria-label="Slot artwork"
                value={draft.props.rigAssets[slot] || ""}
                onChange={(e) =>
                  patch((l) => {
                    if (e.target.value)
                      l.props.rigAssets[slot] = e.target.value;
                    else delete l.props.rigAssets[slot];
                    delete l.props.rigCrops[slot];
                    delete l.props.rigRegistration[slot];
                  })
                }
              >
                <option value="">Unassigned</option>
                {s.project.assets
                  .filter((a) => a.type === "image")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.originalName}
                    </option>
                  ))}
              </select>
            </label>
            <canvas
              className="rig-art"
              ref={art}
              width="400"
              height="300"
              aria-label="Artwork pivot editor"
              onPointerDown={artPointer}
              onPointerMove={artPointer}
            />
            <p className="muted">
              {asset?.originalName || "Assign artwork above"} · Drag the green
              cross to place its joint pivot.
            </p>
            <div className="field-grid">
              {(["anchorX", "anchorY", "scaleX", "scaleY"] as const).map(
                (k) => (
                  <NumberControl
                    key={k}
                    label={
                      {
                        anchorX: "Pivot X",
                        anchorY: "Pivot Y",
                        scaleX: "Artwork scale X",
                        scaleY: "Artwork scale Y",
                      }[k]
                    }
                    value={reg[k]}
                    min={k.startsWith("scale") ? 0.05 : -2}
                    max={k.startsWith("scale") ? 8 : 3}
                    onChange={(v) => editReg(k, v)}
                  />
                ),
              )}
            </div>
            <h3>Skeleton proportions</h3>
            <div className="field-grid">
              {(
                [
                  "upperArmLength",
                  "forearmLength",
                  "thighLength",
                  "shinLength",
                ] as const
              ).map((k) => (
                <NumberControl
                  key={k}
                  label={poseLabels[k]}
                  value={draft.props[k]}
                  min={10}
                  max={600}
                  onChange={(v) =>
                    patch((l) => {
                      l.props[k] = v;
                      l.props.rigDimensions = {
                        upperArmLength: l.props.upperArmLength,
                        forearmLength: l.props.forearmLength,
                        thighLength: l.props.thighLength,
                        shinLength: l.props.shinLength,
                      };
                    })
                  }
                />
              ))}
            </div>
            <h3>Build check</h3>
            <p
              role="status"
              className={issues.length ? "rig-warning" : "assigned"}
            >
              {issues.length
                ? `${coreSlots.length - issues.length}/${coreSlots.length} body slots assigned. ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? "…" : ""}`
                : "All body slots assigned · ready to place"}
            </p>
            {Object.values(pose.ikError).some((v) => v > 1) && (
              <p className="rig-warning">
                A wrist or ankle is beyond reach. Move the target closer or
                adjust limb lengths.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </aside>
        </div>
        <footer>
          <label>
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={(e) => setSaveTemplate(e.target.checked)}
            />{" "}
            Save to project character library
          </label>
          <span>Rig edits apply together and support undo.</span>
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            disabled={busy || !!issues.length || !draft.name.trim()}
            onClick={finish}
          >
            {target ? "Apply to selected rig" : "Place rig in scene"}
          </button>
        </footer>
      </section>
    </div>
  );
}
