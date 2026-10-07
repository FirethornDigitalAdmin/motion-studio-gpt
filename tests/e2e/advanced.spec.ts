import { TEST_PROJECT_ROOT } from "../paths";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const get = (p: any) => p.evaluate(() => window.__motion.getState().project);
async function field(p: any, label: string, n: number) {
  await p.getByRole("spinbutton", { name: label, exact: true }).fill(String(n));
  await p.getByRole("spinbutton", { name: label, exact: true }).press("Tab");
}
test("presets replace editable keys with one undo, spring curve, and deterministic stagger", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await page.getByLabel("Animation preset").selectOption("slide-in");
  await page.getByLabel("Preset easing").selectOption("spring");
  await field(page, "Spring stiffness", 130);
  await field(page, "Spring damping", 12);
  await field(page, "Spring mass", 1.5);
  await field(page, "Preset delay", 0.2);
  await field(page, "Preset duration", 0.8);
  await page.getByRole("button", { name: "Apply preset", exact: true }).click();
  let p = await get(page),
    l = p.scenes[0].layers[0];
  expect(l.keyframes.x[0]).toMatchObject({
    time: 0.2,
    value: 1520,
    easing: { type: "spring", stiffness: 130, damping: 12, mass: 1.5 },
  });
  expect(l.keyframes.x[1]).toMatchObject({ time: 1, value: 1920 });
  await page.getByLabel("Animation preset").selectOption("slide-out");
  await page.getByRole("button", { name: "Apply preset", exact: true }).click();
  expect((await get(page)).scenes[0].layers[0].keyframes.x[0].value).toBe(1920);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes[0].layers[0].keyframes.x).toEqual(
    l.keyframes.x,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await page
    .locator(".layer-select")
    .nth(1)
    .click({ modifiers: ["Shift"] });
  await page
    .locator(".layer-select")
    .nth(2)
    .click({ modifiers: ["Shift"] });
  await page.getByLabel("Stagger order").selectOption("random");
  await field(page, "Stagger interval", 0.25);
  await field(page, "Random seed", 123);
  await page.getByRole("button", { name: "Apply stagger" }).click();
  p = await get(page);
  const starts = p.scenes[0].layers.map((l: any) => l.start);
  expect([...starts].sort()).toEqual([0, 0.25, 0.5]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes[0].layers.map((l: any) => l.start)).toEqual([
    0, 0, 0,
  ]);
  await page.getByRole("button", { name: "Apply stagger" }).click();
  expect((await get(page)).scenes[0].layers.map((l: any) => l.start)).toEqual(
    starts,
  );
});

test("cursor targets drag as one edit; clicks, smoothing and seeks are deterministic", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add cursor", exact: true }).click();
  await page
    .getByRole("button", { name: "Add path point", exact: true })
    .click();
  await page.evaluate(() => window.__motion.getState().setTime(2));
  await page
    .getByRole("button", { name: "Add path point", exact: true })
    .click();
  await field(page, "Target 2 X", 500);
  await field(page, "Target 2 Y", 120);
  await page.getByRole("button", { name: "Add click at playhead" }).click();
  await field(page, "Click 1 time", 1.25);
  await page.getByLabel("Smooth cursor path").uncheck();
  let p = await get(page);
  expect(p.scenes[0].layers[0].props.smoothing).toBe(false);
  expect(p.scenes[0].layers[0].props.clicks).toEqual([1.25]);
  const point = page.getByRole("button", { name: "Cursor target 2" });
  const b = (await point.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 25, b.y + b.height / 2 + 15, {
    steps: 5,
  });
  await page.mouse.up();
  const moved = (await get(page)).scenes[0].layers[0].props.points[1];
  expect(moved.x).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes[0].layers[0].props.points[1]).toEqual(
    p.scenes[0].layers[0].props.points[1],
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  p = await get(page);
  const render = await page.context().newPage();
  await render.goto("/render");
  await render.waitForFunction(() => window.__renderer);
  await render.evaluate(async (p) => window.__renderer.prepare(p, ""), p);
  const a = await render.evaluate(() => window.__renderer.png(1.4));
  await render.evaluate(() => window.__renderer.png(2.5));
  const b64 = await render.evaluate(() => window.__renderer.png(1.4));
  expect(a).toBe(b64);
  expect(await render.evaluate(() => window.__renderer.png(1.2))).not.toBe(a);
  await writeFile(
    "test-results/cursor-ripple.png",
    Buffer.from(a.split(",")[1], "base64"),
  );
  await page.screenshot({ path: "test-results/advanced-editor.png" });
  await render.close();
});

test("export cancellation and CLI share the saved-project pipeline", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Project settings", exact: false })
    .click();
  await page.getByRole("button", { name: "1080p", exact: true }).click();
  await field(page, "Project duration", 3);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Export MP4", exact: false }).click();
  await page.getByRole("button", { name: "Start export" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel export" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Project settings", exact: false })
    .click();
  await field(page, "Project duration", 0.1);
  await page.getByRole("button", { name: "Done" }).click();
  const name = "CLI-" + Date.now();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const out = path.resolve("test-results", name + ".mp4");
  const ff =
    process.env.MOTION_FFMPEG ||
    path.resolve("node_modules/ffmpeg-static/ffmpeg");
  const result = await new Promise<{ code: number | null; log: string }>(
    (resolve, reject) => {
      const proc = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "server/cli.ts",
          path.resolve(TEST_PROJECT_ROOT, name + ".motion"),
          out,
        ],
        {
          env: {
            ...process.env,
            MOTION_FFMPEG: ff,
            MOTION_RENDER_PORT: "4195",
          },
        },
      );
      let log = "";
      proc.stdout.on("data", (d) => (log += d));
      proc.stderr.on("data", (d) => (log += d));
      proc.on("error", reject);
      proc.on("close", (code) => resolve({ code, log }));
    },
  );
  expect(result.code, result.log).toBe(0);
  expect((await readFile(out)).length).toBeGreaterThan(1000);
});
