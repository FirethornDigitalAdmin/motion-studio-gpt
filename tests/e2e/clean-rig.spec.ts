import { test, expect } from "@playwright/test";
test("clean character library, registered views and artwork refresh preserve acting", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Louis clean rig", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Head view", exact: true }),
  ).toBeVisible();
  const state = () =>
    page.evaluate(() => (window as any).__motion.getState().project);
  let p = await state(),
    l = p.scenes[0].layers[0];
  expect(l.props.rigVersion).toBe(3);
  expect(Object.keys(l.props.rigAssets)).toHaveLength(57);
  expect(
    new Set(
      p.assets
        .filter((a: any) => a.originalName.includes("mouth_"))
        .map((a: any) => a.hash),
    ).size,
  ).toBe(15);
  const field = page.getByRole("spinbutton", {
    name: "Playhead time",
    exact: true,
  });
  await field.fill("1");
  await field.press("Tab");
  await page
    .getByRole("combobox", { name: "Head view", exact: true })
    .selectOption("profile");
  await page.getByRole("button", { name: "Record blink", exact: true }).click();
  p = await state();
  l = p.scenes[0].layers[0];
  const keys = structuredClone(l.keyframes);
  expect(keys.rigView).toMatchObject([
    { time: 0, value: "three-quarter" },
    { time: 1, value: "profile" },
  ]);
  await page
    .getByRole("button", { name: "♙ Character library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Update selected rig", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  l = (await state()).scenes[0].layers[0];
  expect(l.props.rigVersion).toBe(3);
  expect(l.keyframes).toEqual(keys);
  await page.getByRole("button", { name: "Rig builder", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply to selected rig", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await state()).rigTemplates.some(
      (t: any) => t.name === "Louis clean rig" && t.props.rigVersion === 3,
    ),
  ).toBe(true);
});
