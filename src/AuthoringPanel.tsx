import { useState } from "react";
import { useStore, activeScene } from "./store";
import { useAuthoringStatus, executeAuthoring } from "./authoringBridge";
import { authoringBatchSchema } from "./authoring";
export default function AuthoringPanel({ close }: { close: () => void }) {
  const s = useStore(),
    status = useAuthoringStatus(),
    scene = activeScene(s),
    actor =
      scene?.layers.find((l) => l.id === s.selected[0] && l.type === "rig") ||
      scene?.layers.find((l) => l.type === "rig");
  const [text, setText] = useState(() =>
    JSON.stringify(
      actor
        ? {
            label: "Character reaction",
            expectedRevision: status.revision,
            commands: [
              {
                op: "setPose",
                layerId: actor.id,
                time: 0,
                values: { headAngle: 0, gazeX: 0, expression: "neutral" },
              },
              {
                op: "setPose",
                layerId: actor.id,
                time: Math.min(2, actor.duration),
                values: { headAngle: 8, gazeX: 0.6, expression: "sceptical" },
              },
            ],
            view: {
              sceneId: scene!.id,
              layerId: actor.id,
              time: scene!.start + actor.start + Math.min(2, actor.duration),
            },
          }
        : {
            label: "Create a scene",
            expectedRevision: status.revision,
            commands: [
              {
                op: "createScene",
                id: "api-demo-scene",
                name: "Authored scene",
                start: 0,
                duration: Math.min(5, s.project.settings.durationSec),
              },
            ],
          },
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  const run = (dryRun: boolean) => {
    try {
      const parsed = authoringBatchSchema.parse({
        ...JSON.parse(text),
        dryRun,
      });
      const result = executeAuthoring(parsed);
      setError(result.ok ? "" : result.error || "Batch rejected");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="modal authoring-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Authoring API"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <header>
          <h2>Authoring API</h2>
          <button aria-label="Close authoring API" onClick={close}>
            ×
          </button>
        </header>
        <p className="muted">
          Build the scene through validated editor commands. Each applied batch
          is one undo step. Dry runs leave the project unchanged.
        </p>
        <div className="authoring-status">
          <strong>
            {status.connected
              ? "Connected to local API"
              : "Connecting to local API…"}
          </strong>
          <span>
            {s.project.name} · revision {status.revision}
          </span>
        </div>
        <label className="field">
          <span>Editor session ID</span>
          <input
            aria-label="Editor session ID"
            readOnly
            value={status.sessionId || ""}
          />
        </label>
        <p className="muted">
          Discover editors and command schemas at <code>/api/editor</code>.
          Submit batches to <code>/api/editor/commands</code>.
        </p>
        <label className="field">
          <span>Command batch</span>
          <textarea
            autoFocus
            aria-label="Command batch"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="authoring-actions">
          <button
            onClick={() => {
              try {
                const b = JSON.parse(text);
                b.expectedRevision = status.revision;
                setText(JSON.stringify(b, null, 2));
                setError("");
              } catch {
                setError("Enter valid JSON before refreshing its revision");
              }
            }}
          >
            Use current revision
          </button>
          <button onClick={() => run(true)}>Validate dry run</button>
          <button className="primary" onClick={() => run(false)}>
            Apply batch
          </button>
        </div>
        {error && (
          <p role="alert" className="rig-warning">
            {error}
          </p>
        )}
        <details>
          <summary>Scene reference IDs</summary>
          <pre>
            {JSON.stringify(
              {
                scenes: s.project.scenes.map((sc) => ({
                  id: sc.id,
                  name: sc.name,
                  layers: sc.layers.map((l) => ({
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    locked: l.locked,
                    duration: l.duration,
                  })),
                })),
                rigTemplates: s.project.rigTemplates.map((t) => ({
                  id: t.id,
                  name: t.name,
                })),
                assets: s.project.assets.map((a) => ({
                  id: a.id,
                  name: a.originalName,
                  type: a.type,
                })),
              },
              null,
              2,
            )}
          </pre>
        </details>
        <h3>Recent batches</h3>
        <div className="authoring-log" aria-label="Authoring history">
          {status.log.length ? (
            status.log.map((item, i) => (
              <article key={i} className={item.ok ? "" : "rig-warning"}>
                <strong>
                  {item.dryRun ? "Dry run · " : ""}
                  {item.label}
                </strong>
                <p>{item.message}</p>
                <details>
                  <summary>Inspect commands</summary>
                  <pre>{JSON.stringify(item.commands, null, 2)}</pre>
                </details>
              </article>
            ))
          ) : (
            <p className="muted">No batches yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
