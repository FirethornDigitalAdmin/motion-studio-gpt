import { test, expect } from "@playwright/test";
test("character library, real eyelid closure, action keys and native save survive reload", async ({
  page,
}) => {
  const projectName='Character test '+Date.now();
  await page.goto("/");
  const field = async (name: string, n: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(n));
    await el.press("Tab");
  };
  await page
    .getByRole("button", { name: "⚙ Project settings", exact: true })
    .click();
  await field("Canvas width", 1536);
  await field("Canvas height", 1408);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Louis rig", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rig action", exact: true })
    .selectOption("rest");
  await page
    .getByRole("checkbox", { name: "Natural blinking", exact: true })
    .uncheck();
  const p = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  const r = await page.context().newPage();
  await r.goto("/render");
  await r.waitForFunction(() => (window as any).__renderer);
  await r.evaluate(async (p) => (window as any).__renderer.prepare(p, ""), p);
  const frame = () => r.evaluate(() => (window as any).__renderer.frame(0));
  const opened = await frame();
  await field("Eyelid closure", 1);
  const shutProject = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  await r.evaluate(
    async (p) => (window as any).__renderer.prepare(p, ""),
    shutProject,
  );
  const shut = await frame();
  const whites = (b: string) => {
    const bytes = Buffer.from(b, "base64");
    let n = 0;
    for (let y = 280; y < 410; y++)
      for (let x = 770; x < 920; x++) {
        const i = (y * 1536 + x) * 4;
        if (bytes[i] > 225 && bytes[i + 1] > 225 && bytes[i + 2] > 225) n++;
      }
    return n;
  };
  expect(whites(opened)).toBeGreaterThan(1000);
  expect(whites(shut)).toBeLessThan(whites(opened) * 0.05);
  await field("Eyelid closure", 0);
  await page
    .getByRole("combobox", { name: "Rig action", exact: true })
    .selectOption("desk_work");
  await page
    .getByRole("button", { name: "Keyframe Rig action", exact: true })
    .click();
  await field("Playhead time", 4.5);
  await page
    .getByRole("button", { name: "Keyframe Rig action", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rig action", exact: true })
    .selectOption("desk_stand");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(projectName);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(projectName+".motion") }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__motion.getState().project),
  ).toEqual(saved);
  await r.close();
});
