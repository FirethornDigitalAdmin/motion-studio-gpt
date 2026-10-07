import { create } from "zustand";
import {
  emptyProject,
  id,
  makeLayer,
  projectSchema,
  type Layer,
  type Project,
  type Scene,
} from "./model";
type State = {
  project: Project;
  poseEditing: boolean;
  poseJoint: string;
  onionSkin: boolean;
  onionFrames: number;
  onionBefore: number;
  onionAfter: number;
  onionOpacity: number;
  motionTab: "timeline" | "curves" | "diagnostics";
  selected: string[];
  sceneId: string | null;
  time: number;
  playing: boolean;
  loop: boolean;
  zoom: number;
  folder: string | null;
  saved: string;
  past: Project[];
  future: Project[];
  gesture: Project | null;
  resources: Map<string, CanvasImageSource>;
  audioBuffers: Map<string, AudioBuffer>;
  missing: string[];
  error: string | null;
  edit: (f: (p: Project) => void) => void;
  begin: () => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], scene?: string) => void;
  setTime: (t: number) => void;
  open: (p: Project, folder: string | null) => void;
  add: (type: Layer["type"], assetId?: string, w?: number, h?: number) => void;
  addScene: () => void;
};
export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  poseEditing: false,
  poseJoint: "hand_R",
  onionSkin: false,
  onionFrames: 6,
  onionBefore: 1,
  onionAfter: 1,
  onionOpacity: 0.22,
  motionTab: "timeline",
  selected: [],
  sceneId: null,
  time: 0,
  playing: false,
  loop: true,
  zoom: 70,
  folder: null,
  saved: JSON.stringify(emptyProject()),
  past: [],
  future: [],
  gesture: null,
  resources: new Map(),
  audioBuffers: new Map(),
  missing: [],
  error: null,
  edit: (f) => {
    const s = get();
    const p = structuredClone(s.project);
    f(p);
    const parsed = projectSchema.safeParse(p);
    if (!parsed.success) {
      set({ error: parsed.error.issues[0].message });
      return;
    }
    if (JSON.stringify(p) === JSON.stringify(s.project)) return;
    set({
      project: parsed.data,
      time: Math.min(
        s.time,
        Math.max(
          0,
          parsed.data.settings.durationSec - 1 / parsed.data.settings.fps,
        ),
      ),
      past: s.gesture ? s.past : [...s.past.slice(-99), s.project],
      future: [],
    });
  },
  begin: () => set({ gesture: structuredClone(get().project) }),
  end: () => {
    const s = get();
    if (s.gesture && JSON.stringify(s.gesture) !== JSON.stringify(s.project))
      set({ past: [...s.past.slice(-99), s.gesture], future: [] });
    set({ gesture: null });
  },
  undo: () => {
    const s = get();
    if (s.past.length)
      set({
        project: s.past.at(-1)!,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        playing: false,
      });
  },
  redo: () => {
    const s = get();
    if (s.future.length)
      set({
        project: s.future[0],
        future: s.future.slice(1),
        past: [...s.past, s.project],
      });
  },
  select: (ids, scene) =>
    set({ selected: ids, ...(scene ? { sceneId: scene } : {}) }),
  setTime: (t) =>
    set({
      playing: false,
      time: Math.max(
        0,
        Math.min(
          get().project.settings.durationSec - 1 / get().project.settings.fps,
          t,
        ),
      ),
    }),
  open: (p, folder) => {
    const project = projectSchema.parse(p);
    set({
      project,
      folder,
      saved: JSON.stringify(project),
      past: [],
      future: [],
      selected: [],
      sceneId: project.scenes[0]?.id ?? null,
      time: 0,
      playing: false,
    });
  },
  add: (type, assetId, w, h) => {
    const s = get();
    let sceneId = s.sceneId;
    if (!s.project.scenes.some((x) => x.id === sceneId)) sceneId = id();
    let newId = "";
    s.edit((p) => {
      let scene = p.scenes.find((x) => x.id === sceneId);
      if (!scene) {
        scene = {
          id: sceneId!,
          name: "Scene 1",
          start: 0,
          duration: p.settings.durationSec,
          layers: [],
          shots: [],
        };
        p.scenes.push(scene);
      }
      const l = makeLayer(type, p);
      l.duration = scene.duration;
      if (assetId) {
        l.props.assetId = assetId;
        l.name =
          p.assets.find((a) => a.id === assetId)?.originalName || "Image";
        l.props.width = w || 800;
        l.props.height = h || 600;
        if (type === "audio")
          l.duration = Math.min(
            scene.duration,
            p.assets.find((a) => a.id === assetId)?.durationSec ||
              scene.duration,
          );
      }
      newId = l.id;
      scene.layers.push(l);
    });
    set({ selected: [newId], sceneId });
  },
  addScene: () => {
    const s = get(),
      newId = id();
    s.edit((p) => {
      const end = Math.max(0, ...p.scenes.map((s) => s.start + s.duration));
      const dur = Math.min(5, p.settings.durationSec);
      const start = Math.min(end, p.settings.durationSec - dur);
      p.scenes.push({
        id: newId,
        name: `Scene ${p.scenes.length + 1}`,
        start,
        duration: dur,
        layers: [],
        shots: [],
      });
    });
    set({ sceneId: newId, selected: [] });
  },
}));
export function activeScene(s: State): Scene | undefined {
  return (
    s.project.scenes.find((x) => x.id === s.sceneId) || s.project.scenes[0]
  );
}
export function activeLayer(s: State) {
  return s.project.scenes
    .flatMap((x) => x.layers)
    .find((l) => l.id === s.selected[0]);
}
export function editLayer(id: string, f: (l: Layer) => void) {
  useStore.getState().edit((p) => {
    const l = p.scenes.flatMap((x) => x.layers).find((l) => l.id === id);
    if (l && !l.locked) f(l);
  });
}
if (import.meta.env.DEV && typeof window !== "undefined")
  (window as any).__motion = useStore;
