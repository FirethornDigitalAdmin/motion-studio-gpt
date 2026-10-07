import { useState } from "react";
import { activeLayer, activeScene, editLayer, useStore } from "./store";
import {
  valueAt,
  styleAt,
  animatedValue,
  animationProperties,
  type AnimProperty,
  type Property,
  type StyleProperty,
  type Layer,
} from "./model";
import { Field, EaseEditor } from "./Controls";
import CameraTools from "./CameraTools";
import { rigClips, rigExpressions } from "./character";
import CharacterTools from "./CharacterTools";
import FacialTools from "./FacialTools";
import { faceTemplates } from "./face";
import { AnimationTools, CursorTools } from "./Advanced";
const labels: Record<AnimProperty, string> = {
  rigView: "Head view",
  x: "X",
  y: "Y",
  scale: "Scale",
  rotation: "Rotation",
  opacity: "Opacity",
  fontSize: "Font size",
  letterSpacing: "Letter spacing",
  lineHeight: "Line height",
  width: "Width",
  height: "Height",
  radius: "Corner radius",
  fontWeight: "Weight",
  anchorX: "Anchor X",
  anchorY: "Anchor Y",
  color: "Colour",
  content: "Text content",
  fontFamily: "Font family",
  align: "Text alignment",
  shape: "Shape type",
  assetId: "Pose image",
  headAngle: "Head angle",
  armAngle: "Arm angle",
  rigTime: "Action time",
  gazeX: "Gaze X",
  gazeY: "Gaze Y",
  blink: "Eyelid closure",
  rigClip: "Rig action",
  expression: "Expression",
  poseMode: "Pose mode",
  rightHand: "Right hand drawing",
  leftHand: "Left hand drawing",
  rigProp: "Built-in prop",
  mouthShape: "Mouth shape",
  pelvisX: "Hip X",
  pelvisY: "Hip Y",
  bodyLean: "Body lean",
  handRX: "Right wrist X",
  handRY: "Right wrist Y",
  handLX: "Left wrist X",
  handLY: "Left wrist Y",
  footRX: "Right ankle X",
  footRY: "Right ankle Y",
  footLX: "Left ankle X",
  footLY: "Left ankle Y",
  rightArmBend: "Right elbow bend",
  leftArmBend: "Left elbow bend",
  rightLegBend: "Right knee bend",
  leftLegBend: "Left knee bend",
  upperArmLength: "Upper arm length",
  forearmLength: "Forearm length",
  thighLength: "Thigh length",
  shinLength: "Shin length",
  rightHandAngle: "Right hand angle",
  leftHandAngle: "Left hand angle",
  propAngle: "Built-in prop angle",
};
export default function Properties() {
  const s = useStore(),
    l = activeLayer(s),
    scene = activeScene(s);
  const [keyProp, setKeyProp] = useState<AnimProperty>("x");
  if (!l && scene)
    return (
      <aside className="properties">
        <header>
          <span className="tiny-label">INSPECTOR</span>
          <span className="tag">scene</span>
        </header>
        <div className="properties-scroll">
          <div className="property-section">
            <label className="field">
              <span>Scene name</span>
              <input
                aria-label="Scene name"
                value={scene.name}
                onFocus={s.begin}
                onBlur={s.end}
                onChange={(e) =>
                  s.edit(
                    (p) =>
                      (p.scenes.find((sc) => sc.id === scene.id)!.name =
                        e.target.value),
                  )
                }
              />
            </label>
            <Field
              label="Scene start"
              min={0}
              value={scene.start}
              onChange={(n) =>
                s.edit(
                  (p) => (p.scenes.find((sc) => sc.id === scene.id)!.start = n),
                )
              }
            />
            <Field
              label="Scene duration"
              min={0.01}
              value={scene.duration}
              onChange={(n) =>
                s.edit(
                  (p) =>
                    (p.scenes.find((sc) => sc.id === scene.id)!.duration = n),
                )
              }
            />
            <p className="muted">
              Select a layer to edit its appearance and movement.
            </p>
          </div>
          <CameraTools />
        </div>
      </aside>
    );
  if (!l)
    return (
      <aside className="properties">
        <header>
          <span className="tiny-label">INSPECTOR</span>
          <span>◈</span>
        </header>
        <div className="inspector-empty">
          <div>↖</div>
          <h3>A little direction.</h3>
          <p>
            Select a layer to adjust its look,
            <br />
            position and movement.
          </p>
          <div className="shortcut-card">
            <span>
              Play / pause<kbd>Space</kbd>
            </span>
            <span>
              Step a frame<kbd>← →</kbd>
            </span>
            <span>
              Undo<kbd>Ctrl Z</kbd>
            </span>
          </div>
        </div>
      </aside>
    );
  const time = Math.max(0, s.time - (scene?.start || 0) - l.start);
  const edit = (f: (l: Layer) => void) => editLayer(l.id, f);
  const set = (prop: AnimProperty, value: number | string) =>
    edit((target) => {
      const keys = target.keyframes[prop];
      if (keys?.length) {
        const k = keys.find(
          (k) => Math.abs(k.time - time) < 0.5 / s.project.settings.fps,
        );
        if (k) k.value = value;
        else keys.push({ time, value, easing: "linear" });
      } else if (prop === "anchorX") target.anchor.x = Number(value);
      else if (prop === "anchorY") target.anchor.y = Number(value);
      else if (prop in target) (target as any)[prop] = value;
      else (target.props as any)[prop] = value;
    });
  const keyToggle = (prop: AnimProperty) => {
    setKeyProp(prop);
    edit((target) => {
      const keys = target.keyframes[prop] || [];
      const i = keys.findIndex(
        (k) => Math.abs(k.time - time) < 0.5 / s.project.settings.fps,
      );
      if (i >= 0) keys.splice(i, 1);
      else
        keys.push({
          time,
          value: animatedValue(l, prop, time),
          easing: "linear",
        });
      target.keyframes[prop] = keys;
    });
  };
  const toggle = (prop: AnimProperty) => (
    <button
      className={
        "key-toggle " +
        (l.keyframes[prop]?.some(
          (k) => Math.abs(k.time - time) < 0.5 / s.project.settings.fps,
        )
          ? "on"
          : "")
      }
      aria-label={`Keyframe ${labels[prop]}`}
      title={`Add or remove a ${labels[prop].toLowerCase()} keyframe at the playhead`}
      disabled={l.locked}
      onClick={() => keyToggle(prop)}
    >
      ◇
    </button>
  );
  const num = (
    prop: Property,
    opts: { min?: number; max?: number; step?: number; title?: string } = {},
  ) => (
    <div className="animated-field">
      <Field
        label={labels[prop]}
        value={valueAt(l, prop, time)}
        disabled={l.locked}
        onChange={(n) => set(prop, n)}
        {...opts}
      />
      {toggle(prop)}
    </div>
  );
  const styleSelect = (
    prop: StyleProperty,
    options: { value: string; label: string }[],
    title?: string,
  ) => (
    <div className="animated-field">
      <label className="field" title={title}>
        <span>{labels[prop]}</span>
        <select
          aria-label={labels[prop]}
          disabled={l.locked}
          value={styleAt(l, prop, time)}
          onChange={(e) => set(prop, e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {toggle(prop)}
    </div>
  );
  const keys = l.keyframes[keyProp] || [];
  return (
    <aside className="properties">
      <header>
        <span className="tiny-label">INSPECTOR</span>
        <span className="tag">{l.type}</span>
      </header>
      <div className="properties-scroll">
        <div className="property-section">
          <input
            className="layer-title"
            aria-label="Layer name"
            value={l.name}
            disabled={l.locked}
            onFocus={s.begin}
            onBlur={s.end}
            onChange={(e) => edit((t) => (t.name = e.target.value))}
          />
          {l.locked && (
            <p className="muted">Unlock this layer in Layers to edit it.</p>
          )}
          {l.type !== "audio" && (
            <>
              <label className="field">
                <span>Fixed to frame</span>
                <input
                  aria-label="Fixed to frame"
                  type="checkbox"
                  checked={l.props.screenSpace}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => (t.props.screenSpace = e.target.checked))
                  }
                />
              </label>
              <div className="section-heading">
                Transform <span>↗</span>
              </div>
              <div className="field-grid">
                {num("x", { title: "Horizontal position in project pixels" })}
                {num("y", { title: "Vertical position in project pixels" })}
                {num("scale", {
                  min: 0.01,
                  step: 0.05,
                  title: "Uniform size multiplier; 1 is original size",
                })}
                {num("rotation", { title: "Clockwise rotation in degrees" })}
              </div>
              {num("opacity", {
                min: 0,
                max: 1,
                step: 0.05,
                title: "Visibility from 0 (transparent) to 1 (opaque)",
              })}
              <div className="field-grid">
                {num("anchorX", {
                  step: 0.1,
                  title: "Horizontal pivot as a fraction of layer width",
                })}
                {num("anchorY", {
                  step: 0.1,
                  title: "Vertical pivot as a fraction of layer height",
                })}
              </div>
            </>
          )}
        </div>
        <div className="property-section">
          <div className="section-heading">
            {l.type === "text"
              ? "Typography"
              : l.type === "image"
                ? "Image"
                : "Appearance"}
          </div>
          {l.type === "text" && (
            <>
              <div className="animated-field">
                <label className="field">
                  <span>Text</span>
                  <textarea
                    aria-label="Text content"
                    disabled={l.locked}
                    value={styleAt(l, "content", time)}
                    onFocus={s.begin}
                    onBlur={s.end}
                    onChange={(e) => set("content", e.target.value)}
                  />
                </label>
                {toggle("content")}
              </div>
              {styleSelect(
                "fontFamily",
                [
                  ...new Set([
                    "Arial",
                    "Georgia",
                    "Courier New",
                    ...s.project.assets
                      .filter((a) => a.type === "font")
                      .map((a) => a.originalName.replace(/\.[^.]+$/, "")),
                  ]),
                ].map((value) => ({ value, label: value })),
                "Choose a system font or one of your imported fonts",
              )}
              <div className="field-grid">
                {num("fontSize", { min: 1 })}
                {num("fontWeight", {
                  min: 100,
                  max: 900,
                  step: 100,
                  title:
                    "Weight from 100 to 900; the selected font must support it",
                })}
                {num("lineHeight", {
                  min: 0.1,
                  step: 0.1,
                  title: "Line spacing as a multiplier of font size",
                })}
                {num("letterSpacing", {
                  title: "Extra space between characters in project pixels",
                })}
              </div>
              {styleSelect("align", [
                { value: "left", label: "Left" },
                { value: "center", label: "Centre" },
                { value: "right", label: "Right" },
              ])}
            </>
          )}
          {l.type === "shape" &&
            styleSelect("shape", [
              { value: "rectangle", label: "Rectangle" },
              { value: "ellipse", label: "Ellipse" },
            ])}
          {(l.type === "image" || l.type === "shape") && (
            <div className="field-grid">
              {num("width", { min: 1 })}
              {num("height", { min: 1 })}
              {l.type === "shape" && num("radius", { min: 0 })}
            </div>
          )}
          {l.type !== "image" && l.type !== "audio" && l.type !== "rig" && (
            <div className="animated-field">
              <label className="color-field" style={{ flex: 1 }}>
                <span>Colour</span>
                <input
                  aria-label="Layer colour"
                  type="color"
                  disabled={l.locked}
                  value={styleAt(l, "color", time)}
                  onFocus={s.begin}
                  onBlur={s.end}
                  onChange={(e) => set("color", e.target.value)}
                />
                <input
                  aria-label="Layer hex colour"
                  key={`${l.id}-${styleAt(l, "color", time)}`}
                  type="text"
                  disabled={l.locked}
                  defaultValue={styleAt(l, "color", time)}
                  style={{ width: 80, minWidth: 0, fontFamily: "monospace" }}
                  onFocus={s.begin}
                  onBlur={(e) => {
                    if (/^#[0-9a-f]{6}$/i.test(e.target.value))
                      set("color", e.target.value);
                    else e.target.value = styleAt(l, "color", time);
                    s.end();
                  }}
                  title="Six-digit hex colour, including #"
                />
              </label>
              {toggle("color")}
            </div>
          )}
          {l.type === "audio" && (
            <>
              <Field
                label="Volume"
                min={0}
                max={2}
                step={0.05}
                value={l.props.volume}
                disabled={l.locked}
                onChange={(n) => edit((t) => (t.props.volume = n))}
              />
              <Field
                label="Audio offset"
                min={0}
                step={0.01}
                value={l.props.audioOffset}
                disabled={l.locked}
                onChange={(n) => edit((t) => (t.props.audioOffset = n))}
              />
              <p className="muted">
                Choose the character who speaks this clip.
              </p>
            </>
          )}
          {(l.type === "audio" || l.type === "image") && (
            <label className="field">
              <span>Actor</span>
              <input
                aria-label="Actor"
                value={l.props.actor}
                disabled={l.locked}
                onFocus={s.begin}
                onBlur={s.end}
                onChange={(e) => edit((t) => (t.props.actor = e.target.value))}
                placeholder="e.g. Louis"
              />
            </label>
          )}
          {(l.type === "rig" || l.type === "image") && (
            <FacialTools key={l.id} layer={l} scene={scene!} />
          )}
          {l.type === "rig" && <CharacterTools layer={l} scene={scene!} />}
          {l.type === "rig" && (
            <>
              <label className="field">
                <span>Continuous joint motion</span>
                <input
                  aria-label="Continuous joint motion"
                  type="checkbox"
                  checked={l.props.continuousJoints}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => {
                      t.props.continuousJoints = e.target.checked;
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Rig drawing</span>
                <select
                  aria-label="Rig drawing"
                  value={l.props.rigDrawing}
                  onChange={(e) =>
                    edit(
                      (t) =>
                        (t.props.rigDrawing = e.target.value as
                          "all" | "hands"),
                    )
                  }
                >
                  <option value="all">Whole character</option>
                  <option value="hands">Foreground hands</option>
                </select>
              </label>
              {styleSelect(
                "rigClip",
                rigClips,
                "Choose a reusable action; keyframe Action time to control its timing.",
              )}
              {num("rigTime", {
                min: 0,
                step: 0.05,
                title:
                  "Seconds inside the selected action. Without keyframes, the action plays automatically.",
              })}
              {styleSelect("expression", rigExpressions)}
              <div className="field-grid">
                {num("headAngle", { step: 1 })}
                {num("gazeX", { min: -1, max: 1, step: 0.1 })}
                {num("gazeY", { min: -1, max: 1, step: 0.1 })}
              </div>
              <label className="field">
                <span>Natural blinking</span>
                <input
                  aria-label="Natural blinking"
                  type="checkbox"
                  checked={l.props.autoBlink}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => (t.props.autoBlink = e.target.checked))
                  }
                />
              </label>
              {num("blink", {
                min: 0,
                max: 1,
                step: 0.1,
                title:
                  "0 is open; 1 closes the eyelids. The eyes and pupils retain their size.",
              })}
              <p className="muted">
                Original separated parts, with connected limbs and independent
                eyelids. Action time, gaze, expression and transforms are
                editable.
              </p>
            </>
          )}
          {l.type === "image" && (
            <>
              {styleSelect(
                "assetId",
                s.project.assets
                  .filter((a) => a.type === "image")
                  .map((a) => ({ value: a.id, label: a.originalName })),
              )}
              <label className="field">
                <span>Facial controls</span>
                <input
                  aria-label="Facial controls"
                  type="checkbox"
                  checked={l.props.facialEnabled}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => {
                      t.props.facialEnabled = e.target.checked;
                    })
                  }
                />
              </label>
              {l.props.facialEnabled && (
                <>
                  <label className="field">
                    <span>Register face drawing</span>
                    <select
                      aria-label="Register face drawing"
                      value=""
                      disabled={l.locked}
                      onChange={(e) => {
                        const template =
                          faceTemplates[
                            e.target.value as keyof typeof faceTemplates
                          ];
                        if (template)
                          edit((t) => {
                            t.props.facialDrawings[
                              styleAt(t, "assetId", time)
                            ] = structuredClone(template);
                          });
                      }}
                    >
                      <option value="">Choose a registration…</option>
                      {Object.keys(faceTemplates).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    {l.props.facialDrawings[styleAt(l, "assetId", time)]
                      ? "Face registered for this pose image."
                      : "Register each pose image before animating its eyes."}
                  </p>
                  {styleSelect("expression", rigExpressions)}
                  <div className="field-grid">
                    {num("gazeX", { min: -1, max: 1, step: 0.1 })}
                    {num("gazeY", { min: -1, max: 1, step: 0.1 })}
                  </div>
                  {num("blink", { min: 0, max: 1, step: 0.1 })}
                  <label className="field">
                    <span>Natural blinking</span>
                    <input
                      aria-label="Natural blinking"
                      type="checkbox"
                      checked={l.props.autoBlink}
                      disabled={l.locked}
                      onChange={(e) =>
                        edit((t) => {
                          t.props.autoBlink = e.target.checked;
                        })
                      }
                    />
                  </label>
                  <details>
                    <summary>Eye registration</summary>
                    <p className="muted">
                      Centres and radii as fractions of the original image.
                      Registrations follow pose-image changes and head movement.
                    </p>
                    {l.props.facialDrawings[
                      styleAt(l, "assetId", time)
                    ]?.eyes.map((eye, i) => (
                      <div className="field-grid" key={i}>
                        {(["x", "y", "rx", "ry"] as const).map((prop) => (
                          <Field
                            key={prop}
                            label={`Eye ${i + 1} ${prop}`}
                            min={prop.startsWith("r") ? 0.001 : 0}
                            max={prop.startsWith("r") ? 0.2 : 1}
                            step={0.001}
                            value={eye[prop]}
                            disabled={l.locked}
                            onChange={(n) =>
                              edit((t) => {
                                t.props.facialDrawings[
                                  styleAt(t, "assetId", time)
                                ].eyes[i][prop] = n;
                              })
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </details>
                </>
              )}
              <label className="field">
                <span>Moving parts</span>
                <input
                  aria-label="Moving parts"
                  type="checkbox"
                  checked={l.props.puppetEnabled}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => (t.props.puppetEnabled = e.target.checked))
                  }
                />
              </label>
              {l.props.puppetEnabled && (
                <>
                  <label className="field">
                    <span>Continuous joint motion</span>
                    <input
                      aria-label="Continuous joint motion"
                      type="checkbox"
                      checked={l.props.continuousJoints}
                      disabled={l.locked}
                      onChange={(e) =>
                        edit((t) => {
                          t.props.continuousJoints = e.target.checked;
                        })
                      }
                    />
                  </label>
                  {num("headAngle")}
                  <label className="field">
                    <span>Moving arm</span>
                    <input
                      aria-label="Moving arm"
                      type="checkbox"
                      checked={l.props.armEnabled}
                      disabled={l.locked}
                      onChange={(e) =>
                        edit((t) => (t.props.armEnabled = e.target.checked))
                      }
                    />
                  </label>
                  {l.props.armEnabled && num("armAngle")}
                  <details>
                    <summary>Part regions and pivots</summary>
                    <p className="muted">
                      Fractions of the image. Keep head and arm regions
                      separate; use small angles for clean joints.
                    </p>
                    <div className="field-grid">
                      {(
                        [
                          "headX",
                          "headY",
                          "headW",
                          "headH",
                          "headPivotX",
                          "headPivotY",
                          ...(l.props.armEnabled
                            ? [
                                "armX",
                                "armY",
                                "armW",
                                "armH",
                                "armPivotX",
                                "armPivotY",
                              ]
                            : []),
                        ] as (keyof Layer["props"])[]
                      ).map((prop) => (
                        <Field
                          key={prop}
                          label={prop
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (c) => c.toUpperCase())}
                          min={
                            prop.endsWith("W") || prop.endsWith("H") ? 0.001 : 0
                          }
                          max={1}
                          step={0.001}
                          value={Number(l.props[prop])}
                          disabled={l.locked}
                          onChange={(n) =>
                            edit((t) => ((t.props as any)[prop] = n))
                          }
                        />
                      ))}
                    </div>
                  </details>
                </>
              )}

              <label className="field">
                <span>Talking mouth</span>
                <input
                  aria-label="Talking mouth"
                  type="checkbox"
                  checked={l.props.mouthEnabled}
                  disabled={l.locked}
                  onChange={(e) =>
                    edit((t) => (t.props.mouthEnabled = e.target.checked))
                  }
                />
              </label>
              {l.props.mouthEnabled && (
                <>
                  <p className="muted">
                    Match the actor name on their audio tracks. Position is a
                    fraction of this image; size is in image-layer pixels.
                  </p>
                  <div className="field-grid">
                    <Field
                      label="Mouth X"
                      min={0}
                      max={1}
                      step={0.001}
                      value={l.props.mouthX}
                      disabled={l.locked}
                      onChange={(n) => edit((t) => (t.props.mouthX = n))}
                    />
                    <Field
                      label="Mouth Y"
                      min={0}
                      max={1}
                      step={0.001}
                      value={l.props.mouthY}
                      disabled={l.locked}
                      onChange={(n) => edit((t) => (t.props.mouthY = n))}
                    />
                    <Field
                      label="Mouth width"
                      min={1}
                      value={l.props.mouthWidth}
                      disabled={l.locked}
                      onChange={(n) => edit((t) => (t.props.mouthWidth = n))}
                    />
                    <Field
                      label="Mouth height"
                      min={1}
                      value={l.props.mouthHeight}
                      disabled={l.locked}
                      onChange={(n) => edit((t) => (t.props.mouthHeight = n))}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="property-section">
          <div className="section-heading">Timing</div>
          <div className="field-grid">
            <Field
              label="Start"
              title="Seconds after the scene starts"
              min={0}
              step={0.1}
              value={l.start}
              onChange={(n) => edit((t) => (t.start = n))}
              disabled={l.locked}
            />
            <Field
              label="Duration"
              min={0.01}
              step={0.1}
              value={l.duration}
              onChange={(n) => edit((t) => (t.duration = n))}
              disabled={l.locked}
            />
          </div>
        </div>
        {l.type !== "audio" && (
          <div className="property-section">
            <div className="section-heading">
              Keyframes <span>◇</span>
            </div>
            <select
              aria-label="Keyframe property"
              title="Choose the property whose keys you want to edit"
              value={keyProp}
              onChange={(e) => setKeyProp(e.target.value as AnimProperty)}
            >
              {animationProperties.map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
            {!keys.length && (
              <p className="muted">
                Click ◇ beside a property to animate it at the playhead.
              </p>
            )}
            {keys.map((key, i) => (
              <div className="key-card" key={i}>
                <div className="field-grid">
                  <Field
                    label={`Key ${i + 1} time`}
                    min={0}
                    max={l.duration}
                    step={1 / s.project.settings.fps}
                    value={key.time}
                    onChange={(n) =>
                      edit((t) => (t.keyframes[keyProp][i].time = n))
                    }
                    disabled={l.locked}
                  />
                  {typeof key.value === "number" ? (
                    <Field
                      label={`Key ${i + 1} value`}
                      step={0.05}
                      value={key.value}
                      onChange={(n) =>
                        edit((t) => (t.keyframes[keyProp][i].value = n))
                      }
                      disabled={l.locked}
                    />
                  ) : (
                    <label className="field">
                      <span>Value</span>
                      <input
                        type={keyProp === "color" ? "color" : "text"}
                        aria-label={`Key ${i + 1} value`}
                        value={key.value}
                        disabled={l.locked}
                        onFocus={s.begin}
                        onBlur={s.end}
                        onChange={(e) =>
                          edit(
                            (t) =>
                              (t.keyframes[keyProp][i].value = e.target.value),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
                {typeof key.value === "number" || keyProp === "color" ? (
                  <EaseEditor
                    value={key.easing}
                    onChange={(e) =>
                      edit((t) => (t.keyframes[keyProp][i].easing = e))
                    }
                  />
                ) : (
                  <p className="muted">
                    Text and style changes switch at the next keyframe.
                  </p>
                )}
                <button
                  className="subtle"
                  disabled={l.locked}
                  onClick={() => edit((t) => t.keyframes[keyProp].splice(i, 1))}
                >
                  Remove keyframe
                </button>
              </div>
            ))}
          </div>
        )}
        <CursorTools />
        {l.type !== "audio" && <AnimationTools />}
      </div>
    </aside>
  );
}
