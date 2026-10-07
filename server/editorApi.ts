import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { projectSchema } from "../src/model";
import { authoringBatchSchema } from "../src/authoring";
const stateSchema = z.object({
  revision: z.number().int().nonnegative(),
  project: projectSchema.optional(),
  folder: z.string().nullable(),
  sceneId: z.string().nullable(),
  selected: z.array(z.string()),
  time: z.number().nonnegative(),
  blocked: z.boolean(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});
type EditorState = z.infer<typeof stateSchema>;
type Session = { id: string; token: string; state: EditorState; seen: number };
type Job = {
  id: string;
  sessionId: string;
  batch: z.infer<typeof authoringBatchSchema>;
  status: "queued" | "delivered" | "complete" | "rejected";
  result?: unknown;
  created: number;
  signature: string;
};
export function installEditorApi(app: Express) {
  const sessions = new Map<string, Session>(),
    jobs = new Map<string, Job>();
  const live = () => {
    for (const [id, s] of sessions)
      if (Date.now() - s.seen > 30000) sessions.delete(id);
    for (const [id, j] of jobs) {
      if (Date.now() - j.created > 15 * 60 * 1000) jobs.delete(id);
      else if (
        ["queued", "delivered"].includes(j.status) &&
        Date.now() - j.created > 30000
      ) {
        j.status = "rejected";
        j.result = {
          error:
            "Editor did not confirm the command within 30 seconds. Inspect the live state before retrying.",
        };
      }
    }
  };
  const auth = (id: string, token: unknown) => {
    const s = sessions.get(id);
    if (!s || s.token !== token) throw new Error("Editor session expired");
    return s;
  };
  const safe =
    (fn: (req: any, res: any) => void) => (req: any, res: any, next: any) => {
      try {
        live();
        fn(req, res);
      } catch (e) {
        next(e);
      }
    };
  app.get(
    "/api/editor",
    safe((_req, res) =>
      res.json({
        version: 1,
        sessions: [...sessions.values()].map((s) => ({
          id: s.id,
          projectName: s.state.project?.name,
          revision: s.state.revision,
          blocked: s.state.blocked,
          folder: s.state.folder,
        })),
        capabilities: [
          "createScene",
          "createLayer",
          "setTransform",
          "setKeyframe",
          "setPose",
          "setDrawing",
          "addContact",
          "releaseContact",
          "addCameraShot",
          "generateLipSync",
          "addBlink",
          "setFollowThrough",
          "bakeFollowThrough",
        ],
        batchSchema: z.toJSONSchema(authoringBatchSchema),
      }),
    ),
  );
  app.get(
    "/api/editor/sessions/:id",
    safe((req, res) => {
      const s = sessions.get(req.params.id);
      if (!s)
        return res
          .status(404)
          .json({ error: "Editor session is not connected" });
      res.json(s.state);
    }),
  );
  app.post(
    "/api/editor/sessions",
    safe((req, res) => {
      const state = stateSchema.parse(req.body);
      if (!state.project)
        throw new Error("An editor must supply its current project");
      const s = {
        id: randomUUID(),
        token: randomUUID(),
        state,
        seen: Date.now(),
      };
      sessions.set(s.id, s);
      res.json({ id: s.id, token: s.token });
    }),
  );
  app.post(
    "/api/editor/sessions/:id/poll",
    safe((req, res) => {
      const s = auth(req.params.id, req.body.token),
        state = stateSchema.parse(req.body.state);
      if (state.revision < s.state.revision)
        throw new Error("Outdated editor heartbeat");
      s.state = { ...state, project: state.project || s.state.project };
      s.seen = Date.now();
      const pending = [...jobs.values()].filter(
        (j) => j.sessionId === s.id && j.status === "queued",
      );
      pending.forEach((j) => (j.status = "delivered"));
      res.json({ jobs: pending.map((j) => ({ id: j.id, batch: j.batch })) });
    }),
  );
  app.delete(
    "/api/editor/sessions/:id",
    safe((req, res) => {
      auth(req.params.id, req.body.token);
      sessions.delete(req.params.id);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/editor/commands",
    safe((req, res) => {
      const input = z
        .object({
          sessionId: z.string(),
          requestId: z.string().min(1).max(120),
          batch: authoringBatchSchema,
        })
        .strict()
        .parse(req.body);
      const old = jobs.get(input.requestId),
        signature = JSON.stringify(input);
      if (old) {
        if (old.signature !== signature)
          throw new Error("Request ID was already used for different commands");
        return res.json({ jobId: old.id, status: old.status });
      }
      const session = sessions.get(input.sessionId);
      if (!session)
        return res
          .status(404)
          .json({ error: "Choose a connected editor session" });
      if (session.state.blocked)
        return res
          .status(409)
          .json({ error: "Editor is busy with an interactive edit" });
      if (input.batch.expectedRevision !== session.state.revision)
        return res.status(409).json({
          error:
            "Project revision changed. Read the live state and review the batch again.",
        });
      jobs.set(input.requestId, {
        id: input.requestId,
        sessionId: input.sessionId,
        batch: input.batch,
        status: "queued",
        created: Date.now(),
        signature,
      });
      res.status(202).json({ jobId: input.requestId, status: "queued" });
    }),
  );
  app.get(
    "/api/editor/commands/:id",
    safe((req, res) => {
      const j = jobs.get(req.params.id);
      if (!j)
        return res.status(404).json({ error: "Command request not found" });
      res.json({ jobId: j.id, status: j.status, result: j.result });
    }),
  );
  app.post(
    "/api/editor/commands/:id/result",
    safe((req, res) => {
      const j = jobs.get(req.params.id);
      if (!j) throw new Error("Command request not found");
      const s = auth(j.sessionId, req.body.token);
      if (j.status === "complete" || j.status === "rejected")
        return res.json({ ok: true });
      const result = z
        .object({
          ok: z.boolean(),
          revision: z.number().int().nonnegative(),
          error: z.string().optional(),
          changes: z.array(z.string()).optional(),
          warnings: z.array(z.string()).optional(),
          dryRun: z.boolean().optional(),
        })
        .parse(req.body.result);
      const state = stateSchema.parse(req.body.state);
      if (!state.project)
        throw new Error("Confirmed result must include project state");
      s.state = state;
      s.seen = Date.now();
      j.status = result.ok ? "complete" : "rejected";
      j.result = result;
      res.json({ ok: true });
    }),
  );
}
