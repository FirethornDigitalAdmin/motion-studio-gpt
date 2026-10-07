import { id, makeLayer, type Layer, type Project } from "./model";
import artworkIndex from "../assets/louis-animation-pack/parts/index.json";
export const allSlots = Object.keys(artworkIndex);
export function parentForSlot(slot: string) {
  if (slotParents[slot]) return slotParents[slot];
  if (slot.startsWith("hand_R")) return "forearm_R";
  if (slot.startsWith("hand_L")) return "forearm_L";
  if (slot.startsWith("prop_")) return "hand_R";
  if (
    slot.startsWith("eye") ||
    slot.startsWith("mouth") ||
    slot === "brow" ||
    slot === "pupil"
  )
    return "head";
  return "root";
}
export const coreSlots = [
  "head",
  "torso",
  "pelvis",
  "neck",
  "upper_arm_R",
  "forearm_R",
  "upper_arm_L",
  "forearm_L",
  "thigh_R",
  "shin_R",
  "thigh_L",
  "shin_L",
  "foot_R",
  "foot_L",
  "hand_R_relaxed",
  "hand_L_relaxed",
];
export const slotParents: Record<string, string> = {
  head: "neck",
  neck: "torso",
  torso: "pelvis",
  upper_arm_R: "torso",
  forearm_R: "upper_arm_R",
  hand_R_relaxed: "forearm_R",
  upper_arm_L: "torso",
  forearm_L: "upper_arm_L",
  hand_L_relaxed: "forearm_L",
  thigh_R: "pelvis",
  shin_R: "thigh_R",
  foot_R: "shin_R",
  thigh_L: "pelvis",
  shin_L: "thigh_L",
  foot_L: "shin_L",
};
export function rigIssues(layer: Layer, project: Project) {
  const images = new Set(
    project.assets.filter((a) => a.type === "image").map((a) => a.id),
  );
  return coreSlots
    .filter((slot) => !images.has(layer.props.rigAssets[slot]))
    .map((slot) => `Assign ${slot.replaceAll("_", " ")}`);
}
export function commitRig(
  draft: Layer,
  project: Project,
  sceneId: string,
  targetId?: string,
  saveTemplate = true,
) {
  const issues = rigIssues(draft, project);
  if (issues.length) throw new Error(issues[0]);
  let scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) {
    scene = {
      id: sceneId,
      name: "Scene 1",
      start: 0,
      duration: project.settings.durationSec,
      shots: [],
      layers: [],
    };
    project.scenes.push(scene);
  }
  const target = scene.layers.find(
    (l) => l.id === targetId && l.type === "rig",
  );
  const config = structuredClone(draft.props);
  config.rigDrawings = [];
  config.rigConstraints = [];
  if (target) {
    target.name = draft.name;
    for (const key of [
      "rigAssets",
      "rigRegistration",
      "rigCrops",
      "rigVersion",
      "rigDimensions",
      "upperArmLength",
      "forearmLength",
      "thighLength",
      "shinLength",
    ] as const)
      Object.assign(target.props, { [key]: config[key] });
  }
  const placed = target || makeLayer("rig", project);
  if (!target) {
    placed.name = draft.name;
    placed.props = config;
    placed.props.width = 1536;
    placed.props.height = 1408;
    placed.scale =
      Math.min(project.settings.width / 1536, project.settings.height / 1408) *
      0.8;
    placed.duration = scene.duration;
    scene.layers.push(placed);
  }
  if (saveTemplate) {
    const existing = project.rigTemplates.find((t) => t.name === draft.name);
    if (existing) existing.props = config;
    else
      project.rigTemplates.push({ id: id(), name: draft.name, props: config });
  }
  return placed.id;
}
