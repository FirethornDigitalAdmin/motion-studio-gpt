import { z } from "zod";
export const mouthShapes = [
  "auto",
  "sil",
  "PP",
  "FF",
  "TH",
  "DD",
  "kk",
  "CH",
  "SS",
  "nn",
  "RR",
  "aa",
  "E",
  "I",
  "O",
  "U",
] as const;
export const mouthShapeSchema = z.enum(mouthShapes);
export const easingSchema = z.union([
  z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
  z.object({
    type: z.literal("bezier"),
    x1: z.number().min(0).max(1),
    y1: z.number(),
    x2: z.number().min(0).max(1),
    y2: z.number(),
  }),
  z.object({
    type: z.literal("spring"),
    stiffness: z.number().positive(),
    damping: z.number().positive(),
    mass: z.number().positive(),
  }),
]);
export type Easing = z.infer<typeof easingSchema>;
export const faceRegistrationSchema = z.object({
  eyes: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        rx: z.number().positive().max(0.2),
        ry: z.number().positive().max(0.2),
      }),
    )
    .length(2),
});
export const poseFields = {
  pelvisX: 768,
  pelvisY: 793,
  bodyLean: 0,
  handRX: 671,
  handRY: 773,
  handLX: 854,
  handLY: 773,
  footRX: 716,
  footRY: 1166,
  footLX: 822,
  footLY: 1166,
  rightArmBend: 1,
  leftArmBend: -1,
  rightLegBend: -1,
  leftLegBend: -1,
  upperArmLength: 135,
  forearmLength: 125,
  thighLength: 200,
  shinLength: 202,
  rightHandAngle: 0,
  leftHandAngle: 0,
  propAngle: 0,
} as const;
export const poseProperties = Object.keys(
  poseFields,
) as (keyof typeof poseFields)[];
export const poseControlsSchema = z.object({
  pelvisX: z.number().default(768),
  pelvisY: z.number().default(793),
  bodyLean: z.number().default(0),
  handRX: z.number().default(671),
  handRY: z.number().default(773),
  handLX: z.number().default(854),
  handLY: z.number().default(773),
  footRX: z.number().default(716),
  footRY: z.number().default(1166),
  footLX: z.number().default(822),
  footLY: z.number().default(1166),
  rightArmBend: z.number().min(-1).max(1).default(1),
  leftArmBend: z.number().min(-1).max(1).default(-1),
  rightLegBend: z.number().min(-1).max(1).default(-1),
  leftLegBend: z.number().min(-1).max(1).default(-1),
  upperArmLength: z.number().positive().default(135),
  forearmLength: z.number().positive().default(125),
  thighLength: z.number().positive().default(200),
  shinLength: z.number().positive().default(202),
  rightHandAngle: z.number().default(0),
  leftHandAngle: z.number().default(0),
  propAngle: z.number().default(0),
});
export const drawingRegistrationSchema = z.object({
  anchorX: z.number(),
  anchorY: z.number(),
  scaleX: z.number().positive(),
  scaleY: z.number().positive(),
});
export const registrationSchema = z.record(
  z.string(),
  drawingRegistrationSchema,
);
export const cropSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const constraintSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["pin", "reach", "carry"]),
    effector: z.enum(["hand_R", "hand_L", "foot_R", "foot_L"]),
    targetLayerId: z.string().default(""),
    targetX: z.number().default(0.5),
    targetY: z.number().default(0.5),
    worldX: z.number().default(0),
    worldY: z.number().default(0),
    followRotation: z.boolean().default(false),
    rotationOffset: z.number().default(0),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .refine((c) => c.end > c.start, {
    message: "A contact must end after it starts",
    path: ["end"],
  });
export const poseSnapshotSchema = poseControlsSchema.extend({
  headAngle: z.number(),
  expression: z.string(),
  gazeX: z.number().min(-1).max(1),
  gazeY: z.number().min(-1).max(1),
  blink: z.number().min(0).max(1),
  rightHand: z.string(),
  leftHand: z.string(),
  rigProp: z.string(),
});
export const properties = [
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
  "fontSize",
  "letterSpacing",
  "lineHeight",
  "width",
  "height",
  "radius",
  "fontWeight",
  "anchorX",
  "anchorY",
  "headAngle",
  "armAngle",
  "rigTime",
  "gazeX",
  "gazeY",
  "blink",
  ...poseProperties,
] as const;
export type Property = (typeof properties)[number];
export const styleProperties = [
  "color",
  "content",
  "fontFamily",
  "align",
  "shape",
  "assetId",
  "rigClip",
  "expression",
  "poseMode",
  "rightHand",
  "leftHand",
  "rigProp",
  "mouthShape",
  "rigView",
] as const;
export type StyleProperty = (typeof styleProperties)[number];
export type AnimProperty = Property | StyleProperty;
export const animationProperties = [...properties, ...styleProperties];
const keyframe = z.object({
  time: z.number().nonnegative(),
  value: z.union([z.number(), z.string()]),
  easing: easingSchema,
});
export const layerSchema = z
  .object({
    id: z.string(),
    type: z.enum(["text", "image", "shape", "cursor", "audio", "rig"]),
    name: z.string(),
    visible: z.boolean(),
    locked: z.boolean(),
    start: z.number().nonnegative(),
    duration: z.number().positive(),
    anchor: z.object({ x: z.number(), y: z.number() }),
    x: z.number(),
    y: z.number(),
    scale: z.number().positive(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    keyframes: z.record(z.string(), z.array(keyframe)),
    props: z.object({
      ...poseControlsSchema.shape,
      poseMode: z.enum(["preset", "authored"]).default("preset"),
      rightHand: z.string().default("relaxed"),
      leftHand: z.string().default("relaxed"),
      rigProp: z.string().default("none"),
      rigConstraints: z.array(constraintSchema).default([]),
      rigRegistration: registrationSchema.default({}),
      rigDrawings: z
        .array(
          z.object({
            time: z.number().nonnegative(),
            slot: z.string(),
            assetId: z.string(),
            registration: drawingRegistrationSchema,
            crop: cropSchema.nullable(),
          }),
        )
        .default([]),
      smoothJoints: z.boolean().default(false),
      followThrough: z
        .object({
          enabled: z.boolean().default(false),
          strength: z.number().min(0).max(1).default(0.65),
          frequency: z.number().min(1).max(8).default(3),
          damping: z.number().min(0.35).max(1).default(0.65),
          head: z.boolean().default(true),
          arms: z.boolean().default(true),
        })
        .default({
          enabled: false,
          strength: 0.65,
          frequency: 3,
          damping: 0.65,
          head: true,
          arms: true,
        }),
      content: z.string().default("Text"),
      fontFamily: z.string().default("Arial"),
      fontSize: z.number().positive().default(160),
      fontWeight: z.number().default(600),
      lineHeight: z.number().positive().default(1.2),
      letterSpacing: z.number().default(0),
      align: z.enum(["left", "center", "right"]).default("center"),
      color: z.string().default("#ffffff"),
      width: z.number().positive().default(800),
      height: z.number().positive().default(400),
      shape: z.enum(["rectangle", "ellipse"]).default("rectangle"),
      radius: z.number().nonnegative().default(24),
      assetId: z.string().default(""),
      rigAssets: z.record(z.string(), z.string()).default({}),
      rigDimensions: z
        .object({
          upperArmLength: z.number().positive(),
          forearmLength: z.number().positive(),
          thighLength: z.number().positive(),
          shinLength: z.number().positive(),
        })
        .optional(),
      rigVersion: z.number().int().min(1).max(3).default(1),
      rigView: z
        .enum(["front", "three-quarter", "profile"])
        .default("three-quarter"),
      rigDrawing: z.enum(["all", "hands"]).default("all"),
      rigCrops: z
        .record(
          z.string(),
          z.object({
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
          }),
        )
        .default({}),
      rigClip: z.string().default("idle"),
      expression: z.string().default("neutral"),
      rigTime: z.number().nonnegative().default(0),
      gazeX: z.number().min(-1).max(1).default(0),
      gazeY: z.number().min(-1).max(1).default(0),
      blink: z.number().min(0).max(1).default(0),
      autoBlink: z.boolean().default(true),
      continuousJoints: z.boolean().default(false),
      facialEnabled: z.boolean().default(false),
      facialDrawings: z.record(z.string(), faceRegistrationSchema).default({}),
      screenSpace: z.boolean().default(false),
      puppetEnabled: z.boolean().default(false),
      headAngle: z.number().default(0),
      armAngle: z.number().default(0),
      headX: z.number().min(0).max(1).default(0.3),
      headY: z.number().min(0).max(1).default(0),
      headW: z.number().positive().max(1).default(0.4),
      headH: z.number().positive().max(1).default(0.25),
      headPivotX: z.number().min(0).max(1).default(0.5),
      headPivotY: z.number().min(0).max(1).default(0.245),
      armEnabled: z.boolean().default(false),
      armX: z.number().min(0).max(1).default(0.1),
      armY: z.number().min(0).max(1).default(0.3),
      armW: z.number().positive().max(1).default(0.25),
      armH: z.number().positive().max(1).default(0.15),
      armPivotX: z.number().min(0).max(1).default(0.35),
      armPivotY: z.number().min(0).max(1).default(0.35),
      volume: z.number().min(0).max(2).default(1),
      audioOffset: z.number().nonnegative().default(0),
      actor: z.string().default(""),
      mouthEnabled: z.boolean().default(false),
      mouthShape: mouthShapeSchema.default("auto"),
      mouthX: z.number().min(0).max(1).default(0.5),
      mouthY: z.number().min(0).max(1).default(0.2),
      mouthWidth: z.number().positive().default(30),
      mouthHeight: z.number().positive().default(24),
      points: z
        .array(
          z.object({
            time: z.number().nonnegative(),
            x: z.number(),
            y: z.number(),
          }),
        )
        .default([]),
      clicks: z.array(z.number().nonnegative()).default([]),
      smoothing: z.boolean().default(true),
    }),
  })
  .superRefine((layer, ctx) => {
    for (const [prop, keys] of Object.entries(layer.keyframes))
      for (const [i, key] of keys.entries()) {
        const style = (styleProperties as readonly string[]).includes(prop);
        let invalid =
          !(animationProperties as readonly string[]).includes(prop) ||
          (style
            ? typeof key.value !== "string"
            : typeof key.value !== "number");
        if (typeof key.value === "number") {
          if (
            ["scale", "fontSize", "lineHeight", "width", "height"].includes(
              prop,
            ) &&
            key.value <= 0
          )
            invalid = true;
          if (
            [
              "upperArmLength",
              "forearmLength",
              "thighLength",
              "shinLength",
            ].includes(prop) &&
            key.value <= 0
          )
            invalid = true;
          if (prop.endsWith("Bend") && Math.abs(key.value) > 1) invalid = true;
          if (
            prop === "poseMode" &&
            !["preset", "authored"].includes(String(key.value))
          )
            invalid = true;
          if (prop === "radius" && key.value < 0) invalid = true;
          if (prop === "opacity" && (key.value < 0 || key.value > 1))
            invalid = true;
          if (prop === "fontWeight" && (key.value < 100 || key.value > 900))
            invalid = true;
        } else {
          if (
            prop === "rigView" &&
            !["front", "three-quarter", "profile"].includes(String(key.value))
          )
            invalid = true;
          if (
            prop === "mouthShape" &&
            !mouthShapes.includes(key.value as (typeof mouthShapes)[number])
          )
            invalid = true;
          if (
            prop === "poseMode" &&
            !["preset", "authored"].includes(key.value)
          )
            invalid = true;
          if (prop === "color" && !/^#[a-f0-9]{6}$/i.test(key.value))
            invalid = true;
          if (
            prop === "align" &&
            !["left", "center", "right"].includes(key.value)
          )
            invalid = true;
          if (prop === "shape" && !["rectangle", "ellipse"].includes(key.value))
            invalid = true;
        }
        if (invalid)
          ctx.addIssue({
            code: "custom",
            path: ["keyframes", prop, i, "value"],
            message: "Invalid " + prop + " keyframe value",
          });
      }
  });
export type Layer = z.infer<typeof layerSchema>;
export const projectSchema = z
  .object({
    rigTemplates: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().min(1),
          props: layerSchema.shape.props,
        }),
      )
      .default([]),
    poses: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().min(1),
          values: poseSnapshotSchema,
          drawings: z.record(z.string(), z.string()),
          registration: registrationSchema,
          crops: z.record(z.string(), cropSchema).default({}),
        }),
      )
      .default([]),
    version: z.literal(1),
    name: z.string(),
    settings: z.object({
      durationSec: z.number().positive().max(3600),
      aspect: z.enum(["16:9", "9:16", "1:1", "4:5", "custom"]),
      width: z.number().int().min(16).max(7680),
      height: z.number().int().min(16).max(7680),
      fps: z.number().int().min(1).max(120),
      background: z.string(),
    }),
    scenes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        start: z.number().nonnegative(),
        duration: z.number().positive(),
        shots: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              start: z.number().nonnegative(),
              duration: z.number().positive(),
              x: z.number(),
              y: z.number(),
              zoom: z.number().min(0.1).max(10),
              endZoom: z.number().min(0.1).max(10),
              easing: easingSchema,
            }),
          )
          .default([]),
        layers: z.array(layerSchema),
      }),
    ),
    assets: z.array(
      z.object({
        id: z.string(),
        originalName: z.string(),
        relativePath: z.string().regex(/^assets\/[a-zA-Z0-9._-]+$/),
        type: z.enum(["image", "font", "audio"]),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        durationSec: z.number().positive().optional(),
        envelopeRate: z.number().positive().optional(),
        envelope: z.array(z.number().min(0).max(1)).optional(),
      }),
    ),
  })
  .superRefine((project, ctx) => {
    project.scenes.forEach((scene, si) => {
      const entries = scene.layers.flatMap((r) =>
        r.type === "rig"
          ? r.props.rigConstraints.map((c) => ({
              r,
              c,
              start: r.start + c.start,
              end: Math.min(
                r.start + c.end,
                r.start + r.duration,
                scene.duration,
              ),
            }))
          : [],
      );
      for (const { r, c } of entries) {
        const target = scene.layers.find((l) => l.id === c.targetLayerId);
        if (
          c.kind !== "pin" &&
          (!c.effector.startsWith("hand_") ||
            (target && target.type !== "image" && target.type !== "shape"))
        )
          ctx.addIssue({
            code: "custom",
            path: ["scenes", si],
            message: "Prop contacts need a hand and an image or shape prop",
          });
      }
      const boundaries = [
        ...new Set(entries.flatMap((e) => [e.start, e.end])),
      ].sort((a, b) => a - b);
      for (let i = 1; i < boundaries.length; i++) {
        const time = (boundaries[i - 1] + boundaries[i]) / 2,
          live = entries.filter(
            (e) => e.r.visible && time >= e.start && time < e.end,
          );
        const owners = new Map<string, string>();
        for (const { r, c } of live.filter((e) => e.c.kind === "carry")) {
          if (owners.has(c.targetLayerId)) {
            ctx.addIssue({
              code: "custom",
              path: ["scenes", si],
              message:
                "A prop cannot be carried by two contacts at the same time",
            });
            return;
          }
          owners.set(c.targetLayerId, r.id);
        }
        const edges = new Map<string, string[]>();
        for (const { r, c } of live.filter((e) => e.c.kind === "reach")) {
          const owner = owners.get(c.targetLayerId);
          if (owner) edges.set(r.id, [...(edges.get(r.id) || []), owner]);
        }
        const visited = new Set<string>(),
          stack = new Set<string>();
        const cycle = (id: string): boolean => {
          if (stack.has(id)) return true;
          if (visited.has(id)) return false;
          stack.add(id);
          for (const target of edges.get(id) || [])
            if (cycle(target)) return true;
          stack.delete(id);
          visited.add(id);
          return false;
        };
        if ([...edges.keys()].some(cycle)) {
          ctx.addIssue({
            code: "custom",
            path: ["scenes", si],
            message:
              "These prop contacts form a cycle. Release the prop or remove the reaching contact first",
          });
          return;
        }
      }
    });
  });
export type Project = z.infer<typeof projectSchema>;
export type Scene = Project["scenes"][number];
export const id = () => crypto.randomUUID();
export function emptyProject(): Project {
  return {
    version: 1,
    name: "Untitled",
    settings: {
      durationSec: 15,
      aspect: "16:9",
      width: 3840,
      height: 2160,
      fps: 30,
      background: "#101218",
    },
    scenes: [],
    assets: [],
    poses: [],
    rigTemplates: [],
  };
}
export function makeLayer(type: Layer["type"], p: Project): Layer {
  return layerSchema.parse({
    id: id(),
    type,
    name:
      type === "text"
        ? "Text"
        : type === "image"
          ? "Image"
          : type === "audio"
            ? "Audio"
            : type === "cursor"
              ? "Cursor"
              : type === "rig"
                ? "Louis rig"
                : "Rectangle",
    visible: true,
    locked: false,
    start: 0,
    duration: p.settings.durationSec,
    anchor: { x: 0.5, y: 0.5 },
    x: p.settings.width / 2,
    y: p.settings.height / 2,
    scale: 1,
    rotation: 0,
    opacity: 1,
    keyframes: {},
    props: {},
  });
}
export function ease(t: number, e: Easing): number {
  t = Math.max(0, Math.min(1, t));
  if (t === 0 || t === 1) return t;
  if (e === "linear") return t;
  if (typeof e === "string")
    return ease(
      t,
      e === "ease-in"
        ? { type: "bezier", x1: 0.42, y1: 0, x2: 1, y2: 1 }
        : e === "ease-out"
          ? { type: "bezier", x1: 0, y1: 0, x2: 0.58, y2: 1 }
          : { type: "bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
    );
  if (e.type === "bezier") {
    const b = (u: number, a: number, c: number) =>
      3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * c + u ** 3;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (b(mid, e.x1, e.x2) < t) lo = mid;
      else hi = mid;
    }
    return b((lo + hi) / 2, e.y1, e.y2);
  }
  const w = Math.sqrt(e.stiffness / e.mass),
    zeta = e.damping / (2 * Math.sqrt(e.stiffness * e.mass));
  const response = (s: number) => {
    if (zeta < 1) {
      const wd = w * Math.sqrt(1 - zeta * zeta);
      return (
        1 -
        Math.exp(-zeta * w * s) *
          (Math.cos(wd * s) + ((zeta * w) / wd) * Math.sin(wd * s))
      );
    }
    if (Math.abs(zeta - 1) < 0.0001) return 1 - Math.exp(-w * s) * (1 + w * s);
    const a = -w * (zeta - Math.sqrt(zeta * zeta - 1)),
      b = -w * (zeta + Math.sqrt(zeta * zeta - 1));
    return 1 - (b * Math.exp(a * s) - a * Math.exp(b * s)) / (b - a);
  };
  return response(t) / response(1);
}
export function valueAt(layer: Layer, prop: Property, time: number): number {
  const fallback =
    prop === "anchorX"
      ? layer.anchor.x
      : prop === "anchorY"
        ? layer.anchor.y
        : prop in layer
          ? Number(layer[prop as keyof Layer])
          : Number(layer.props[prop as keyof Layer["props"]]);
  const keys = [...(layer.keyframes[prop] || [])].sort(
    (a, b) => a.time - b.time,
  );
  if (!keys.length) return fallback;
  if (time <= keys[0].time) return Number(keys[0].value);
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i].time) {
      const a = keys[i - 1],
        b = keys[i];
      if (
        (layer.type === "rig" || layer.type === "image") &&
        layer.props.continuousJoints &&
        (
          [
            ...poseProperties,
            "headAngle",
            "armAngle",
            "gazeX",
            "gazeY",
            "blink",
          ] as readonly string[]
        ).includes(prop) &&
        !prop.endsWith("Length") &&
        !prop.endsWith("Bend")
      )
        return continuousValue(keys, i, time);
      const result =
        Number(a.value) +
        (Number(b.value) - Number(a.value)) *
          ease((time - a.time) / (b.time - a.time), a.easing);
      if (["scale", "fontSize", "lineHeight", "width", "height"].includes(prop))
        return Math.max(0.001, result);
      if (prop === "radius") return Math.max(0, result);
      if (prop === "opacity") return Math.max(0, Math.min(1, result));
      if (prop === "fontWeight") return Math.max(100, Math.min(900, result));
      return result;
    }
  }
  return Number(keys.at(-1)!.value);
}
// Shape-preserving Hermite tangents retain flat holds, without stopping at every
// passing pose. Unequal key spacing is included in the tangent calculation.
export function continuousValue(
  keys: { time: number; value: number | string }[],
  i: number,
  time: number,
) {
  const slope = (a: number, b: number) =>
    (Number(keys[b].value) - Number(keys[a].value)) /
    (keys[b].time - keys[a].time);
  const tangent = (j: number) => {
    if (j === 0 || j === keys.length - 1) return 0;
    const a = slope(j - 1, j),
      b = slope(j, j + 1);
    if (a * b <= 0) return 0;
    const h0 = keys[j].time - keys[j - 1].time,
      h1 = keys[j + 1].time - keys[j].time;
    const w0 = 2 * h1 + h0,
      w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  };
  const a = keys[i - 1],
    b = keys[i],
    h = b.time - a.time,
    u = (time - a.time) / h;
  return (
    (2 * u ** 3 - 3 * u * u + 1) * Number(a.value) +
    (u ** 3 - 2 * u * u + u) * h * tangent(i - 1) +
    (-2 * u ** 3 + 3 * u * u) * Number(b.value) +
    (u ** 3 - u * u) * h * tangent(i)
  );
}
export function styleAt(
  layer: Layer,
  prop: StyleProperty,
  time: number,
): string {
  const keys = [...(layer.keyframes[prop] || [])].sort(
    (a, b) => a.time - b.time,
  );
  if (!keys.length) return String(layer.props[prop]);
  if (time <= keys[0].time) return String(keys[0].value);
  for (let i = 1; i < keys.length; i++) {
    if (time < keys[i].time) {
      const a = keys[i - 1],
        b = keys[i];
      if (
        prop === "color" &&
        /^#[\da-f]{6}$/i.test(String(a.value)) &&
        /^#[\da-f]{6}$/i.test(String(b.value))
      ) {
        const amount = ease((time - a.time) / (b.time - a.time), a.easing);
        return (
          "#" +
          [1, 3, 5]
            .map((offset) => {
              const x = parseInt(String(a.value).slice(offset, offset + 2), 16),
                y = parseInt(String(b.value).slice(offset, offset + 2), 16);
              return Math.max(
                0,
                Math.min(255, Math.round(x + (y - x) * amount)),
              )
                .toString(16)
                .padStart(2, "0");
            })
            .join("")
        );
      }
      return String(a.value);
    }
  }
  return String(keys.at(-1)!.value);
}
export function animatedValue(layer: Layer, prop: AnimProperty, time: number) {
  return (styleProperties as readonly string[]).includes(prop)
    ? styleAt(layer, prop as StyleProperty, time)
    : valueAt(layer, prop as Property, time);
}
export function layerAt(layer: Layer, t: number) {
  const at = {
    ...layer,
    anchor: {
      x: valueAt(layer, "anchorX", t),
      y: valueAt(layer, "anchorY", t),
    },
    ...Object.fromEntries(
      properties.slice(0, 5).map((k) => [k, valueAt(layer, k, t)]),
    ),
    props: {
      ...layer.props,
      ...Object.fromEntries(
        properties
          .slice(5)
          .filter((k) => k !== "anchorX" && k !== "anchorY")
          .map((k) => [k, valueAt(layer, k, t)]),
      ),
      ...Object.fromEntries(
        styleProperties.map((k) => [k, styleAt(layer, k, t)]),
      ),
    },
  } as Layer;
  if (layer.props.rigDrawings.length) {
    at.props.rigAssets = { ...layer.props.rigAssets };
    at.props.rigRegistration = { ...layer.props.rigRegistration };
    at.props.rigCrops = { ...layer.props.rigCrops };
    for (const key of [...layer.props.rigDrawings].sort(
      (a, b) => a.time - b.time,
    )) {
      if (key.time > t) break;
      at.props.rigAssets[key.slot] = key.assetId;
      at.props.rigRegistration[key.slot] = key.registration;
      if (key.crop) at.props.rigCrops[key.slot] = key.crop;
      else delete at.props.rigCrops[key.slot];
    }
  }
  return at;
}
export function preset(
  layer: Layer,
  kind: string,
  direction: string,
  distance: number,
  delay: number,
  duration: number,
  easing: Easing,
) {
  const end = kind.endsWith("out"),
    base = kind.split("-")[0];
  const prop: Property =
    base === "fade"
      ? "opacity"
      : base === "scale"
        ? "scale"
        : direction === "left" || direction === "right"
          ? "x"
          : "y";
  const normal = Number(layer[prop]);
  const offset =
    base === "fade"
      ? 0
      : base === "scale"
        ? 0.01
        : normal +
          (direction === "left" || direction === "up" ? -distance : distance);
  layer.keyframes[prop] = [
    { time: delay, value: end ? normal : offset, easing },
    { time: delay + duration, value: end ? offset : normal, easing: "linear" },
  ];
}
export function stagger(
  layers: Layer[],
  order: string,
  interval: number,
  seed: number,
) {
  const arranged = [...layers];
  if (order === "reverse") arranged.reverse();
  if (order === "random") {
    let s = seed >>> 0;
    for (let i = arranged.length - 1; i > 0; i--) {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [arranged[i], arranged[j]] = [arranged[j], arranged[i]];
    }
  }
  const base = Math.min(...layers.map((l) => l.start));
  arranged.forEach((l, i) => (l.start = base + i * interval));
}
