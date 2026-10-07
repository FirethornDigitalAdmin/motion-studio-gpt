# Validated editor authoring API

Open **Authoring API** in Motion Studio's toolbar. The panel shows the current project, revision, exact editor session ID, a sample batch and recent command history. **Validate dry run** checks a batch without editing the project. **Apply batch** applies all its changes as one undo step. **Use current revision** refreshes the precondition after you have reviewed the current scene. Expand **Scene reference IDs** for scene, layer, asset and rig-template identifiers.

The local HTTP API routes commands through the running editor. It does not replace project JSON on disk. Changes appear in the normal timeline and inspector, use the native model and rig solver, and are saved/exported through the usual controls. It also works with the reusable rigs created by Rig builder.

## HTTP flow

1. `GET /api/editor` returns connected editor descriptors, command capabilities and the batch JSON schema. Choose the exact session ID displayed by your intended editor; multiple tabs can have similarly named projects.
2. `GET /api/editor/sessions/:id` returns that editor's current project, revision, selection, playhead, folder, busy status and undo/redo availability. State is refreshed approximately every half second while the editor is connected.
3. `POST /api/editor/commands` with `{sessionId, requestId, batch}` queues a request. Use a fresh UUID as `requestId` for each new batch. The response is HTTP 202 with `{jobId, status:"queued"}`.
4. `GET /api/editor/commands/:jobId` returns `queued`, `delivered`, `complete` or `rejected`. The confirmed result includes `ok`, `revision`, `changes`, `warnings` and `dryRun`, or a specific error. Queue acceptance alone does not confirm application.
5. Use normal Save/ZIP/MP4 controls when satisfied. Ordinary editor Undo reverses the complete batch.

```json
{
  "sessionId": "COPY_FROM_EDITOR",
  "requestId": "FRESH_UUID",
  "batch": {
    "label": "Deadpan reaction",
    "expectedRevision": 4,
    "dryRun": true,
    "commands": [
      {"op":"setPose","layerId":"ACTOR_ID","time":0,"values":{"headAngle":0,"expression":"neutral"}},
      {"op":"setPose","layerId":"ACTOR_ID","time":2,"values":{"headAngle":8,"expression":"sceptical","gazeX":0.6}}
    ],
    "view": {"sceneId":"SCENE_ID","layerId":"ACTOR_ID","time":2}
  }
}
```

After successful dry-run validation, submit the reviewed batch with `dryRun:false` and a new request ID. Read the current revision again if any scene edits have occurred. Do not automatically retry a stale batch with a newer revision without reviewing the changed project.

## Commands

- `createScene`: explicit `id`, `name`, project-relative `start`, `duration`.
- `createLayer`: `sceneId`, explicit `id`, `type`, `name`; image/audio layers require a compatible imported `assetId`, rig layers require a saved `templateId`.
- `setTransform`: `layerId`, partial `values` containing position, scale, rotation, opacity, anchor, start or duration.
- `setKeyframe`: `layerId`, native animation `property`, layer-local `time`, typed `value`, optional native `easing`.
- `setPose`: rig `layerId`, layer-local `time`, partial pose `values`. Unspecified joints are captured from the evaluated pose rather than reset. The result is a normal authored pose on the timeline.
- `setDrawing`: rig `layerId`, existing `slot`, imported image `assetId`, `registration:{anchorX,anchorY,scaleX,scaleY}`, optional `crop:{x,y,width,height}` or null; optional layer-local `time` creates a drawing key. Without time it updates the base artwork registration.
- `addContact`: rig `layerId` and native `contact` with explicit ID, pin/reach/carry kind, hand/foot effector, actor-local start/end and world position or same-scene prop target. Target props must be unlocked images or shapes. Pinning, ownership and cycle validation use the native contact model.
- `releaseContact`: `layerId`, `contactId`, actor-local release `time`. Carried props retain their evaluated release position and rotation via native prop keys.
- `addCameraShot`: `sceneId`, native `shot` with explicit ID/name, scene-local start/duration, focus x/y, zoom/endZoom and easing.
- `generateLipSync`: `layerId`, `input` with `audioLayerId` and a transcript or timed mouth cues. Creates editable mouth-shape keys; see [Facial performance](facial-animation.md) for timing formats and draft limitations.
- `addBlink`: `layerId`, character-local `time`. Records a complete 0.28-second blink gesture.
- `setFollowThrough`: `layerId`, partial `values` containing `enabled`, `head`, `arms`, `strength` (0–1), `frequency` (1–8), `damping` (0.35–1). See [Follow-through](follow-through.md).
- `bakeFollowThrough`: `layerId`. Samples the enabled effect into editable native keys at the project frame rate and disables it.

Optional `view` focuses a scene/layer and moves the playhead after an applied batch. Its time is project-global. Dry runs do not change the view.

Unknown operations/fields, incompatible assets, invalid values, locked layers, invalid timing, contact conflicts, missing references and stale revisions are rejected. Batches are validated against a cloned project before the editor commits any change. Repeating an identical request ID returns its existing job; using it with different commands is rejected. The editor also refuses batches during interactive edits and other modal operations.

The API is local to the existing localhost server and retains its host/origin protections. Editor transport registration and heartbeat/result endpoints are internal. Session metadata and command history are transient; authored animation is saved in the normal native project. Sessions expire after 30 seconds without a heartbeat. If a request times out before confirmation, inspect the current scene and revision before deciding whether to retry.
