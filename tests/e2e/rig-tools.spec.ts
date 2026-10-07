import { test, expect } from "@playwright/test";
import { evaluateRigScene, rigToWorld, layerPoint } from "../../src/rigging";
import type { Project } from "../../src/model";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
test("joint drag, one undo, pose library, pins, prop attach/release, drawing keys, save and export", async ({
  page,
  request,
}, testInfo) => {
  const field = async (name: string, value: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(value));
    await el.press("Tab");
  };
  const state = () =>
    page.evaluate(() => {
      const s = (window as any).__motion.getState();
      return { project: s.project as Project, folder: s.folder };
    });
  await page.goto("/");
  await page
    .getByRole("button", { name: "⚙ Project settings", exact: true })
    .click();
  await field("Canvas width", 1536);
  await field("Canvas height", 1408);
  await field("Project duration", 6);
  await field("Frame rate", 12);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Louis rig", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Rig action", exact: true })
    .selectOption("idle");
  await page.getByRole("button", { name: "Pose editor", exact: true }).click();
  const initial = (await state()).project;
  const wrist = page.getByRole("button", {
    name: "Pose Right wrist",
    exact: true,
  });
  const b = (await wrist.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 24, b.y + b.height / 2 - 22, {
    steps: 8,
  });
  await page.mouse.up();
  let p = (await state()).project,
    actor = p.scenes[0].layers[0];
  expect(actor.keyframes.poseMode[0].value).toBe("authored");
  expect(actor.keyframes.handRX.length).toBe(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await state()).project).toEqual(initial);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByText("Pose library", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pose name", exact: true })
    .fill("Reach for mug");
  await page
    .getByRole("button", { name: "Save pose to library", exact: true })
    .click();
  expect((await state()).project.poses[0].name).toBe("Reach for mug");
  await page
    .getByRole("button", { name: "Onion skin preview", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Onion skin", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Onion skin preview", { exact: true }),
  ).toHaveCount(2);
  await field("Playhead time", 2);
  await page.getByText("Contacts & props", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Contact joint", exact: true })
    .selectOption("foot_R");
  await page
    .getByRole("button", { name: "Pin joint in scene", exact: true })
    .click();
  p = (await state()).project;
  actor = p.scenes[0].layers[0];
  const pin = actor.props.rigConstraints[0];
  await page.getByText("Pose controls", { exact: true }).click();
  const hip = page.getByRole("spinbutton", { name: "Hip Y", exact: true });
  await field("Hip Y", Number(await hip.inputValue()) + 20);
  p = (await state()).project;
  let v = evaluateRigScene(p.scenes[0], 2),
    world = rigToWorld(
      v.layers.get(actor.id)!,
      v.poses.get(actor.id)!.attachments.foot_R!,
    );
  expect(world.x).toBeCloseTo(pin.worldX, 5);
  expect(world.y).toBeCloseTo(pin.worldY, 5);
  const hand = rigToWorld(
    v.layers.get(actor.id)!,
    v.poses.get(actor.id)!.attachments.hand_R!,
  );
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Pouring kettle", exact: true })
    .click();
  await field("X", hand.x);
  await field("Y", hand.y);
  await field("Width", 70);
  await field("Height", 80);
  await page.getByRole("button", { name: "□ Louis rig", exact: true }).click();
  await page.getByText("Contacts & props", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Contact joint", exact: true })
    .selectOption("hand_R");
  await page
    .getByRole("combobox", { name: "Prop contact", exact: true })
    .selectOption("carry");
  p = (await state()).project;
  const prop = p.scenes[0].layers[1];
  await page
    .getByRole("combobox", { name: "Contact prop", exact: true })
    .selectOption(prop.id);
  await page
    .getByRole("button", { name: "Add prop contact", exact: true })
    .click();
  await field("Playhead time", 4);
  await page.getByText("Pose controls", { exact: true }).click();
  const y = page.getByRole("spinbutton", {
    name: "Right wrist Y",
    exact: true,
  });
  await field("Right wrist Y", Number(await y.inputValue()) - 60);
  p = (await state()).project;
  actor = p.scenes[0].layers[0];
  const carry = actor.props.rigConstraints[1];
  for (const t of [2, 3.1, 3.8]) {
    v = evaluateRigScene(p.scenes[0], t);
    const grip = layerPoint(v.layers.get(prop.id)!, {
      x: carry.targetX * 70,
      y: carry.targetY * 80,
    });
    world = rigToWorld(
      v.layers.get(actor.id)!,
      v.poses.get(actor.id)!.attachments.hand_R!,
    );
    expect(grip.x).toBeCloseTo(world.x, 5);
    expect(grip.y).toBeCloseTo(world.y, 5);
  }
  const held = evaluateRigScene(p.scenes[0], 4 - 0.00001).layers.get(prop.id)!;
  await page
    .locator(".contact-card")
    .filter({ hasText: "Carrying" })
    .getByRole("button", { name: "Release at playhead", exact: true })
    .click();
  p = (await state()).project;
  v = evaluateRigScene(p.scenes[0], 4.5);
  expect(v.layers.get(prop.id)!.x).toBeCloseTo(held.x, 5);
  expect(v.layers.get(prop.id)!.y).toBeCloseTo(held.y, 5);
  await page
    .getByText("Drawing registration & proportions", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Smooth joint overlaps", exact: true })
    .check();
  await field("Drawing anchorX", 0.48);
  p = (await state()).project;
  expect(p.scenes[0].layers[0].props.rigDrawings[0].time).toBe(4);
  const name = "Rig tools " + Date.now();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await state();
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(name + "\\.motion") })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state()).project).toEqual(saved.project);
  // The native export must use the exact same constrained pose and drawing resolver.
  await page.getByRole("button", { name: "↑ Export MP4", exact: true }).click();
  await page.getByRole("button", { name: "Start export", exact: true }).click();
  const download = page.getByRole("link", {
    name: "Download MP4",
    exact: true,
  });
  await expect(download).toBeVisible({ timeout: 120000 });
  const response = await request.get(
    (await download.getAttribute("href")) as string,
  );
  expect(response.ok()).toBe(true);
  const video = testInfo.outputPath("rig-tools.mp4");
  writeFileSync(video, await response.body());
  const render = await page.context().newPage();
  await render.goto("/render");
  await render.waitForFunction(() => (window as any).__renderer);
  await render.evaluate(
    async ({ p, folder }) => (window as any).__renderer.prepare(p, folder),
    { p: saved.project, folder: saved.folder },
  );
  for (const t of [0, 3, 4.5]) {
    const expected = Buffer.from(
      await render.evaluate((t) => (window as any).__renderer.frame(t), t),
      "base64",
    );
    const again = await render.evaluate(
      (t) => (window as any).__renderer.frame(t),
      t,
    );
    expect(Buffer.from(again, "base64")).toEqual(expected);
    const actual = execFileSync(
      path.resolve("node_modules/ffmpeg-static/ffmpeg"),
      [
        "-hide_banner",
        "-v",
        "error",
        "-ss",
        String(t),
        "-i",
        video,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    let error = 0;
    for (let i = 0; i < actual.length; i += 4)
      for (let c = 0; c < 3; c++)
        error += Math.abs(actual[i + c] - expected[i + c]);
    expect(actual.length).toBe(expected.length);
    expect(error / (actual.length * 0.75)).toBeLessThan(3);
  }
  await render.close();
});
