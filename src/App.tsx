import { useEffect, useRef, useState } from "react";
import { activeScene, useStore } from "./store";
import { emptyProject, id, projectSchema, type Project } from "./model";
import { loadResources } from "./renderer";
import Preview from "./Preview";
import MotionWorkspace from "./MotionWorkspace";
import Properties from "./Properties";
import { Field } from "./Controls";
import { AudioPlayer } from "./audio";
import characterCatalog from "../assets/louis-animation-pack/production/catalog.json";
import RigBuilder from "./RigBuilder";
import AuthoringPanel from "./AuthoringPanel";
import { startAuthoringBridge } from "./authoringBridge";
export async function api(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body instanceof FormData
      ? { method: "POST", body }
      : body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
  );
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || "Request failed");
  return json;
}
export default function App() {
  const s = useStore(),
    scene = activeScene(s);
  const [tab, setTab] = useState("layers"),
    [modal, setModal] = useState<string | null>(null),
    [folders, setFolders] = useState<string[]>([]),
    [projectName, setProjectName] = useState("Untitled"),
    [saveName, setSaveName] = useState("Untitled"),
    [job, setJob] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [dragOver, setDragOver] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    zipInput = useRef<HTMLInputElement>(null),
    relinkInput = useRef<HTMLInputElement>(null);
  const relink = useRef<string | null>(null);
  const authoringBlocked = useRef(false);
  authoringBlocked.current = busy || (modal !== null && modal !== "authoring");
  useEffect(() => startAuthoringBridge(() => authoringBlocked.current), []);
  const dirty = JSON.stringify(s.project) !== s.saved;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      useStore.setState({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void loadResources(
      s.project,
      (p) =>
        "/api/asset?" +
        new URLSearchParams({ path: p, folder: s.folder || "" }),
    ).then((r) => {
      if (alive)
        useStore.setState({
          resources: r.images,
          audioBuffers: r.audio,
          missing: r.missing,
        });
    });
    return () => {
      alive = false;
    };
  }, [JSON.stringify(s.project.assets), s.folder]);
  useEffect(() => {
    const player = new AudioPlayer();
    const sync = () => {
      const state = useStore.getState();
      player.sync(state.project, state.audioBuffers, state.time, state.playing);
    };
    const unsubscribe = useStore.subscribe(sync);
    return () => {
      unsubscribe();
      player.dispose();
    };
  }, []);
  useEffect(() => {
    document.title = `${dirty ? "● " : ""}${s.project.name} — Motion Studio`;
    const close = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", close);
    return () => window.removeEventListener("beforeunload", close);
  }, [dirty, s.project.name]);
  useEffect(() => {
    if (!s.playing) return;
    const start = performance.now(),
      initial = s.time;
    let frame = 0;
    const tick = (now: number) => {
      const st = useStore.getState(),
        end = st.project.settings.durationSec;
      let time = initial + (now - start) / 1000;
      if (time >= end) {
        if (st.loop) time %= end;
        else {
          useStore.setState({
            playing: false,
            time: Math.max(0, end - 1 / st.project.settings.fps),
          });
          return;
        }
      }
      useStore.setState({ time });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [s.playing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable]",
      );
      const st = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        st.end();
        e.shiftKey ? st.redo() : st.undo();
        if (typing) st.begin();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        st.end();
        setSaveName(st.project.name);
        setModal("save");
      } else if (typing) return;
      else if (e.code === "Space") {
        e.preventDefault();
        useStore.setState({ playing: !st.playing });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        useStore.setState({ playing: false });
        st.setTime(
          st.time + (e.key === "ArrowRight" ? 1 : -1) / st.project.settings.fps,
        );
      } else if (e.key === "Delete" || e.key === "Backspace") {
        st.edit((p) =>
          p.scenes.forEach(
            (sc) =>
              (sc.layers = sc.layers.filter(
                (l) => !st.selected.includes(l.id) || l.locked,
              )),
          ),
        );
        st.select([]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!job?.id || job.status !== "rendering") return;
    const timer = setInterval(
      () =>
        void api("/api/export/" + job.id)
          .then((j) => setJob({ ...j, id: job.id }))
          .catch((e) => useStore.setState({ error: e.message })),
      500,
    );
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  const confirmDiscard = () =>
    !dirty || window.confirm("Discard unsaved changes to this project?");
  const importFiles = (files: File[]) =>
    run(async () => {
      const form = new FormData();
      if (s.folder) form.append("folder", s.folder);
      files.forEach((f) => form.append("files", f));
      const assets = await api("/api/import", form);
      s.edit((p) => p.assets.push(...assets));
      setTab("assets");
      setNotice(
        `Imported ${assets.length} asset${assets.length === 1 ? "" : "s"}`,
      );
    });
  const placeLibrary = (item: string, update = false) =>
    run(async () => {
      const isRig = item === "louis" || item === "louis-clean";
      const entry = await api("/api/character-library", {
        item,
        folder: s.folder,
      });
      s.begin();
      s.edit((p) => {
        for (const a of entry.assets) {
          const old = p.assets.find((existing) => existing.id === a.id);
          if (old) Object.assign(old, a);
          else p.assets.push(a);
        }
      });
      if (!update)
        s.add(
          isRig ? "rig" : "image",
          isRig ? undefined : entry.assets[0].id,
          entry.width,
          entry.height,
        );
      const current = useStore.getState();
      current.edit((p) => {
        const l = p.scenes
          .flatMap((sc) => sc.layers)
          .find((l) => l.id === current.selected[0])!;
        l.name = entry.name;
        l.props.width = entry.width;
        l.props.height = entry.height;
        if (isRig) {
          l.props.rigAssets = entry.slots;
          l.props.rigCrops = entry.crops;
          l.props.rigVersion = entry.rigVersion;
        }
      });
      s.end();
      setTab("layers");
      setModal(null);
      setNotice("Added " + entry.name);
    });
  const save = async () => {
    const st = useStore.getState();
    const p = { ...st.project, name: saveName || "Untitled" };
    const folder = p.name.replace(/[^\w .-]/g, "").slice(0, 100) + ".motion";
    const existing = await api("/api/projects");
    if (
      folder !== st.folder &&
      existing.includes(folder) &&
      !window.confirm(`Overwrite ${folder}?`)
    )
      throw new Error("Save cancelled. Choose a different project name.");
    const result = await api("/api/save", {
      project: p,
      folder,
      sourceFolder: st.folder,
    });
    st.edit((project) => (project.name = p.name));
    useStore.setState({
      folder: result.folder,
      saved: JSON.stringify(p),
    });
    setModal(null);
    setNotice("Project saved locally");
    return result.folder;
  };
  const openDialog = () =>
    run(async () => {
      setFolders(await api("/api/projects"));
      setModal("open");
    });
  const changeOrder = (list: any[], i: number, d: number) => {
    const j = i + d;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  };
  return (
    <div
      className={"app" + (s.motionTab !== "timeline" ? " motion-open" : "")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length)
          void importFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            m<span>↗</span>
          </div>
          <strong>
            motion<span>studio</span>
          </strong>
          <span className="local-badge">
            <i /> LOCAL
          </span>
        </div>
        <div className="document-title">
          <span className="dirty-dot">{dirty ? "●" : "◇"}</span>
          {s.project.name}
          <span className="project-type">.motion</span>
        </div>
        <div className="header-actions">
          <button
            title="Start a new empty project"
            onClick={() => {
              if (confirmDiscard()) {
                s.open(emptyProject(), null);
                setJob(null);
              }
            }}
          >
            New
          </button>
          <button onClick={openDialog}>Open</button>
          <button
            aria-label="Save project"
            disabled={busy}
            onClick={() => {
              setSaveName(s.project.name);
              setModal("save");
            }}
          >
            Save
          </button>
          <button
            className="primary export-btn"
            disabled={busy}
            onClick={() => setModal("export")}
          >
            <span>↑</span> Export MP4
          </button>
        </div>
      </header>
      <nav className="workbar">
        <div className="creation-tools">
          <button
            onClick={() =>
              useStore.setState({ motionTab: "curves", playing: false })
            }
            title="Edit motion curves, compare poses and inspect motion diagnostics"
          >
            Motion tools
          </button>
          <button
            onClick={() => setModal("authoring")}
            title="Validated scene commands, dry runs and batch history"
          >
            Authoring API
          </button>
          <button
            onClick={() => {
              useStore.setState({ playing: false });
              setModal("rig-builder");
            }}
            title="Build a connected character from separate artwork"
          >
            Rig builder
          </button>
          <button
            title="Build with your character rig and reusable scene assets"
            onClick={() => setModal("library")}
          >
            <span>♙</span>Character library
          </button>
          <button
            title="Add a text layer to the selected scene"
            onClick={() => s.add("text")}
          >
            <span>T</span>Text
          </button>
          <button
            title="Add a rectangle; change its type in Inspector"
            onClick={() => s.add("shape")}
          >
            <span>□</span>Shape
          </button>
          <button
            title="Import original images, fonts or audio files"
            onClick={() => input.current?.click()}
          >
            <span>▧</span>Import
          </button>
          <button
            title="Add a cursor with an editable path and click ripples"
            aria-label="Add cursor"
            onClick={() => s.add("cursor")}
          >
            <span>↖</span>Cursor
          </button>
        </div>
        <div className="undo-tools">
          <button
            aria-label="Undo"
            title="Undo (Ctrl Z)"
            disabled={!s.past.length}
            onClick={s.undo}
          >
            ↶
          </button>
          <button
            aria-label="Redo"
            title="Redo (Ctrl Shift Z)"
            disabled={!s.future.length}
            onClick={s.redo}
          >
            ↷
          </button>
          <span className="divider" />
          <button onClick={() => setModal("settings")}>
            ⚙ <span>Project settings</span>
          </button>
        </div>
      </nav>
      <main className="workspace">
        <aside className="left-panel">
          <div className="tabs">
            <button
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              Layers
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => setTab("assets")}
            >
              Assets <span>{s.project.assets.length}</span>
            </button>
          </div>
          {tab === "layers" ? (
            <>
              <div className="panel-heading">
                <span>SCENES</span>
                <button
                  aria-label="Add scene"
                  title="Create a new empty scene"
                  onClick={s.addScene}
                >
                  +
                </button>
              </div>
              <div className="scene-list">
                {s.project.scenes.map((sc, i) => (
                  <div
                    className={
                      "scene-item " + (scene?.id === sc.id ? "active" : "")
                    }
                    key={sc.id}
                  >
                    <button
                      className="scene-select"
                      onClick={() => {
                        s.select([], sc.id);
                        s.setTime(sc.start);
                      }}
                    >
                      <span className="scene-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        {sc.name}
                        <small>{sc.duration.toFixed(1)}s</small>
                      </span>
                    </button>
                    <details className="item-menu">
                      <summary title="Scene actions">···</summary>
                      <div>
                        <button
                          onClick={() => {
                            const name = prompt("Scene name", sc.name);
                            if (name)
                              s.edit(
                                (p) =>
                                  (p.scenes.find((x) => x.id === sc.id)!.name =
                                    name),
                              );
                          }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={() =>
                            s.edit((p) => {
                              const dup = structuredClone(sc);
                              dup.id = id();
                              dup.name += " copy";
                              dup.layers.forEach((l) => (l.id = id()));
                              p.scenes.splice(i + 1, 0, dup);
                            })
                          }
                        >
                          Duplicate
                        </button>
                        <button
                          disabled={i === 0}
                          onClick={() =>
                            s.edit((p) => changeOrder(p.scenes, i, -1))
                          }
                        >
                          Move up
                        </button>
                        <button
                          disabled={i === s.project.scenes.length - 1}
                          onClick={() =>
                            s.edit((p) => changeOrder(p.scenes, i, 1))
                          }
                        >
                          Move down
                        </button>
                        <button
                          className="danger"
                          onClick={() => {
                            s.edit(
                              (p) =>
                                (p.scenes = p.scenes.filter(
                                  (x) => x.id !== sc.id,
                                )),
                            );
                            s.select([]);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
              <div className="panel-heading layers-heading">
                <span>{scene ? "LAYERS" : "YOUR WORKSPACE"}</span>
                <span className="tag">{scene?.layers.length || 0}</span>
              </div>
              <div className="layer-list">
                {scene &&
                  [...scene.layers].reverse().map((l, ri) => {
                    const i = scene.layers.length - 1 - ri;
                    return (
                      <div
                        className={
                          "layer-item " +
                          (s.selected.includes(l.id) ? "active" : "")
                        }
                        key={l.id}
                        draggable={!l.locked}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("layer", l.id)
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          const source = e.dataTransfer.getData("layer");
                          s.edit((p) => {
                            const sc = p.scenes.find((x) => x.id === scene.id)!;
                            const index = sc.layers.findIndex(
                              (x) => x.id === source,
                            );
                            if (index < 0) return;
                            const [moving] = sc.layers.splice(index, 1);
                            sc.layers.splice(i, 0, moving);
                          });
                        }}
                      >
                        <button
                          className="layer-select"
                          onClick={(e) =>
                            s.select(
                              e.shiftKey
                                ? s.selected.includes(l.id)
                                  ? s.selected.filter((x) => x !== l.id)
                                  : [...s.selected, l.id]
                                : [l.id],
                              scene.id,
                            )
                          }
                        >
                          <span className="type-symbol">
                            {l.type === "text"
                              ? "T"
                              : l.type === "image"
                                ? "▧"
                                : l.type === "audio"
                                  ? "♫"
                                  : l.type === "cursor"
                                    ? "↖"
                                    : "□"}
                          </span>
                          <span>{l.name}</span>
                        </button>
                        <button
                          className="small-icon"
                          aria-label={`Toggle visibility ${l.name}`}
                          title={l.visible ? "Hide layer" : "Show layer"}
                          onClick={() =>
                            s.edit((p) => {
                              const target = p.scenes
                                .find((x) => x.id === scene.id)!
                                .layers.find((x) => x.id === l.id)!;
                              target.visible = !target.visible;
                            })
                          }
                        >
                          {l.visible ? "◉" : "○"}
                        </button>
                        <button
                          className="small-icon"
                          aria-label={`Toggle lock ${l.name}`}
                          title={l.locked ? "Unlock layer" : "Lock layer"}
                          onClick={() =>
                            s.edit((p) => {
                              const target = p.scenes
                                .find((x) => x.id === scene.id)!
                                .layers.find((x) => x.id === l.id)!;
                              target.locked = !target.locked;
                            })
                          }
                        >
                          {l.locked ? "▣" : "⌑"}
                        </button>
                        <details className="item-menu">
                          <summary title="Layer actions">···</summary>
                          <div>
                            <button
                              disabled={l.locked}
                              onClick={() => {
                                const name = prompt("Layer name", l.name);
                                if (name)
                                  s.edit(
                                    (p) =>
                                      (p.scenes
                                        .find((x) => x.id === scene.id)!
                                        .layers.find(
                                          (x) => x.id === l.id,
                                        )!.name = name),
                                  );
                              }}
                            >
                              Rename
                            </button>
                            <button
                              onClick={() =>
                                s.edit((p) => {
                                  const dup = structuredClone(l);
                                  dup.id = id();
                                  dup.name += " copy";
                                  dup.locked = false;
                                  p.scenes
                                    .find((x) => x.id === scene.id)!
                                    .layers.splice(i + 1, 0, dup);
                                })
                              }
                            >
                              Duplicate
                            </button>
                            <button
                              disabled={
                                l.locked || i === scene.layers.length - 1
                              }
                              onClick={() =>
                                s.edit((p) =>
                                  changeOrder(
                                    p.scenes.find((x) => x.id === scene.id)!
                                      .layers,
                                    i,
                                    1,
                                  ),
                                )
                              }
                            >
                              Bring forward
                            </button>
                            <button
                              disabled={l.locked || i === 0}
                              onClick={() =>
                                s.edit((p) =>
                                  changeOrder(
                                    p.scenes.find((x) => x.id === scene.id)!
                                      .layers,
                                    i,
                                    -1,
                                  ),
                                )
                              }
                            >
                              Send back
                            </button>
                            <button
                              disabled={l.locked}
                              className="danger"
                              onClick={() =>
                                s.edit((p) => {
                                  const sc = p.scenes.find(
                                    (x) => x.id === scene.id,
                                  )!;
                                  sc.layers = sc.layers.filter(
                                    (x) => x.id !== l.id,
                                  );
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </details>
                      </div>
                    );
                  })}
                {!scene?.layers.length && (
                  <div className="panel-empty">
                    <span className="empty-outline">▱</span>
                    <p>Room for your ideas.</p>
                    <small>
                      Your layers will appear here.
                      <br />
                      Add something from the toolbar.
                    </small>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="asset-panel">
              <button
                className="import-card"
                onClick={() => input.current?.click()}
              >
                <span>＋</span>
                <strong>Bring something in</strong>
                <small>Images, fonts & audio · or drop files here</small>
              </button>
              {s.project.assets.map((a) => (
                <div className="asset-item" key={a.id}>
                  {a.type === "image" ? (
                    <div className="asset-thumb">
                      {s.missing.includes(a.id) ? (
                        "▧"
                      ) : (
                        <img
                          src={
                            "/api/asset?" +
                            new URLSearchParams({
                              path: a.relativePath,
                              folder: s.folder || "",
                            })
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div className="asset-thumb">
                      {a.type === "audio" ? "♫" : "Aa"}
                    </div>
                  )}
                  <div>
                    <strong>{a.originalName}</strong>
                    <small>
                      {a.type}
                      {s.missing.includes(a.id) ? " · missing" : ""}
                    </small>
                  </div>
                  {s.missing.includes(a.id) ? (
                    <button
                      onClick={() => {
                        relink.current = a.id;
                        relinkInput.current?.click();
                      }}
                    >
                      Relink
                    </button>
                  ) : a.type === "image" ? (
                    <button
                      title="Place this image into the selected scene"
                      aria-label={`Place ${a.originalName}`}
                      onClick={() => {
                        const im = s.resources.get(a.id) as HTMLImageElement;
                        let w = im?.naturalWidth || im?.width || 800,
                          h = im?.naturalHeight || im?.height || 600;
                        const fit = Math.min(
                          1,
                          (s.project.settings.width * 0.7) / w,
                          (s.project.settings.height * 0.7) / h,
                        );
                        s.add("image", a.id, w * fit, h * fit);
                      }}
                    >
                      +
                    </button>
                  ) : a.type === "audio" ? (
                    <button
                      title="Place audio on the timeline"
                      aria-label={`Place ${a.originalName}`}
                      onClick={() => s.add("audio", a.id)}
                    >
                      +
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="left-footer">
            <span className="offline-dot" /> Offline by design <span>v1.0</span>
          </div>
        </aside>
        <Preview />
        <Properties />
      </main>
      <MotionWorkspace />
      <footer className="statusbar">
        <span>
          <i /> {busy ? "Working…" : "All changes stay on this computer"}
        </span>
        <span>
          {s.folder || "Unsaved project"}
          <span className="footer-sep">|</span>
          {s.project.settings.fps} fps
        </span>
      </footer>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.svg,.ttf,.otf,.woff2,.mp3,.wav,.m4a,.ogg,.flac"
        data-testid="asset-import"
        onChange={(e) => {
          if (e.target.files) void importFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        ref={zipInput}
        accept=".zip"
        data-testid="zip-import"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && confirmDiscard())
            void run(async () => {
              const form = new FormData();
              form.append("file", file);
              const data = await api("/api/unzip", form);
              s.open(data.project, data.folder);
              setModal(null);
            });
          e.target.value = "";
        }}
      />
      <input
        ref={relinkInput}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,.svg,.ttf,.otf,.woff2"
        onChange={(e) => {
          const file = e.target.files?.[0],
            assetId = relink.current;
          if (file && assetId)
            void run(async () => {
              const form = new FormData();
              if (s.folder) form.append("folder", s.folder);
              form.append("files", file);
              const [a] = await api("/api/import", form);
              s.edit((p) => {
                const old = p.assets.find((x) => x.id === assetId)!;
                if (old.type !== a.type)
                  throw new Error("Relink must use the same asset type");
                Object.assign(old, a, { id: assetId });
              });
              const st = useStore.getState();
              const loaded = await loadResources(
                st.project,
                (path) =>
                  "/api/asset?" +
                  new URLSearchParams({ path, folder: st.folder || "" }),
              );
              useStore.setState({
                resources: loaded.images,
                audioBuffers: loaded.audio,
                missing: loaded.missing,
              });
            });
          e.target.value = "";
        }}
      />
      {dragOver && (
        <div className="drop-overlay">
          <h2>Drop images or fonts to import</h2>
          <p>Original files are preserved byte for byte.</p>
        </div>
      )}
      {s.error && (
        <div className="error-toast" role="alert">
          <strong>Something needs attention</strong>
          <p>{s.error}</p>
          <button onClick={() => useStore.setState({ error: null })}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {modal === "rig-builder" && <RigBuilder close={() => setModal(null)} />}
      {modal === "authoring" && <AuthoringPanel close={() => setModal(null)} />}
      {modal && modal !== "rig-builder" && modal !== "authoring" && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-label={
              modal === "settings"
                ? "Project settings"
                : modal === "save"
                  ? "Save project"
                  : modal === "open"
                    ? "Open project"
                    : modal === "library"
                      ? "Character library"
                      : "Export MP4"
            }
          >
            <header>
              <h2>
                {modal === "settings"
                  ? "Project settings"
                  : modal === "save"
                    ? "Save your project"
                    : modal === "open"
                      ? "Open a project"
                      : modal === "library"
                        ? "Louis character library"
                        : "Export MP4"}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal(null)}>
                ×
              </button>
            </header>
            {modal === "library" && (
              <>
                <p className="muted">
                  Your original rig parts, proper eyelids, and reusable
                  desk-to-tea assets. Add each piece to the scene, then edit its
                  timing and movement.
                </p>
                <div className="character-library">
                  {s.project.rigTemplates.map((template) => (
                    <button
                      key={template.id}
                      aria-label={"Add saved rig " + template.name}
                      onClick={() => {
                        s.begin();
                        s.add("rig");
                        const current = useStore.getState();
                        current.edit((p) => {
                          const l = p.scenes
                            .flatMap((sc) => sc.layers)
                            .find((l) => l.id === current.selected[0])!;
                          l.name = template.name;
                          l.props = structuredClone(template.props);
                          l.props.rigConstraints = [];
                          l.props.rigDrawings = [];
                          l.scale =
                            Math.min(
                              p.settings.width / 1536,
                              p.settings.height / 1408,
                            ) * 0.8;
                        });
                        s.end();
                        setModal(null);
                      }}
                    >
                      <strong>{template.name}</strong>
                      <small>Saved rig · editable artwork and joints</small>
                    </button>
                  ))}
                  {s.project.scenes
                    .flatMap((sc) => sc.layers)
                    .some(
                      (l) => l.id === s.selected[0] && l.type === "rig",
                    ) && (
                    <button
                      disabled={busy}
                      aria-label="Update selected rig"
                      onClick={() =>
                        void placeLibrary(
                          s.project.scenes
                            .flatMap((sc) => sc.layers)
                            .find((l) => l.id === s.selected[0])?.props
                            .rigVersion === 3
                            ? "louis-clean"
                            : "louis",
                          true,
                        )
                      }
                    >
                      <strong>Update selected rig</strong>
                      <small>
                        Use the improved registered artwork and joints; keep
                        this layer’s animation.
                      </small>
                    </button>
                  )}
                  {characterCatalog.map((entry) => (
                    <button
                      key={entry.id}
                      disabled={busy}
                      onClick={() => void placeLibrary(entry.id)}
                      aria-label={"Add " + entry.name}
                    >
                      <strong>{entry.name}</strong>
                      <small>{entry.description}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "settings" && (
              <>
                <p className="muted">
                  Set the canvas and playback. Your layers stay in place.
                </p>
                <div className="field-grid">
                  <Field
                    label="Project duration"
                    title="Total length in seconds"
                    min={0.1}
                    max={3600}
                    step={0.1}
                    value={s.project.settings.durationSec}
                    onChange={(n) =>
                      s.edit((p) => (p.settings.durationSec = n))
                    }
                  />
                  <Field
                    label="Frame rate"
                    min={1}
                    max={120}
                    value={s.project.settings.fps}
                    onChange={(n) =>
                      s.edit((p) => (p.settings.fps = Math.round(n)))
                    }
                  />
                </div>
                <label className="field">
                  <span>Aspect ratio</span>
                  <select
                    aria-label="Aspect ratio"
                    value={s.project.settings.aspect}
                    onChange={(e) =>
                      s.edit((p) => {
                        const aspect = e.target
                          .value as Project["settings"]["aspect"];
                        p.settings.aspect = aspect;
                        if (aspect !== "custom") {
                          const [x, y] = aspect.split(":").map(Number);
                          p.settings.height =
                            Math.round((p.settings.width * y) / x / 2) * 2;
                        }
                      })
                    }
                  >
                    <option>16:9</option>
                    <option>9:16</option>
                    <option>1:1</option>
                    <option>4:5</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <div className="field-grid">
                  <Field
                    label="Canvas width"
                    title="Output width in pixels"
                    min={16}
                    max={7680}
                    value={s.project.settings.width}
                    onChange={(n) =>
                      s.edit((p) => {
                        p.settings.width = Math.round(n);
                        p.settings.aspect = "custom";
                      })
                    }
                  />
                  <Field
                    label="Canvas height"
                    title="Output height in pixels"
                    min={16}
                    max={7680}
                    value={s.project.settings.height}
                    onChange={(n) =>
                      s.edit((p) => {
                        p.settings.height = Math.round(n);
                        p.settings.aspect = "custom";
                      })
                    }
                  />
                </div>
                <div className="resolution-buttons">
                  <button
                    onClick={() =>
                      s.edit((p) => {
                        p.settings.width = 1920;
                        p.settings.height = 1080;
                        p.settings.aspect = "16:9";
                      })
                    }
                  >
                    1080p
                  </button>
                  <button
                    onClick={() =>
                      s.edit((p) => {
                        p.settings.width = 3840;
                        p.settings.height = 2160;
                        p.settings.aspect = "16:9";
                      })
                    }
                  >
                    4K
                  </button>
                  <button
                    onClick={() =>
                      s.edit((p) => {
                        p.settings.width = 1080;
                        p.settings.height = 1920;
                        p.settings.aspect = "9:16";
                      })
                    }
                  >
                    Portrait
                  </button>
                </div>
                <label className="color-field">
                  <span>Background</span>
                  <input
                    type="color"
                    aria-label="Background colour"
                    value={s.project.settings.background}
                    onFocus={s.begin}
                    onBlur={s.end}
                    onChange={(e) =>
                      s.edit((p) => (p.settings.background = e.target.value))
                    }
                  />
                  <code>{s.project.settings.background}</code>
                </label>
                <button className="primary wide" onClick={() => setModal(null)}>
                  Done
                </button>
              </>
            )}
            {modal === "save" && (
              <>
                <p className="muted">
                  A project.json file and original assets, in one local folder.
                </p>
                <label className="field">
                  <span>Project name</span>
                  <input
                    aria-label="Project name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                </label>
                <p className="save-location">
                  projects / {saveName.replace(/[^\w .-]/g, "")}.motion /
                </p>
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        saveName !== s.project.name &&
                        folders.includes(saveName + ".motion") &&
                        !confirm("Overwrite this existing project?")
                      )
                        return;
                      await save();
                    })
                  }
                >
                  Save project
                </button>
                <button
                  className="wide"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const folder = await save();
                      const a = document.createElement("a");
                      a.href = "/api/zip?" + new URLSearchParams({ folder });
                      a.click();
                    })
                  }
                >
                  Save & download project zip
                </button>
              </>
            )}
            {modal === "open" && (
              <>
                <p className="muted">Projects saved on this computer.</p>
                <div className="open-list">
                  {folders.length ? (
                    folders.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => {
                          if (confirmDiscard())
                            void run(async () => {
                              const project = await api(
                                "/api/project?" +
                                  new URLSearchParams({ folder }),
                              );
                              s.open(project, folder);
                              setModal(null);
                              setJob(null);
                            });
                        }}
                      >
                        ▱ <strong>{folder}</strong> →
                      </button>
                    ))
                  ) : (
                    <p>No saved projects yet.</p>
                  )}
                </div>
                <button
                  className="wide"
                  onClick={() => zipInput.current?.click()}
                >
                  Import project zip
                </button>
              </>
            )}
            {modal === "export" && (
              <>
                <p className="muted">
                  {s.project.settings.width} × {s.project.settings.height} ·{" "}
                  {s.project.settings.fps} fps ·{" "}
                  {s.project.settings.durationSec}s
                </p>
                <div className="export-summary">
                  <span>MP4 · H.264</span>
                  <span>High quality · CRF 16</span>
                  <small>Frames render at full canvas resolution.</small>
                </div>
                {job ? (
                  <div className="job-progress">
                    <progress value={job.progress} max={1} />
                    <p>
                      {job.status === "rendering"
                        ? `Rendering ${Math.round(job.progress * 100)}%`
                        : job.status}
                    </p>
                    {job.error && <p className="danger">{job.error}</p>}
                    {job.status === "rendering" ? (
                      <button
                        onClick={() =>
                          void api("/api/export/" + job.id + "/cancel", {})
                        }
                      >
                        Cancel export
                      </button>
                    ) : job.status === "complete" ? (
                      <>
                        <a
                          className="primary wide download"
                          href={"/api/export/" + job.id + "/download"}
                        >
                          Download MP4
                        </a>
                        <button className="wide" onClick={() => setJob(null)}>
                          Export again
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setJob(null)}>Try again</button>
                    )}
                  </div>
                ) : (
                  <button
                    className="primary wide"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        try {
                          await api("/api/export/check");
                        } catch (e) {
                          const command = s.folder
                            ? `npm run render -- "projects/${s.folder}" "${s.project.name.replace(/[^\w -]/g, "")}.mp4"`
                            : 'Save the project first, then run: npm run render -- "projects/<name>.motion" "out.mp4"';
                          throw new Error(
                            (e as Error).message + "\n" + command,
                          );
                        }
                        if (s.missing.length)
                          throw new Error(
                            "Relink missing assets before exporting.",
                          );
                        const result = await api("/api/export", {
                          project: s.project,
                          folder: s.folder,
                        });
                        setJob({ ...result, status: "rendering", progress: 0 });
                      })
                    }
                  >
                    Start export
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
