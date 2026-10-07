import { test, expect } from "@playwright/test";
import path from "node:path";
test("build, adjust, preview, place, undo and reuse a rig with native persistence", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rig builder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rig builder", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Place rig in scene", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Load Louis artwork", exact: true })
    .click();
  await expect(
    dialog.getByText("All body slots assigned · ready to place", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Character name", exact: true })
    .fill("Rig builder test");
  await dialog
    .getByRole("spinbutton", { name: "Pivot X", exact: true })
    .fill("0.43");
  await dialog
    .getByRole("spinbutton", { name: "Upper arm length", exact: true })
    .fill("170");
  await dialog
    .getByRole("button", { name: "Move hand R", exact: true })
    .press("ArrowUp");
  await dialog
    .getByRole("combobox", { name: "Preview action", exact: true })
    .selectOption("walk");
  await dialog
    .getByRole("button", { name: "Play rig preview", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Pause rig preview", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("builder.png") });
  await dialog
    .getByRole("button", { name: "Pause rig preview", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Place rig in scene", exact: true })
    .click();
  const read = () =>
    page.evaluate(() =>
      JSON.parse(JSON.stringify((window as any).__motion.getState().project)),
    );
  let p = await read();
  expect(p.rigTemplates).toHaveLength(1);
  expect(p.scenes[0].layers[0].props.rigRegistration.head.anchorX).toBe(0.43);
  expect(p.scenes[0].layers[0].props.upperArmLength).toBe(170);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await read()).rigTemplates).toHaveLength(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Add saved rig Rig builder test",
      exact: true,
    })
    .click();
  p = await read();
  expect(p.scenes[0].layers).toHaveLength(2);
  const saved = await request.post("/api/save", {
    data: { folder: "Rig Builder Test.motion", project: p },
  });
  expect(saved.ok()).toBeTruthy();
  const reopened = await request.get(
    "/api/project?folder=Rig%20Builder%20Test.motion",
  );
  const body = await reopened.json();
  expect(body.rigTemplates[0].props.rigDimensions.upperArmLength).toBe(170);
});

test("imports replacement artwork and records pivot and joint drags", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rig builder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rig builder", exact: true });
  await dialog
    .getByRole("button", { name: "Load Louis artwork", exact: true })
    .click();
  await expect(
    dialog.getByText("All body slots assigned · ready to place", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("assets/louis-animation-pack/parts/head.png"));
  await expect(
    dialog.getByRole("combobox", { name: "Slot artwork", exact: true }),
  ).toContainText("head.png");
  const art = dialog.locator('canvas[aria-label="Artwork pivot editor"]');
  const box = (await art.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.85);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.78, {
    steps: 4,
  });
  await page.mouse.up();
  const pivot = Number(
    await dialog
      .getByRole("spinbutton", { name: "Pivot X", exact: true })
      .inputValue(),
  );
  expect(pivot).toBeGreaterThan(0.5);
  const wrist = dialog.getByRole("button", {
      name: "Move hand R",
      exact: true,
    }),
    w = (await wrist.boundingBox())!;
  await page.mouse.move(w.x + w.width / 2, w.y + w.height / 2);
  await page.mouse.down();
  await page.mouse.move(w.x + w.width / 2 + 15, w.y + w.height / 2 - 10, {
    steps: 4,
  });
  await page.mouse.up();
  await dialog
    .getByRole("button", { name: "Place rig in scene", exact: true })
    .click();
  const p = await page.evaluate(() =>
    JSON.parse(JSON.stringify((window as any).__motion.getState().project)),
  );
  const rig = p.scenes[0].layers[0];
  expect(
    p.assets.find((a: any) => a.id === rig.props.rigAssets.head).originalName,
  ).toBe("head.png");
  expect(rig.props.rigRegistration.head.anchorX).toBeCloseTo(pivot, 2);
  expect(rig.props.handRX).toBeGreaterThan(671);
  await page.getByRole("button", { name: "Rig builder", exact: true }).click();
  await dialog
    .getByRole("spinbutton", { name: "Pivot X", exact: true })
    .fill("0.1");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const after = await page.evaluate(() =>
    JSON.parse(JSON.stringify((window as any).__motion.getState().project)),
  );
  expect(after).toEqual(p);
});
