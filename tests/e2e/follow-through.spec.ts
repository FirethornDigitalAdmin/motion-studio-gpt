import { test, expect } from "@playwright/test";
test("follow-through controls, bake undo and native persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Louis rig", exact: true })
    .click();
  const field = async (name: string, value: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(value));
    await el.press("Tab");
  };
  await page
    .getByRole("button", { name: "Record current pose", exact: true })
    .click();
  await field("Playhead time", 1);
  await page.getByText("Pose controls", { exact: true }).click();
  await field("Head angle", 15);
  await page.getByText("Follow-through", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Enable follow-through", exact: true })
    .check();
  await field("Follow-through strength", 0.8);
  const project = () =>
    page.evaluate(() => (window as any).__motion.getState().project);
  const before = await project();
  await page.getByRole("button", { name: "Motion tools", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Graph property", exact: true })
    .selectOption("headAngle");
  await expect(
    page.getByLabel("Follow-through result", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bake follow-through to keys", exact: true })
    .click();
  const baked = await project(),
    actor = baked.scenes[0].layers[0];
  expect(actor.props.followThrough.enabled).toBe(false);
  expect(actor.keyframes.headAngle.length).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await project()).toEqual(before);
  const name = "Follow-through " + Date.now();
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
  expect(await project()).toEqual(saved);
});
