import { create } from "zustand";
import { useStore } from "./store";
import { applyAuthoring, type AuthoringBatch } from "./authoring";
export const useAuthoringStatus = create<{
  sessionId: string | null;
  connected: boolean;
  revision: number;
  log: {
    label: string;
    ok: boolean;
    dryRun: boolean;
    message: string;
    commands: AuthoringBatch["commands"];
  }[];
}>(() => ({ sessionId: null, connected: false, revision: 0, log: [] }));
export function executeAuthoring(batch: AuthoringBatch, blocked = false) {
  const status = useAuthoringStatus.getState(),
    state = useStore.getState();
  try {
    if (blocked || state.gesture)
      throw new Error("Finish the interactive edit before authoring");
    if (batch.expectedRevision !== status.revision)
      throw new Error(
        "Project revision changed. Read the live state and review the batch again.",
      );
    const result = applyAuthoring(state.project, batch);
    if (!result.batch.dryRun) {
      state.edit((p) => Object.assign(p, result.project));
      if (result.batch.view) {
        state.select(
          result.batch.view.layerId ? [result.batch.view.layerId] : [],
          result.batch.view.sceneId,
        );
        if (result.batch.view.time !== undefined)
          state.setTime(result.batch.view.time);
      }
      useStore.setState({ playing: false });
    }
    const message = `${result.changes.length} commands ${result.batch.dryRun ? "validated" : "applied"}${result.warnings.length ? " · " + result.warnings.join("; ") : ""}`;
    useAuthoringStatus.setState((s) => ({
      log: [
        {
          label: batch.label,
          ok: true,
          dryRun: batch.dryRun,
          message,
          commands: structuredClone(batch.commands),
        },
        ...s.log,
      ].slice(0, 20),
    }));
    return {
      ok: true,
      revision: useAuthoringStatus.getState().revision,
      changes: result.changes,
      warnings: result.warnings,
      dryRun: result.batch.dryRun,
    };
  } catch (e) {
    const error = (e as Error).message;
    useAuthoringStatus.setState((s) => ({
      log: [
        {
          label: batch.label,
          ok: false,
          dryRun: batch.dryRun,
          message: error,
          commands: structuredClone(batch.commands),
        },
        ...s.log,
      ].slice(0, 20),
    }));
    return { ok: false, revision: status.revision, error };
  }
}
export function startAuthoringBridge(blocked: () => boolean) {
  let disposed = false,
    session: { id: string; token: string } | null = null,
    sentRevision = -1,
    timer: ReturnType<typeof setTimeout>;
  const pending: {
    id: string;
    result: ReturnType<typeof executeAuthoring>;
    state: ReturnType<typeof snapshot>;
  }[] = [];
  const unsubscribe = useStore.subscribe((s, old) => {
    if (s.project !== old.project)
      useAuthoringStatus.setState((st) => ({ revision: st.revision + 1 }));
  });
  const snapshot = (full = false) => {
    const s = useStore.getState(),
      revision = useAuthoringStatus.getState().revision;
    return {
      revision,
      project: full || sentRevision !== revision ? s.project : undefined,
      folder: s.folder,
      sceneId: s.sceneId,
      selected: s.selected,
      time: s.time,
      blocked: blocked() || !!s.gesture,
      canUndo: !!s.past.length,
      canRedo: !!s.future.length,
    };
  };
  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok)
      throw new Error((await r.json()).error || "Editor connection failed");
    return r.json();
  };
  const poll = async () => {
    try {
      if (!session) {
        const opened = await post("/api/editor/sessions", snapshot(true));
        if (disposed) {
          void fetch("/api/editor/sessions/" + opened.id, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: opened.token }),
          });
          return;
        }
        session = opened;
        useAuthoringStatus.setState({ sessionId: opened.id });
        sentRevision = -1;
      }
      while (pending.length) {
        const item = pending[0];
        await post("/api/editor/commands/" + item.id + "/result", {
          token: session!.token,
          result: item.result,
          state: item.state,
        });
        pending.shift();
      }
      const state = snapshot();
      const response = await post(
        "/api/editor/sessions/" + session!.id + "/poll",
        { token: session!.token, state },
      );
      sentRevision = state.revision;
      if (disposed) return;
      useAuthoringStatus.setState({ connected: true });
      for (const job of response.jobs) {
        const result = executeAuthoring(job.batch, blocked());
        pending.push({ id: job.id, result, state: snapshot(true) });
      }
    } catch (e) {
      useAuthoringStatus.setState({ connected: false });
      if ((e as Error).message === "Editor session expired") {
        session = null;
        pending.length = 0;
      }
    } finally {
      if (!disposed)
        timer = setTimeout(() => void poll(), pending.length ? 0 : 500);
    }
  };
  void poll();
  return () => {
    disposed = true;
    clearTimeout(timer);
    unsubscribe();
    useAuthoringStatus.setState({ connected: false, sessionId: null });
    if (session)
      void fetch("/api/editor/sessions/" + session.id, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token }),
      }).catch(() => {});
  };
}
