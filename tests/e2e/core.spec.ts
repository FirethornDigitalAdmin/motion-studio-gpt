import { TEST_PROJECT_ROOT } from "../paths";
import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { spawnSync } from "node:child_process";
const fixture = path.resolve("tests/fixtures/checker.png");
test.beforeAll(async () => {
  const png = new PNG({ width: 160, height: 100 });
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      png.data[i] = x < 80 ? 50 : 180;
      png.data[i + 1] = y < 50 ? 130 : 80;
      png.data[i + 2] = 210;
      png.data[i + 3] = 255;
    }
  await writeFile(fixture, PNG.sync.write(png));
});
const project = (page: any) =>
  page.evaluate(() => window.__motion.getState().project);
async function setTime(page: any, t: number) {
  await page.evaluate((t: number) => window.__motion.getState().setTime(t), t);
}
async function field(page: any, label: string, value: number | string) {
  const el = page.getByRole("spinbutton", { name: label, exact: true });
  await el.fill(String(value));
  await el.press("Tab");
}
async function settings(page: any) {
  await page
    .getByRole("button", { name: "Project settings", exact: false })
    .click();
}
async function save(page: any, name: string) {
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("required editing journey: import, keyframes, drag, scrub, undo, redo, save and deep reopen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  expect((await project(page)).scenes).toHaveLength(0);
  expect((await project(page)).assets).toHaveLength(0);
  await page.getByTestId("asset-import").setInputFiles(fixture);
  await expect(
    page.getByRole("button", { name: "Place checker.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place checker.png" }).click();
  await field(page, "X", 900);
  await field(page, "Y", 800);
  await page.getByRole("button", { name: "Keyframe X", exact: true }).click();
  await page
    .getByRole("button", { name: "Keyframe Opacity", exact: true })
    .click();
  await setTime(page, 2);
  await field(page, "X", 1700);
  await field(page, "Opacity", 0.25);
  let p = await project(page),
    l = p.scenes[0].layers[0];
  expect(l.keyframes.x).toHaveLength(2);
  expect(l.keyframes.opacity).toHaveLength(2);
  const diamond = page.getByTestId("key-x-1");
  const box = (await diamond.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  p = await project(page);
  expect(p.scenes[0].layers[0].keyframes.x[1].time).toBeCloseTo(3, 4);
  // Scrub the ruler, rather than only setting store time.
  const ruler = (await page.locator(".ruler").boundingBox())!;
  await page.mouse.click(ruler.x + 105, ruler.y + 10);
  expect(
    await page.evaluate(() => window.__motion.getState().time),
  ).toBeCloseTo(1.5, 4);
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("1300");
  await page.screenshot({ path: "test-results/core-midpoint.png" });
  await page.keyboard.press("Control+z");
  p = await project(page);
  expect(p.scenes[0].layers[0].keyframes.x[1].time).toBe(2);
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toHaveValue("1500");
  await page.keyboard.press("Control+Shift+z");
  p = await project(page);
  expect(p.scenes[0].layers[0].keyframes.x[1].time).toBe(3);
  const name = "E2E-" + Date.now();
  await save(page, name);
  const before = await project(page);
  const disk = JSON.parse(
    await readFile(
      path.resolve(TEST_PROJECT_ROOT, name + ".motion/project.json"),
      "utf8",
    ),
  );
  expect(disk).toEqual(before);
  const asset = disk.assets[0];
  expect(
    createHash("sha256")
      .update(
        await readFile(
          path.resolve(TEST_PROJECT_ROOT, name + ".motion", asset.relativePath),
        ),
      )
      .digest("hex"),
  ).toBe(asset.hash);
  expect(
    await readFile(
      path.resolve(TEST_PROJECT_ROOT, name + ".motion", asset.relativePath),
    ),
  ).toEqual(await readFile(fixture));
  await page.reload();
  expect((await project(page)).scenes).toHaveLength(0);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await project(page)).toEqual(disk);
  await expect
    .poll(() => page.evaluate(() => window.__motion.getState().resources.size))
    .toBe(1);
  expect(await page.evaluate(() => window.__motion.getState().missing)).toEqual(
    [],
  );
  expect(errors).toEqual([]);
});

test("core controls: scenes, transforms, timeline boundaries, settings, keyboard and locked layers", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Text", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("Verification\nText");
  await page.getByRole("textbox", { name: "Text content" }).press("Tab");
  await field(page, "Font size", 120);
  await field(page, "Letter spacing", 3);
  await field(page, "Weight", 700);
  await field(page, "Line height", 1.4);
  await page.getByLabel("Text alignment", { exact: true }).selectOption("left");
  await page.getByLabel("Font family", { exact: true }).selectOption("Georgia");
  const before = await project(page);
  expect(before.scenes[0].layers[0].props).toMatchObject({
    fontWeight: 700,
    lineHeight: 1.4,
  });
  await settings(page);
  await page.getByLabel("Aspect ratio").selectOption("9:16");
  await expect(page.getByLabel("Canvas height")).toHaveValue("6826");
  await page.getByLabel("Aspect ratio").selectOption("1:1");
  await page.getByLabel("Aspect ratio").selectOption("4:5");
  await page.getByRole("button", { name: "1080p", exact: true }).click();
  await field(page, "Project duration", 8);
  await field(page, "Frame rate", 24);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect((await project(page)).scenes[0].layers).toEqual(
    before.scenes[0].layers,
  );
  let layer = (await project(page)).scenes[0].layers[0];
  const selection = page.locator(".selection");
  const b = (await selection.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10);
  await page.mouse.up();
  expect((await project(page)).scenes[0].layers[0].x).not.toBe(layer.x);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await project(page)).scenes[0].layers[0].x).toBe(layer.x);
  await page.getByRole("button", { name: "Toggle lock Text" }).click();
  expect((await project(page)).scenes[0].layers[0].locked).toBe(true);
  await expect(
    page.getByRole("spinbutton", { name: "X", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Toggle lock Text" }).click();
  await page.getByRole("button", { name: "Toggle visibility Text" }).click();
  expect((await project(page)).scenes[0].layers[0].visible).toBe(false);
  await page.getByRole("button", { name: "Toggle visibility Text" }).click();
  const bar = page.getByTestId("bar-" + layer.id);
  const end = (await bar.locator(".right").boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x - 140, end.y + end.height / 2);
  await page.mouse.up();
  expect((await project(page)).scenes[0].layers[0].duration).toBeLessThan(
    layer.duration,
  );
  await page.getByRole("button", { name: "Add scene", exact: true }).click();
  expect((await project(page)).scenes).toHaveLength(2);
  await page.locator(".scene-item").last().locator("summary").click();
  await page
    .locator(".scene-item")
    .last()
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  expect((await project(page)).scenes).toHaveLength(3);
  await page
    .locator("details[open]")
    .evaluate((e: HTMLDetailsElement) => (e.open = false));
  await page.locator(".scene-item").last().locator("summary").click();
  await page
    .locator(".scene-item")
    .last()
    .getByRole("button", { name: "Move up" })
    .click();
  expect((await project(page)).scenes[1].name).toContain("copy");
  await page
    .locator("details[open]")
    .evaluate((e: HTMLDetailsElement) => (e.open = false));
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  const time = await page.evaluate(() => window.__motion.getState().time);
  await page.keyboard.press("ArrowRight");
  expect(
    await page.evaluate(() => window.__motion.getState().time),
  ).toBeCloseTo(time + 1 / 24, 4);
  await page.keyboard.press("ArrowLeft");
  expect(
    await page.evaluate(() => window.__motion.getState().time),
  ).toBeCloseTo(time, 4);
});

test("deterministic identical pixels at arbitrary seeks, and 3s 1080p MP4 parity", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await settings(page);
  await page.getByRole("button", { name: "1080p", exact: true }).click();
  await field(page, "Project duration", 3);
  await field(page, "Frame rate", 30);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await field(page, "Width", 300);
  await field(page, "Height", 240);
  await field(page, "X", 300);
  await page.getByRole("button", { name: "Keyframe X", exact: true }).click();
  await setTime(page, 2.9666666667);
  await field(page, "X", 1600);
  await field(page, "Rotation", 30);
  await page
    .getByTestId("asset-import")
    .setInputFiles([
      path.resolve("tests/fixtures/image.svg"),
      path.resolve("tests/fixtures/Roboto.ttf"),
    ]);
  await expect(
    page.getByRole("button", { name: "Place image.svg" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place image.svg" }).click();
  await field(page, "Width", 600);
  await field(page, "Height", 360);
  await field(page, "Y", 820);
  await page
    .getByRole("button", { name: "Text", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("Render verification");
  await page.getByRole("textbox", { name: "Text content" }).press("Tab");
  await field(page, "Font size", 72);
  await page.getByLabel("Font family", { exact: true }).selectOption("Roboto");
  const p = await project(page);
  const renderPage = await page.context().newPage();
  await renderPage.goto("/render");
  await renderPage.waitForFunction(() => window.__renderer);
  await renderPage.evaluate(async (p) => window.__renderer.prepare(p, ""), p);
  const a = await renderPage.evaluate(() => window.__renderer.frame(1.5));
  await renderPage.evaluate(() => window.__renderer.frame(0));
  const b = await renderPage.evaluate(() => window.__renderer.frame(1.5));
  expect(a).toBe(b);
  // Export is explicitly started from the UI. No launch-time rendering.
  await page.getByRole("button", { name: "Export MP4", exact: false }).click();
  await page.getByRole("button", { name: "Start export" }).click();
  await expect(page.getByRole("link", { name: "Download MP4" })).toBeVisible({
    timeout: 180000,
  });
  const href = await page
    .getByRole("link", { name: "Download MP4" })
    .getAttribute("href");
  const response = await request.get(href!);
  expect(
    response.ok(),
    response.ok() ? String(response.status()) : await response.text(),
  ).toBe(true);
  await writeFile("test-results/verification.mp4", await response.body());
  const ff =
    process.env.MOTION_FFMPEG ||
    path.resolve("node_modules/ffmpeg-static/ffmpeg");
  let results = [];
  for (const i of [0, 45, 89]) {
    const out = path.resolve("test-results", `encoded-${i}.png`);
    const result = spawnSync(
      ff,
      [
        "-y",
        "-i",
        path.resolve("test-results/verification.mp4"),
        "-vf",
        `select=eq(n\\,${i})`,
        "-frames:v",
        "1",
        out,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const png = await renderPage.evaluate(
      (t) => window.__renderer.png(t),
      i / 30,
    );
    await writeFile(
      `test-results/reference-${i}.png`,
      Buffer.from(png.split(",")[1], "base64"),
    );
    const expected = PNG.sync.read(Buffer.from(png.split(",")[1], "base64")),
      actual = PNG.sync.read(await readFile(out));
    expect(actual.width).toBe(1920);
    expect(actual.height).toBe(1080);
    let sum = 0,
      count = 0,
      large = 0;
    for (let j = 0; j < expected.data.length; j++) {
      if (j % 4 === 3) continue;
      const diff = Math.abs(expected.data[j] - actual.data[j]);
      sum += diff;
      count++;
      if (diff > 24) large++;
    }
    const mae = sum / count;
    results.push({
      frame: i,
      time: i / 30,
      meanAbsoluteChannelError: mae,
      pixelsAbove24: large / count,
    });
    expect(mae).toBeLessThan(3);
    expect(large / count).toBeLessThan(0.01);
  }
  await writeFile(
    "test-results/export-parity.json",
    JSON.stringify(results, null, 2),
  );
  await renderPage.close();
});

declare global {
  interface Window {
    __motion: any;
    __renderer: any;
  }
}
