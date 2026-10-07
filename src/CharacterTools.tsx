import { useState } from "react";
import { useStore, editLayer } from "./store";
import { Field } from "./Controls";
import { bakeFollowThrough } from "./followThrough";
import {
  id,
  layerAt,
  poseProperties,
  type AnimProperty,
  type Layer,
  type Scene,
  type Project,
} from "./model";
import {
  evaluateRigScene,
  rigToWorld,
  inverseLayerPoint,
  poseValues,
  recordPose,
  putKey,
  effectorLabels,
  poseLabels,
  contactActive,
  type Effector,
} from "./rigging";
const handOptions = [
  "relaxed",
  "typing",
  "grasp",
  "handle",
  "point",
  "fist",
  "open",
  "pinch",
];
export function writeDrawing(
  l: Layer,
  time: number,
  slot: string,
  assetId: string,
  registration: Layer["props"]["rigRegistration"][string],
  crop: Layer["props"]["rigCrops"][string] | null,
) {
  const existing = l.props.rigDrawings.find(
    (k) => k.slot === slot && Math.abs(k.time - time) < 0.0001,
  );
  const key = { time, slot, assetId, registration, crop };
  if (existing) Object.assign(existing, key);
  else l.props.rigDrawings.push(key);
}
export default function CharacterTools({
  layer: l,
  scene,
}: {
  layer: Layer;
  scene: Scene;
}) {
  const s = useStore(),
    time = Math.max(0, s.time - scene.start - l.start),
    resolved = evaluateRigScene(scene, s.time),
    at = resolved.layers.get(l.id)!,
    pose = resolved.poses.get(l.id);
  const [name, setName] = useState("New pose"),
    [chosen, setChosen] = useState(""),
    [target, setTarget] = useState(""),
    [kind, setKind] = useState<"reach" | "carry">("reach"),
    [slot, setSlot] = useState("head");
  const [followError, setFollowError] = useState("");
  if (!pose)
    return (
      <p className="muted">
        Move the playhead inside this character’s duration to edit a pose.
      </p>
    );
  const values = poseValues(at, pose),
    joint = (
      s.poseJoint in effectorLabels ? s.poseJoint : "hand_R"
    ) as Effector;
  const edit = (f: (l: Layer) => void) => editLayer(l.id, f);
  const capture = (patch: Partial<Project["poses"][number]["values"]> = {}) =>
    edit((t) => recordPose(t, time, { ...values, ...patch }));
  const change = (prop: AnimProperty, value: number | string) =>
    capture({ [prop]: value });
  const pin = () => {
    const world = rigToWorld(at, pose.attachments[joint]!);
    edit((t) =>
      t.props.rigConstraints.push({
        id: id(),
        kind: "pin",
        effector: joint,
        worldX: world.x,
        worldY: world.y,
        targetLayerId: "",
        targetX: 0.5,
        targetY: 0.5,
        followRotation: false,
        rotationOffset: 0,
        start: time,
        end: l.duration,
      }),
    );
  };
  const addContact = () => {
    const raw = scene.layers.find((q) => q.id === target),
      prop = resolved.layers.get(target);
    if (!raw || !prop) return;
    const world = rigToWorld(at, pose.attachments[joint]!),
      grip = inverseLayerPoint(prop, world),
      hand = pose.parts.find((p) => p.name === joint);
    edit((t) =>
      t.props.rigConstraints.push({
        id: id(),
        kind,
        effector: joint,
        targetLayerId: target,
        targetX: grip.x / prop.props.width,
        targetY: grip.y / prop.props.height,
        worldX: 0,
        worldY: 0,
        followRotation: kind === "carry",
        rotationOffset: prop.rotation - at.rotation - (hand?.rotation || 0),
        start: time,
        end: l.duration,
      }),
    );
  };
  const release = (c: Layer["props"]["rigConstraints"][number]) => {
    const before = evaluateRigScene(scene, s.time - 0.00001),
      held = before.layers.get(c.targetLayerId),
      rawProp = scene.layers.find((q) => q.id === c.targetLayerId);
    s.edit((p) => {
      const actor = p.scenes
        .flatMap((sc) => sc.layers)
        .find((q) => q.id === l.id)!;
      actor.props.rigConstraints.find((q) => q.id === c.id)!.end = time;
      if (c.kind === "carry" && held && rawProp) {
        const prop = p.scenes
          .flatMap((sc) => sc.layers)
          .find((q) => q.id === rawProp.id)!;
        const begin = layerAt(
            rawProp,
            scene.start + l.start + c.start - scene.start - rawProp.start,
          ),
          beginTime = l.start + c.start - rawProp.start,
          endTime = s.time - scene.start - prop.start;
        for (const k of ["x", "y", "rotation"] as const) {
          if (!prop.keyframes[k]?.length)
            putKey(prop, k, 0, rawProp[k], "linear");
          putKey(prop, k, Math.max(0, beginTime), begin[k], "linear");
          putKey(prop, k, Math.max(0, endTime), held[k], "linear");
        }
      }
    });
  };
  const slotPart = pose.parts.find((p) => p.asset === slot),
    registration = at.props.rigRegistration[slot] || {
      anchorX: slotPart?.anchor.x ?? 0.5,
      anchorY: slotPart?.anchor.y ?? 0.5,
      scaleX: 1,
      scaleY: 1,
    };
  const selectedPose = s.project.poses.find((p) => p.id === chosen);
  const updateRegistration = (key: keyof typeof registration, v: number) =>
    edit((t) =>
      writeDrawing(
        t,
        time,
        slot,
        at.props.rigAssets[slot],
        { ...registration, [key]: v },
        at.props.rigCrops[slot] || null,
      ),
    );
  const blocked = l.locked || time >= l.duration;
  return (
    <section className="character-tools">
      <div className="character-tools-heading">
        <strong>Character animation</strong>
        <span className="tag">
          {at.props.poseMode === "authored" ? "Authored pose" : "Action preset"}
        </span>
      </div>
      {l.props.rigVersion === 3 && (
        <label className="field">
          <span>Head view</span>
          <select
            aria-label="Head view"
            disabled={blocked}
            value={at.props.rigView}
            onChange={(e) =>
              edit((t) => {
                if (!t.keyframes.rigView?.length && time > 0)
                  putKey(t, "rigView", 0, t.props.rigView, "linear");
                putKey(t, "rigView", time, e.target.value, "linear");
              })
            }
          >
            <option value="front">Front</option>
            <option value="three-quarter">Three-quarter</option>
            <option value="profile">Profile</option>
          </select>
        </label>
      )}
      <details className="follow-through-tools">
        <summary>Follow-through</summary>
        <p className="muted">
          Soften authored head and wrist movements with spring lag and settling.
          Active hand contacts stay attached. Action presets keep their original
          motion.
        </p>
        <fieldset
          disabled={blocked}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label className="field inline-check">
            <input
              type="checkbox"
              aria-label="Enable follow-through"
              checked={l.props.followThrough.enabled}
              onChange={(e) =>
                edit((t) => {
                  t.props.followThrough.enabled = e.target.checked;
                })
              }
            />
            Enable follow-through
          </label>
          {(["head", "arms"] as const).map((k) => (
            <label className="field inline-check" key={k}>
              <input
                type="checkbox"
                aria-label={"Follow-through " + k}
                checked={l.props.followThrough[k]}
                onChange={(e) =>
                  edit((t) => {
                    t.props.followThrough[k] = e.target.checked;
                  })
                }
              />
              {k === "head" ? "Head settling" : "Arm overlap"}
            </label>
          ))}
          <Field
            label="Follow-through strength"
            value={l.props.followThrough.strength}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) =>
              edit((t) => {
                t.props.followThrough.strength = v;
              })
            }
          />
          <Field
            label="Follow-through frequency"
            value={l.props.followThrough.frequency}
            min={1}
            max={8}
            step={0.25}
            onChange={(v) =>
              edit((t) => {
                t.props.followThrough.frequency = v;
              })
            }
          />
          <Field
            label="Follow-through damping"
            value={l.props.followThrough.damping}
            min={0.35}
            max={1}
            step={0.05}
            onChange={(v) =>
              edit((t) => {
                t.props.followThrough.damping = v;
              })
            }
          />
          <p className="muted">
            Strength blends with your keys. Lower frequency adds lag; lower
            damping adds bounce. Bake samples at the project frame rate and
            switches the effect off.
          </p>
          <button
            disabled={!l.props.followThrough.enabled}
            onClick={() => {
              try {
                const baked = bakeFollowThrough(l, s.project.settings.fps);
                edit((t) => {
                  Object.assign(t, baked);
                });
                setFollowError("");
              } catch (e) {
                setFollowError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Bake follow-through to keys
          </button>
        </fieldset>
        {followError && <p role="alert">{followError}</p>}
      </details>
      <label className="field inline-check">
        <input
          aria-label="Edit joints on canvas"
          type="checkbox"
          checked={s.poseEditing}
          onChange={(e) =>
            useStore.setState({ poseEditing: e.target.checked, playing: false })
          }
        />
        Edit joints on canvas
      </label>
      <p className="muted">
        Drag hips, wrists or ankles. Drag an elbow or knee to choose its bend.
        Joint edits record a pose at the playhead.
      </p>
      <div className="character-actions">
        <button disabled={blocked} onClick={() => capture()}>
          Record current pose
        </button>
        <button
          disabled={blocked}
          onClick={() =>
            edit((t) => {
              if (!t.keyframes.poseMode?.length && time > 0)
                putKey(t, "poseMode", 0, t.props.poseMode, "linear");
              putKey(t, "poseMode", time, "preset", "linear");
            })
          }
        >
          Return to action preset
        </button>
      </div>
      <label className="field inline-check">
        <input
          aria-label="Onion skin"
          type="checkbox"
          checked={s.onionSkin}
          onChange={(e) => useStore.setState({ onionSkin: e.target.checked })}
        />
        Onion skin
      </label>
      {s.onionSkin && (
        <Field
          label="Onion skin frames"
          value={s.onionFrames}
          min={1}
          max={48}
          onChange={(v) => useStore.setState({ onionFrames: Math.round(v) })}
        />
      )}
      <details>
        <summary>Pose controls</summary>
        <div className="field-grid">
          {poseProperties
            .filter((k) => !k.endsWith("Length") && !k.endsWith("Bend"))
            .map((k) => (
              <Field
                key={k}
                label={poseLabels[k]}
                value={values[k]}
                disabled={blocked}
                onChange={(v) => change(k, v)}
              />
            ))}
        </div>
        {(
          [
            "rightArmBend",
            "leftArmBend",
            "rightLegBend",
            "leftLegBend",
          ] as const
        ).map((k) => (
          <button
            className="bend-button"
            key={k}
            disabled={blocked}
            onClick={() => change(k, -Math.sign(values[k] || 1))}
          >
            Flip {poseLabels[k].replace(" bend", "").toLowerCase()}
          </button>
        ))}
        {(["R", "L"] as const).map((side) => (
          <label className="field" key={side}>
            <span>{side === "R" ? "Right" : "Left"} hand drawing</span>
            <select
              aria-label={(side === "R" ? "Right" : "Left") + " hand drawing"}
              value={side === "R" ? values.rightHand : values.leftHand}
              disabled={blocked}
              onChange={(e) =>
                change(side === "R" ? "rightHand" : "leftHand", e.target.value)
              }
            >
              {[...handOptions, ...(side === "L" ? ["kettle"] : [])].map(
                (h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ),
              )}
            </select>
          </label>
        ))}
        <label className="field">
          <span>Built-in prop</span>
          <select
            aria-label="Built-in prop"
            value={values.rigProp}
            disabled={blocked}
            onChange={(e) => change("rigProp", e.target.value)}
          >
            {["none", "cup", "book", "phone", "box"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </details>
      <details>
        <summary>Contacts &amp; props</summary>
        <label className="field">
          <span>Contact joint</span>
          <select
            aria-label="Contact joint"
            value={joint}
            onChange={(e) => useStore.setState({ poseJoint: e.target.value })}
          >
            {Object.entries(effectorLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button disabled={blocked} onClick={pin}>
          Pin joint in scene
        </button>
        {joint.startsWith("hand_") && (
          <>
            <label className="field">
              <span>Prop contact</span>
              <select
                aria-label="Prop contact"
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="reach">Hand follows prop grip</option>
                <option value="carry">Prop follows hand</option>
              </select>
            </label>
            <label className="field">
              <span>Contact prop</span>
              <select
                aria-label="Contact prop"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choose a prop</option>
                {scene.layers
                  .filter((q) => q.type === "image" || q.type === "shape")
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={blocked || !target} onClick={addContact}>
              Add prop contact
            </button>
          </>
        )}
        <p className="muted">
          Contacts begin at the playhead. Grip coordinates are fractions of the
          prop drawing. Release bakes the held prop position into its timeline.
        </p>
        {l.props.rigConstraints.map((c, contactIndex) => (
          <div className="contact-card" key={c.id}>
            <strong>
              {effectorLabels[c.effector]} ·{" "}
              {c.kind === "pin"
                ? "Pinned"
                : c.kind === "reach"
                  ? "Reaching"
                  : "Carrying"}
            </strong>
            {c.kind !== "pin" && (
              <span>
                {scene.layers.find((q) => q.id === c.targetLayerId)?.name ||
                  "Missing prop"}
              </span>
            )}
            <div className="field-grid">
              <Field
                label="Start"
                ariaLabel={"Contact " + (contactIndex + 1) + " start"}
                title="Seconds after the character starts"
                value={c.start}
                min={0}
                max={c.end - 0.001}
                step={0.05}
                disabled={blocked}
                onChange={(v) =>
                  edit((t) => {
                    t.props.rigConstraints.find((q) => q.id === c.id)!.start =
                      v;
                  })
                }
              />
              <Field
                label="End"
                ariaLabel={"Contact " + (contactIndex + 1) + " end"}
                value={c.end}
                min={c.start + 0.001}
                step={0.05}
                disabled={blocked}
                onChange={(v) =>
                  edit((t) => {
                    t.props.rigConstraints.find((q) => q.id === c.id)!.end = v;
                  })
                }
              />
            </div>
            {c.kind !== "pin" && (
              <div className="field-grid">
                {(["targetX", "targetY"] as const).map((k) => (
                  <Field
                    key={k}
                    label={k === "targetX" ? "Grip X" : "Grip Y"}
                    ariaLabel={
                      "Contact " +
                      (contactIndex + 1) +
                      (k === "targetX" ? " grip X" : " grip Y")
                    }
                    value={c[k]}
                    step={0.01}
                    disabled={blocked}
                    onChange={(v) =>
                      edit((t) => {
                        t.props.rigConstraints.find((q) => q.id === c.id)![k] =
                          v;
                      })
                    }
                  />
                ))}
              </div>
            )}
            {c.kind === "carry" && (
              <label className="field inline-check">
                <input
                  type="checkbox"
                  aria-label={
                    "Contact " + (contactIndex + 1) + " follow hand rotation"
                  }
                  checked={c.followRotation}
                  disabled={blocked}
                  onChange={(e) =>
                    edit((t) => {
                      t.props.rigConstraints.find(
                        (q) => q.id === c.id,
                      )!.followRotation = e.target.checked;
                    })
                  }
                />
                Follow hand rotation
              </label>
            )}
            <div className="character-actions">
              <button
                disabled={
                  blocked ||
                  !contactActive(c, l, scene, s.time) ||
                  time <= c.start
                }
                onClick={() => release(c)}
              >
                Release at playhead
              </button>
              <button
                disabled={blocked}
                onClick={() =>
                  edit((t) => {
                    t.props.rigConstraints = t.props.rigConstraints.filter(
                      (q) => q.id !== c.id,
                    );
                  })
                }
              >
                Remove contact
              </button>
            </div>
          </div>
        ))}
      </details>
      <details>
        <summary>Pose library</summary>
        <label className="field">
          <span>Pose name</span>
          <input
            aria-label="Pose name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          disabled={blocked || !name.trim()}
          onClick={() =>
            s.edit((p) =>
              p.poses.push({
                id: id(),
                name: name.trim(),
                values,
                drawings: { ...at.props.rigAssets },
                registration: structuredClone(at.props.rigRegistration),
                crops: structuredClone(at.props.rigCrops),
              }),
            )
          }
        >
          Save pose to library
        </button>
        <label className="field">
          <span>Saved pose</span>
          <select
            aria-label="Saved pose"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">Choose a pose</option>
            {s.project.poses.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="character-actions">
          <button
            disabled={blocked || !selectedPose}
            onClick={() =>
              edit((t) => {
                recordPose(t, time, selectedPose!.values);
                for (const [slot, asset] of Object.entries(
                  selectedPose!.drawings,
                ))
                  writeDrawing(
                    t,
                    time,
                    slot,
                    asset,
                    selectedPose!.registration[slot] || {
                      anchorX:
                        pose.parts.find((q) => q.asset === slot)?.anchor.x ??
                        0.5,
                      anchorY:
                        pose.parts.find((q) => q.asset === slot)?.anchor.y ??
                        0.5,
                      scaleX: 1,
                      scaleY: 1,
                    },
                    selectedPose!.crops[slot] || null,
                  );
              })
            }
          >
            Apply saved pose
          </button>
          <button
            disabled={blocked || !selectedPose}
            onClick={() =>
              s.edit((p) => {
                p.poses = p.poses.filter((q) => q.id !== chosen);
              })
            }
          >
            Remove saved pose
          </button>
        </div>
      </details>
      <details>
        <summary>Drawing registration &amp; proportions</summary>
        <label className="field inline-check">
          <input
            type="checkbox"
            aria-label="Smooth joint overlaps"
            checked={l.props.smoothJoints}
            disabled={blocked}
            onChange={(e) =>
              edit((t) => {
                t.props.smoothJoints = e.target.checked;
              })
            }
          />
          Smooth joint overlaps
        </label>
        <div className="field-grid">
          {poseProperties
            .filter((k) => k.endsWith("Length"))
            .map((k) => (
              <Field
                key={k}
                label={poseLabels[k]}
                value={values[k]}
                min={10}
                max={600}
                disabled={blocked}
                onChange={(v) => change(k, v)}
              />
            ))}
        </div>
        <label className="field">
          <span>Drawing slot</span>
          <select
            aria-label="Drawing slot"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          >
            {Object.keys(l.props.rigAssets).map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Registered drawing</span>
          <select
            aria-label="Registered drawing"
            value={at.props.rigAssets[slot] || ""}
            disabled={blocked}
            onChange={(e) =>
              edit((t) =>
                writeDrawing(
                  t,
                  time,
                  slot,
                  e.target.value,
                  registration,
                  e.target.value === at.props.rigAssets[slot]
                    ? at.props.rigCrops[slot] || null
                    : null,
                ),
              )
            }
          >
            {s.project.assets
              .filter((a) => a.type === "image")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                </option>
              ))}
          </select>
        </label>
        <div className="field-grid">
          {Object.entries(registration).map(([k, v]) => (
            <Field
              key={k}
              label={"Drawing " + k}
              value={v}
              min={k.startsWith("scale") ? 0.01 : undefined}
              step={0.01}
              disabled={blocked}
              onChange={(v) =>
                updateRegistration(k as keyof typeof registration, v)
              }
            />
          ))}
        </div>
        <p className="muted">
          Drawing swaps and their registration are keyed at the playhead. Use
          matching separated artwork for a new viewing angle.
        </p>
        {l.props.rigDrawings
          .filter((k) => k.slot === slot)
          .map((k, i) => (
            <div className="drawing-key" key={i}>
              <Field
                label={"Drawing key " + (i + 1) + " time"}
                value={k.time}
                min={0}
                step={0.05}
                disabled={blocked}
                onChange={(v) =>
                  edit((t) => {
                    const entry = t.props.rigDrawings.find(
                      (q) => q.slot === k.slot && q.time === k.time,
                    );
                    if (entry) entry.time = v;
                  })
                }
              />
              <button
                disabled={blocked}
                onClick={() =>
                  edit((t) => {
                    t.props.rigDrawings = t.props.rigDrawings.filter(
                      (q) => q.slot !== k.slot || q.time !== k.time,
                    );
                  })
                }
              >
                Remove drawing key
              </button>
            </div>
          ))}
      </details>
      {Object.entries(pose.ikError).some(([, v]) => v > 1) && (
        <p className="rig-warning" role="status">
          A joint target is beyond reach. Move the hips or target closer to keep
          the limbs at their drawn length.
        </p>
      )}
      {resolved.warnings.length > 0 && (
        <p className="rig-warning" role="status">
          {resolved.warnings.join(". ")}
        </p>
      )}
    </section>
  );
}
