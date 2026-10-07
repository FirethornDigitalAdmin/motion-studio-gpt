import { test, expect } from "@playwright/test";
import path from "node:path";
test("moving image parts preserve opaque pixels across their joints", async ({
  page,
}) => {
  await page.goto("/");
  const field = async (name: string, value: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(value));
    await el.press("Tab");
  };
  await page
    .getByRole("button", { name: "⚙ Project settings", exact: true })
    .click();
  await field("Canvas width", 160);
  await field("Canvas height", 160);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByTestId("asset-import")
    .setInputFiles(path.resolve("tests/fixtures/solid.svg"));
  await page
    .getByRole("button", { name: "Place solid.svg", exact: true })
    .click();
  await field("Width", 160);
  await field("Height", 160);
  await page
    .getByRole("checkbox", { name: "Moving parts", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Moving arm", exact: true }).check();
  await field("Head angle", 4);
  await field("Arm angle", -4);
  const p = await page.evaluate(
    () => (window as any).__motion.getState().project,
  );
  const render = await page.context().newPage();
  await render.goto("/render");
  await render.waitForFunction(() => (window as any).__renderer);
  await render.evaluate(
    async (p) => (window as any).__renderer.prepare(p, ""),
    p,
  );
  const pixels = Buffer.from(
    await render.evaluate(() => (window as any).__renderer.frame(1)),
    "base64",
  );
  let darkest = 255;
  for (let y = 2; y < 158; y++)
    for (let x = 2; x < 158; x++) {
      const i = (y * 160 + x) * 4;
      const n = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (n < darkest) {
        darkest = n;
      }
    }

  expect(darkest).toBeGreaterThanOrEqual(254);
});
