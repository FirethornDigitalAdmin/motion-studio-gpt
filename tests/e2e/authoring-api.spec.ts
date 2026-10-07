import { test, expect } from "@playwright/test";
test("REST batches apply in the live editor atomically with dry runs, revision checks, replay protection and undo", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "□ Shape", exact: true }).click();
  let session: any;
  await expect
    .poll(async () => {
      const r = await request.get("/api/editor");
      const data = await r.json();
      session = data.sessions.find((s: any) => s.projectName === "Untitled");
      return !!session;
    })
    .toBeTruthy();
  const state = async () => {
    const r = await request.get("/api/editor/sessions/" + session.id);
    return r.json();
  };
  await expect
    .poll(async () => (await state()).project?.scenes?.[0]?.layers?.length || 0)
    .toBe(1);
  let s = await state(),
    layer = s.project.scenes[0].layers[0];
  const submit = async (id: string, batch: any) => {
    const queued = await request.post("/api/editor/commands", {
      data: { sessionId: session.id, requestId: id, batch },
    });
    expect(queued.ok()).toBeTruthy();
    let job: any;
    await expect
      .poll(async () => {
        job = await (await request.get("/api/editor/commands/" + id)).json();
        return ["complete", "rejected"].includes(job.status);
      })
      .toBeTruthy();
    return job;
  };
  const batch = {
    label: "Move prop",
    expectedRevision: s.revision,
    commands: [
      { op: "setTransform", layerId: layer.id, values: { x: 600 } },
      {
        op: "setKeyframe",
        layerId: layer.id,
        property: "x",
        time: 2,
        value: 900,
      },
    ],
    view: { sceneId: s.sceneId, layerId: layer.id, time: 2 },
  };
  const dry = await submit("dry", { ...batch, dryRun: true });
  expect(dry.result.ok).toBeTruthy();
  expect((await state()).project).toEqual(s.project);
  const done = await submit("move", batch);
  expect(done.result.ok).toBeTruthy();
  expect((await state()).project.scenes[0].layers[0].x).toBe(600);
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("900");
  const replay = await request.post("/api/editor/commands", {
    data: { sessionId: session.id, requestId: "move", batch },
  });
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).status).toBe("complete");
  const stale = await request.post("/api/editor/commands", {
    data: { sessionId: session.id, requestId: "stale", batch },
  });
  expect(stale.status()).toBe(409);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify((await state()).project))
    .toBe(JSON.stringify(s.project));
  s = await state();
  const invalid = await submit("invalid", {
    label: "Bad batch",
    expectedRevision: s.revision,
    commands: [
      { op: "setTransform", layerId: layer.id, values: { x: 100 } },
      {
        op: "setKeyframe",
        layerId: layer.id,
        property: "opacity",
        time: 1,
        value: 2,
      },
    ],
  });
  expect(invalid.status).toBe("rejected");
  expect((await state()).project).toEqual(s.project);
  await page
    .getByRole("button", { name: "Authoring API", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Authoring API", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Move prop", { exact: true })).toBeVisible();
});

test("authors reusable rigs, drawing registration, poses, cameras and prop release through REST", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rig builder", exact: true }).click();
  await page
    .getByRole("button", { name: "Load Louis artwork", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Place rig in scene", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Authoring API", exact: true })
    .click();
  const sessionField = page.getByRole("textbox", {
    name: "Editor session ID",
    exact: true,
  });
  await expect(sessionField).not.toHaveValue("");
  let session: any = { id: await sessionField.inputValue() };
  await page
    .getByRole("button", { name: "Close authoring API", exact: true })
    .click();
  await expect
    .poll(async () => {
      const s = await (
        await request.get("/api/editor/sessions/" + session.id)
      ).json();
      return !!s.project.rigTemplates.length;
    })
    .toBeTruthy();
  const read = async () =>
    (await request.get("/api/editor/sessions/" + session.id)).json();
  const s = await read(),
    template = s.project.rigTemplates[0];
  const commands = [
    {
      op: "createScene",
      id: "performance",
      name: "API performance",
      start: 0,
      duration: 5,
    },
    {
      op: "createLayer",
      sceneId: "performance",
      id: "performer",
      type: "rig",
      name: "API actor",
      templateId: template.id,
    },
    {
      op: "createLayer",
      sceneId: "performance",
      id: "prop",
      type: "shape",
      name: "Carried prop",
    },
    { op: "setTransform", layerId: "prop", values: { scale: 0.15 } },
    { op: "setPose", layerId: "performer", time: 0, values: { headAngle: 0 } },
    {
      op: "setPose",
      layerId: "performer",
      time: 2,
      values: {
        headAngle: 10,
        expression: "sceptical",
        handRX: 700,
        handRY: 700,
      },
    },
    {
      op: "setDrawing",
      layerId: "performer",
      slot: "head",
      assetId: template.props.rigAssets.head,
      registration: { anchorX: 0.5, anchorY: 0.94, scaleX: 1, scaleY: 1 },
    },
    {
      op: "addContact",
      layerId: "performer",
      contact: {
        id: "carry",
        kind: "carry",
        effector: "hand_R",
        targetLayerId: "prop",
        start: 0,
        end: 4,
        followRotation: true,
      },
    },
    {
      op: "releaseContact",
      layerId: "performer",
      contactId: "carry",
      time: 2.5,
    },
    {
      op: "addCameraShot",
      sceneId: "performance",
      shot: {
        id: "shot",
        name: "Reaction",
        start: 1,
        duration: 3,
        x: 1920,
        y: 1000,
        zoom: 1.1,
        endZoom: 1.3,
        easing: "ease-in-out",
      },
    },
  ];
  const response = await request.post("/api/editor/commands", {
    data: {
      sessionId: session.id,
      requestId: "rig-performance",
      batch: {
        label: "Rig performance",
        expectedRevision: s.revision,
        commands,
        view: { sceneId: "performance", layerId: "performer", time: 2 },
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  let job: any;
  await expect
    .poll(async () => {
      job = await (
        await request.get("/api/editor/commands/rig-performance")
      ).json();
      return job.status;
    })
    .toBe("complete");
  expect(job.result.ok).toBeTruthy();
  const p = (await read()).project,
    scene = p.scenes.find((s: any) => s.id === "performance");
  expect(scene.shots).toHaveLength(1);
  expect(scene.layers[0].props.rigConstraints[0].end).toBe(2.5);
  expect(scene.layers[1].keyframes.x).toHaveLength(2);
  await expect(
    page.getByRole("spinbutton", { name: "Head angle", exact: true }),
  ).toHaveValue("10");
  const saved = await request.post("/api/save", {
    data: { folder: "API Performance.motion", project: p },
  });
  expect(saved.ok()).toBeTruthy();
  const loaded = await (
    await request.get("/api/project?folder=API%20Performance.motion")
  ).json();
  expect(loaded.scenes.find((s: any) => s.id === "performance")).toEqual(scene);
});
