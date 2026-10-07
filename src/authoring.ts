import { z } from "zod";
import {
  animationProperties,
  properties,
  layerSchema,
  projectSchema,
  poseSnapshotSchema,
  constraintSchema,
  drawingRegistrationSchema,
  cropSchema,
  easingSchema,
  makeLayer,
  layerAt,
  type Project,
  type Layer,
} from "./model";
import { evaluateRigScene, poseValues, recordPose, putKey } from "./rigging";
import { bakeLipSync, lipSyncInputSchema, recordBlink } from "./lipSync";
import { bakeFollowThrough } from "./followThrough";

const ref = z.string().min(1).max(120),
  time = z.number().nonnegative();
const posePatchSchema = z
  .object(
    Object.fromEntries(
      Object.entries(poseSnapshotSchema.shape).map(([key, schema]) => [
        key,
        (schema instanceof z.ZodDefault ? schema.unwrap() : schema).optional(),
      ]),
    ),
  )
  .strict() as z.ZodType<Partial<z.infer<typeof poseSnapshotSchema>>>;
export const authoringCommandSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("generateLipSync"),
      layerId: ref,
      input: lipSyncInputSchema,
    })
    .strict(),
  z.object({ op: z.literal("addBlink"), layerId: ref, time }).strict(),
  z
    .object({
      op: z.literal("setFollowThrough"),
      layerId: ref,
      values: z
        .object(
          Object.fromEntries(
            Object.entries(
              layerSchema.shape.props.shape.followThrough.unwrap().shape,
            ).map(([key, schema]) => [key, schema.unwrap().optional()]),
          ),
        )
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal("bakeFollowThrough"), layerId: ref }).strict(),
  z
    .object({
      op: z.literal("createScene"),
      id: ref,
      name: ref,
      start: time,
      duration: z.number().positive(),
    })
    .strict(),
  z
    .object({
      op: z.literal("createLayer"),
      sceneId: ref,
      id: ref,
      type: z.enum(["shape", "text", "image", "audio", "rig"]),
      name: ref,
      assetId: ref.optional(),
      templateId: ref.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setTransform"),
      layerId: ref,
      values: z
        .object({
          x: z.number(),
          y: z.number(),
          scale: z.number().positive(),
          rotation: z.number(),
          opacity: z.number().min(0).max(1),
          start: time,
          duration: z.number().positive(),
          anchor: z.object({ x: z.number(), y: z.number() }).strict(),
        })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setKeyframe"),
      layerId: ref,
      property: z.enum(animationProperties as [string, ...string[]]),
      time,
      value: z.union([z.number(), z.string()]),
      easing: easingSchema.default("ease-in-out"),
    })
    .strict(),
  z
    .object({
      op: z.literal("setPose"),
      layerId: ref,
      time,
      values: posePatchSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("setDrawing"),
      layerId: ref,
      slot: ref,
      assetId: ref,
      time: time.optional(),
      registration: drawingRegistrationSchema,
      crop: cropSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("addContact"),
      layerId: ref,
      contact: constraintSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("releaseContact"),
      layerId: ref,
      contactId: ref,
      time,
    })
    .strict(),
  z
    .object({
      op: z.literal("addCameraShot"),
      sceneId: ref,
      shot: projectSchema.shape.scenes.element.shape.shots.unwrap().element,
    })
    .strict(),
]);
export const authoringBatchSchema = z
  .object({
    label: z.string().min(1).max(160),
    expectedRevision: z.number().int().nonnegative(),
    dryRun: z.boolean().default(false),
    commands: z.array(authoringCommandSchema).min(1).max(500),
    view: z
      .object({ sceneId: ref, layerId: ref.optional(), time: time.optional() })
      .strict()
      .optional(),
  })
  .strict();
export type AuthoringBatch = z.infer<typeof authoringBatchSchema>;
export function applyAuthoring(source: Project, input: unknown) {
  const batch = authoringBatchSchema.parse(input),
    p = structuredClone(source),
    changes: string[] = [];
  const sceneFor = (id: string) => {
    const s = p.scenes.find((s) => s.id === id);
    if (!s) throw new Error(`Scene not found: ${id}`);
    return s;
  };
  const actorFor = (id: string) => {
    for (const scene of p.scenes) {
      const layer = scene.layers.find((l) => l.id === id);
      if (layer) {
        if (layer.locked) throw new Error(`Layer is locked: ${layer.name}`);
        return { scene, layer };
      }
    }
    throw new Error(`Layer not found: ${id}`);
  };
  const checkTime = (l: Layer, t: number) => {
    if (t > l.duration)
      throw new Error(`Time exceeds layer duration: ${l.name}`);
  };
  const image = (id: string) => {
    if (!p.assets.some((a) => a.id === id && a.type === "image"))
      throw new Error(`Image asset not found: ${id}`);
  };
  for (const [i, c] of batch.commands.entries()) {
    try {
      if (c.op === "createScene") {
        if (p.scenes.some((s) => s.id === c.id))
          throw new Error("Scene ID already exists");
        if (c.start + c.duration > p.settings.durationSec)
          throw new Error("Scene exceeds project duration");
        p.scenes.push({
          id: c.id,
          name: c.name,
          start: c.start,
          duration: c.duration,
          layers: [],
          shots: [],
        });
      } else if (c.op === "createLayer") {
        const scene = sceneFor(c.sceneId);
        if (p.scenes.some((s) => s.layers.some((l) => l.id === c.id)))
          throw new Error("Layer ID already exists");
        const l = makeLayer(c.type, p);
        l.id = c.id;
        l.name = c.name;
        l.duration = scene.duration;
        if (c.type === "rig") {
          const template = p.rigTemplates.find((t) => t.id === c.templateId);
          if (!template) throw new Error("Choose a saved rig template");
          l.props = structuredClone(template.props);
          l.props.rigConstraints = [];
          l.props.rigDrawings = [];
          for (const assetId of Object.values(l.props.rigAssets))
            image(assetId);
        } else if (c.type === "image" || c.type === "audio") {
          const a = p.assets.find(
            (a) => a.id === c.assetId && a.type === c.type,
          );
          if (!a) throw new Error(`Choose an imported ${c.type} asset`);
          l.props.assetId = a.id;
          if (c.type === "audio")
            l.duration = Math.min(
              scene.duration,
              a.durationSec || scene.duration,
            );
        } else if (c.assetId || c.templateId)
          throw new Error(
            "Artwork references only apply to image, audio or rig layers",
          );
        scene.layers.push(l);
      } else if (c.op === "addCameraShot") {
        const scene = sceneFor(c.sceneId);
        if (scene.shots.some((s) => s.id === c.shot.id))
          throw new Error("Shot ID already exists");
        if (c.shot.start + c.shot.duration > scene.duration)
          throw new Error("Shot exceeds scene duration");
        scene.shots.push(c.shot);
      } else {
        const { scene, layer: l } = actorFor(c.layerId);
        if (c.op === "setTransform") {
          Object.assign(l, c.values);
          if (l.start + l.duration > scene.duration)
            throw new Error("Layer exceeds scene duration");
        } else if (c.op === "setKeyframe") {
          checkTime(l, c.time);
          const numeric = properties.includes(
            c.property as (typeof properties)[number],
          );
          if (numeric !== (typeof c.value === "number"))
            throw new Error("Keyframe value has the wrong type");
          if (c.property === "assetId") {
            const a = p.assets.find((a) => a.id === c.value);
            if (!a || a.type !== l.type)
              throw new Error("Keyframe artwork is missing or incompatible");
          }
          const keys = l.keyframes[c.property] || [];
          const key = keys.find((k) => Math.abs(k.time - c.time) < 0.0001);
          if (key) Object.assign(key, { value: c.value, easing: c.easing });
          else keys.push({ time: c.time, value: c.value, easing: c.easing });
          l.keyframes[c.property] = keys;
          layerSchema.parse(layerAt(l, c.time));
        } else if (c.op === "generateLipSync") {
          bakeLipSync(p, l.id, c.input);
        } else if (c.op === "addBlink") {
          if (!["rig", "image"].includes(l.type))
            throw new Error("A blink needs a character");
          recordBlink(l, c.time);
        } else {
          if (l.type !== "rig")
            throw new Error("This command needs a rig character");
          if (c.op === "setFollowThrough") {
            Object.assign(l.props.followThrough, c.values);
          } else if (c.op === "bakeFollowThrough") {
            Object.assign(l, bakeFollowThrough(l, p.settings.fps));
          } else if (c.op === "setPose") {
            checkTime(l, c.time);
            const resolved = evaluateRigScene(
              scene,
              scene.start + l.start + c.time,
            );
            const pose = resolved.poses.get(l.id);
            if (!pose) throw new Error("Cannot resolve character pose");
            recordPose(l, c.time, {
              ...poseValues(resolved.layers.get(l.id)!, pose),
              ...c.values,
            });
          } else if (c.op === "setDrawing") {
            image(c.assetId);
            if (!(c.slot in l.props.rigAssets))
              throw new Error("Unknown drawing slot");
            if (c.time !== undefined) {
              checkTime(l, c.time);
              const key = {
                time: c.time,
                slot: c.slot,
                assetId: c.assetId,
                registration: c.registration,
                crop: c.crop || null,
              };
              const old = l.props.rigDrawings.find(
                (k) => k.slot === c.slot && Math.abs(k.time - c.time!) < 0.0001,
              );
              if (old) Object.assign(old, key);
              else l.props.rigDrawings.push(key);
            } else {
              l.props.rigAssets[c.slot] = c.assetId;
              l.props.rigRegistration[c.slot] = c.registration;
              if (c.crop) l.props.rigCrops[c.slot] = c.crop;
              else delete l.props.rigCrops[c.slot];
            }
          } else if (c.op === "addContact") {
            if (l.props.rigConstraints.some((k) => k.id === c.contact.id))
              throw new Error("Contact ID already exists");
            checkTime(l, c.contact.end);
            if (c.contact.kind !== "pin") {
              const target = scene.layers.find(
                (q) => q.id === c.contact.targetLayerId,
              );
              if (
                !target ||
                !["image", "shape"].includes(target.type) ||
                target.locked
              )
                throw new Error(
                  "Contact target must be an unlocked prop in this scene",
                );
            }
            l.props.rigConstraints.push(c.contact);
          } else if (c.op === "releaseContact") {
            const contact = l.props.rigConstraints.find(
              (k) => k.id === c.contactId,
            );
            if (!contact) throw new Error("Contact not found");
            if (c.time <= contact.start || c.time > contact.end)
              throw new Error("Release time must be inside the contact");
            if (contact.kind === "carry") {
              const held = evaluateRigScene(
                scene,
                scene.start + l.start + c.time - 0.00001,
              ).layers.get(contact.targetLayerId);
              const prop = scene.layers.find(
                (q) => q.id === contact.targetLayerId,
              );
              if (!held || !prop) throw new Error("Carried prop is missing");
              if (prop.locked) throw new Error("Carried prop is locked");
              const beginTime = l.start + contact.start - prop.start,
                endTime = l.start + c.time - prop.start;
              const begin = layerAt(prop, Math.max(0, beginTime));
              for (const key of ["x", "y", "rotation"] as const) {
                if (!prop.keyframes[key]?.length)
                  putKey(prop, key, 0, prop[key], "linear");
                putKey(prop, key, Math.max(0, beginTime), begin[key], "linear");
                putKey(prop, key, Math.max(0, endTime), held[key], "linear");
              }
            }
            contact.end = c.time;
          }
        }
      }
      changes.push(c.op);
    } catch (e) {
      throw new Error(`Command ${i + 1} (${c.op}): ${(e as Error).message}`);
    }
  }
  const project = projectSchema.parse(p);
  if (batch.view) {
    const s = sceneFor(batch.view.sceneId);
    if (
      batch.view.layerId &&
      !s.layers.some((l) => l.id === batch.view!.layerId)
    )
      throw new Error("Focus layer is not in the focus scene");
    if (
      batch.view.time !== undefined &&
      batch.view.time >= p.settings.durationSec
    )
      throw new Error("Focus time exceeds project duration");
  }
  const warnings = [
    ...new Set(
      project.scenes.flatMap((s) => evaluateRigScene(s, s.start).warnings),
    ),
  ];
  return { project, changes, warnings, batch };
}
