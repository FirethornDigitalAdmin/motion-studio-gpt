import { test, expect } from "@playwright/test";
test("graph key and Bézier dragging use native undo, keyboard editing and save/reopen", async ({
  page,
}) => {
  await page.goto("/");
  const field = async (name: string, n: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(n));
    await el.press("Tab");
  };
  const project = () =>
    page.evaluate(() => (window as any).__motion.getState().project);
  await page.getByRole("button", { name: "□ Shape", exact: true }).click();
  await page.getByRole("button", { name: "Keyframe X", exact: true }).click();
  await field("Playhead time", 2);
  await field("X", 2200);
  const original = await project();
  await page.getByRole("button", { name: "Motion tools", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Curve editor", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("combobox", { name: "Graph selected key", exact: true })
    .selectOption("2");
  await field("Graph key value", 2500);
  expect((await project()).scenes[0].layers[0].keyframes.x[1].value).toBe(2500);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await project()).toEqual(original);
  const point = page.getByRole("button", {
    name: "Graph key at 2.000 seconds",
    exact: true,
  });
  const box = (await point.boundingBox())!;
  const past = await page.evaluate(
    () => (window as any).__motion.getState().past.length,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 - 10,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(
    await page.evaluate(() => (window as any).__motion.getState().past.length),
  ).toBe(past + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await project()).toEqual(original);
  await page
    .getByRole("combobox", { name: "Graph selected key", exact: true })
    .selectOption("0");
  await page
    .getByRole("combobox", { name: "Graph easing", exact: true })
    .selectOption("bezier");
  const before = await project(),
    beforePast = await page.evaluate(
      () => (window as any).__motion.getState().past.length,
    );
  const handle = page.getByRole("button", {
      name: "Curve handle 1",
      exact: true,
    }),
    hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 20, hb.y + hb.height / 2 - 12, {
    steps: 8,
  });
  await page.mouse.up();
  expect(
    (await project()).scenes[0].layers[0].keyframes.x[0].easing,
  ).not.toEqual(before.scenes[0].layers[0].keyframes.x[0].easing);
  expect(
    await page.evaluate(() => (window as any).__motion.getState().past.length),
  ).toBe(beforePast + 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await project()).toEqual(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Graph key at 0.000 seconds", exact: true })
    .focus();
  await page
    .getByRole("button", { name: "Graph key at 0.000 seconds", exact: true })
    .press("ArrowRight");
  expect((await project()).scenes[0].layers[0].keyframes.x[0].time).toBeCloseTo(
    1 / 30,
  );
  const name = "Motion curves " + Date.now();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await project();
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(name + "\\.motion") })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await project()).toEqual(saved);
});
test("multi-pose onion controls leave the project intact and diagnostics find an unreachable wrist", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Louis rig", exact: true })
    .click();
  const field = async (name: string, n: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(n));
    await el.press("Tab");
  };
  await field("Playhead time", 2);
  await page.getByRole("button", { name: "Motion tools", exact: true }).click();
  const before = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  await page
    .getByRole("checkbox", { name: "Motion onion skins", exact: true })
    .check();
  const alpha = () =>
    page
      .locator('canvas[aria-label="Onion skin preview"]')
      .evaluate((el: HTMLCanvasElement) => {
        const p = el
          .getContext("2d")!
          .getImageData(0, 0, el.width, el.height).data;
        let a = 0;
        for (let i = 3; i < p.length; i += 4) a += p[i];
        return a;
      });
  await expect.poll(alpha).toBeGreaterThan(0);
  const one = await alpha();
  expect(one).toBeGreaterThan(0);
  await page
    .getByRole("combobox", { name: "Onion before poses", exact: true })
    .selectOption("3");
  await page
    .getByRole("combobox", { name: "Onion after poses", exact: true })
    .selectOption("3");
  expect(await alpha()).toBeGreaterThan(one);
  expect(
    await page.evaluate(() => (window as any).__motion.getState().project),
  ).toEqual(before);
  await page.getByText("Pose controls", { exact: true }).click();
  await field("Right wrist X", 4000);
  await page.getByRole("tab", { name: "Diagnostics", exact: true }).click();
  await expect(page.getByText(/beyond reach/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Scan scene motion", exact: true })
    .click();
  await expect(
    page.locator(".diagnostics-workspace").getByRole("status"),
  ).toContainText("sampled frames");
  await expect(page.locator(".motion-issue-list button").first()).toBeVisible();
  await page.locator(".motion-issue-list button").first().click();
  await expect(
    page.getByRole("spinbutton", { name: "Motion playhead", exact: true }),
  ).toBeVisible();
  await field("Speed threshold", 500);
  await expect(
    page.getByText(
      "Scene or scan settings changed. Scan again to refresh the findings.",
      { exact: true },
    ),
  ).toBeVisible();
});
