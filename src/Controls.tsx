import { useStore } from "./store";
import { ease, type Easing } from "./model";
export function Field({
  label,
  ariaLabel,
  value,
  onChange,
  min,
  max,
  step = 1,
  title,
  disabled = false,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
  disabled?: boolean;
}) {
  const s = useStore();
  return (
    <label className="field" title={title || label}>
      <span>{label}</span>
      <input
        aria-label={ariaLabel || label}
        disabled={disabled}
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number(value.toFixed(4))}
        onFocus={s.begin}
        onBlur={s.end}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (
            Number.isFinite(n) &&
            (min === undefined || n >= min) &&
            (max === undefined || n <= max)
          )
            onChange(n);
        }}
      />
    </label>
  );
}
export function EaseEditor({
  value,
  onChange,
  label = "Easing",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
  value: Easing;
  onChange: (e: Easing) => void;
}) {
  const kind = typeof value === "string" ? value : value.type;
  const path = Array.from(
    { length: 61 },
    (_, i) => `${i ? "L" : "M"}${i * 2},${65 - ease(i / 60, value) * 50}`,
  ).join(" ");
  return (
    <div className="ease-editor">
      <select
        aria-label={label}
        title="How motion accelerates between keyframes; applied to the outgoing segment"
        value={kind}
        onChange={(e) =>
          onChange(
            e.target.value === "bezier"
              ? { type: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }
              : e.target.value === "spring"
                ? { type: "spring", stiffness: 100, damping: 10, mass: 1 }
                : (e.target.value as Easing),
          )
        }
      >
        <option value="linear">Linear</option>
        <option value="ease-in">Ease in</option>
        <option value="ease-out">Ease out</option>
        <option value="ease-in-out">Ease in & out</option>
        <option value="bezier">Custom curve</option>
        <option value="spring">Spring</option>
      </select>
      <svg viewBox="0 0 120 90" aria-label="Easing curve preview">
        <path d="M0 65H120M0 15H120" stroke="#343944" />
        <path d={path} fill="none" stroke="#a8bfff" strokeWidth="2" />
      </svg>
      {!compact && typeof value === "object" && value.type === "bezier" && (
        <div className="field-grid">
          {(["x1", "y1", "x2", "y2"] as const).map((k) => (
            <Field
              key={k}
              label={k.toUpperCase()}
              value={value[k]}
              step={0.05}
              min={k.startsWith("x") ? 0 : undefined}
              max={k.startsWith("x") ? 1 : undefined}
              onChange={(n) => onChange({ ...value, [k]: n })}
              title="Cubic Bézier control point; horizontal values must be between 0 and 1"
            />
          ))}
        </div>
      )}
      {typeof value === "object" && value.type === "spring" && (
        <div className="field-grid">
          {(["stiffness", "damping", "mass"] as const).map((k) => (
            <Field
              key={k}
              label={"Spring " + k}
              value={value[k]}
              min={0.01}
              step={k === "mass" ? 0.1 : 1}
              title={
                k === "stiffness"
                  ? "Higher stiffness pulls towards the target faster"
                  : k === "damping"
                    ? "Higher damping reduces oscillation"
                    : "Higher mass slows the response"
              }
              onChange={(n) => onChange({ ...value, [k]: n })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
