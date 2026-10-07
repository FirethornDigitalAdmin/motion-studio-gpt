import { test, expect } from "@playwright/test";
async function field(p: any, label: string, n: number) {
  await p.getByRole("spinbutton", { name: label, exact: true }).fill(String(n));
  await p.getByRole("spinbutton", { name: label, exact: true }).press("Tab");
}
test("colour, geometry, pivots and discrete text keyframes; offline edits and close warning", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4175") &&
      !r.url().startsWith("data:")
    )
      remote.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  await page.getByLabel("Layer colour").fill("#000000");
  await page.getByLabel("Layer colour").press("Tab");
  await page
    .getByRole("button", { name: "Keyframe Colour", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keyframe Width", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keyframe Anchor X", exact: true })
    .click();
  await page.evaluate(() => window.__motion.getState().setTime(2));
  await page.getByLabel("Layer colour").fill("#ffffff");
  await page.getByLabel("Layer colour").press("Tab");
  await field(page, "Width", 1000);
  await field(page, "Anchor X", 1);
  await page.evaluate(() => window.__motion.getState().setTime(1));
  await expect(page.getByLabel("Layer colour")).toHaveValue("#808080");
  await expect(
    page.getByRole("spinbutton", { name: "Width", exact: true }),
  ).toHaveValue("900");
  await expect(
    page.getByRole("spinbutton", { name: "Anchor X", exact: true }),
  ).toHaveValue("0.75");
  await page
    .getByRole("button", { name: "Text", exact: false })
    .first()
    .click();
  await page.evaluate(() => window.__motion.getState().setTime(0));
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .fill("First");
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .press("Tab");
  await page
    .getByRole("button", { name: "Keyframe Text content", exact: true })
    .click();
  await page.evaluate(() => window.__motion.getState().setTime(2));
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .fill("Second");
  await page
    .getByRole("textbox", { name: "Text content", exact: true })
    .press("Tab");
  await page.evaluate(() => window.__motion.getState().setTime(1));
  await expect(
    page.getByRole("textbox", { name: "Text content", exact: true }),
  ).toHaveValue("First");
  await page.route("https://**", (route) => route.abort());
  await field(page, "Font size", 180);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Font size", exact: true }),
  ).toHaveValue("160");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .fill("200");
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "Font size", exact: true }),
  ).toHaveValue("180");
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("spinbutton", { name: "Font size", exact: true }),
  ).toHaveValue("200");
  await page
    .getByRole("spinbutton", { name: "Font size", exact: true })
    .press("Tab");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".ruler").click({ position: { x: 70, y: 10 } });
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.__motion.getState().time),
  ).toBeCloseTo(1, 4);
  expect(remote).toEqual([]);
  await expect(page).toHaveTitle(/^● /);
  const dialogPromise = page.waitForEvent("dialog");
  const reloading = page.reload();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  await reloading;
});
