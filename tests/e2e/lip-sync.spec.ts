import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
const tone = path.resolve("tests/fixtures/lip-sync-tone.wav");
test.beforeAll(() => {
  expect(
    spawnSync(path.resolve("node_modules/ffmpeg-static/ffmpeg"), [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=400:duration=2",
      tone,
    ]).status,
  ).toBe(0);
});
test("facial editor bakes timed artwork, supports undo and native save, and renders the same speech in export", async ({
  page,
}) => {
  await page.goto("/");
  const field = async (name: string, value: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(value));
    await el.press("Tab");
  };
  await page.getByRole("button", { name: "⚙ Project settings" }).click();
  await field("Canvas width", 1536);
  await field("Canvas height", 1408);
  await field("Project duration", 4);
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
  await page.getByTestId("asset-import").setInputFiles(tone);
  await page
    .getByRole("button", { name: "Place lip-sync-tone.wav", exact: true })
    .click();
  const before = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  const actor = before.scenes[0].layers.find((l: any) => l.type === "rig");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .getByRole("button", { name: "□ " + actor.name, exact: true })
    .click();
  await page.getByText("Build speech track", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Speech audio", exact: true })
    .selectOption(
      before.scenes[0].layers.find((l: any) => l.type === "audio").id,
    );
  await page.getByRole("textbox", { name: "Speech alignment JSON" }).fill(
    JSON.stringify({
      mouthCues: [
        { start: 0, end: 0.5, value: "A" },
        { start: 0.5, end: 1, value: "D" },
        { start: 1, end: 1.5, value: "F" },
        { start: 1.5, end: 2, value: "X" },
      ],
    }),
  );
  await page.getByRole("button", { name: "Generate mouth track" }).click();
  await expect(page.getByRole("status")).toContainText("4 mouth cues");
  await field("Playhead time", 0.75);
  await expect(
    page.getByRole("combobox", { name: "Mouth shape", exact: true }),
  ).toHaveValue("aa");
  const speaking = await page
    .locator('canvas[aria-label="Composition preview"]')
    .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const p = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).__motion.getState().project),
  ).toEqual(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await field("Playhead time", 1.75);
  const closed = await page
    .locator('canvas[aria-label="Composition preview"]')
    .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  expect(closed).not.toEqual(speaking);
  const render = await page.context().newPage();
  await render.goto("/render");
  await render.waitForFunction(() => (window as any).__renderer);
  await render.evaluate(
    async (p) => (window as any).__renderer.prepare(p, ""),
    p,
  );
  const openFrame = await render.evaluate(() =>
      (window as any).__renderer.frame(0.75),
    ),
    closedFrame = await render.evaluate(() =>
      (window as any).__renderer.frame(1.75),
    );
  expect(openFrame).not.toEqual(closedFrame);
  await field("Playhead time", 2.1);
  await page.getByRole("button", { name: "Record blink", exact: true }).click();
  await field("Playhead time", 2.21);
  await expect(
    page.getByRole("spinbutton", { name: "Eyelid closure", exact: true }),
  ).toHaveValue("1");
  const name = "Facial performance " + Date.now();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(name);
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
  await page
    .getByRole("button", { name: new RegExp(name + "\\.motion") })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__motion.getState().project),
  ).toEqual(saved);
  await render.close();
});
