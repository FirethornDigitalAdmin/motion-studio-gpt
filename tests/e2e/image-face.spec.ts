import { test, expect } from "@playwright/test";
import path from "node:path";
test("registered sprite eyelids occlude pupils and survive native save", async ({
  page,
}) => {
  await page.goto("/");
  const field = async (name: string, value: number) => {
    const input = page.getByRole("spinbutton", { name, exact: true });
    await input.fill(String(value));
    await input.press("Tab");
  };
  await page
    .getByRole("button", { name: "⚙ Project settings", exact: true })
    .click();
  await field("Canvas width", 320);
  await field("Canvas height", 480);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByTestId("asset-import")
    .setInputFiles(path.resolve("assets/northern-dev/louis-cartoon.png"));
  await page
    .getByRole("button", { name: "Place louis-cartoon.png", exact: true })
    .click();
  await field("Width", 320);
  await field("Height", 480);
  await field("X", 160);
  await field("Y", 240);
  await page
    .getByRole("checkbox", { name: "Facial controls", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Register face drawing", exact: true })
    .selectOption("Louis portrait");
  await page
    .getByRole("checkbox", { name: "Natural blinking", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Moving parts", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Continuous joint motion", exact: true })
    .check();
  const render = await page.context().newPage();
  await render.goto("/render");
  await render.waitForFunction(() => (window as any).__renderer);
  const frame = async () => {
    const p = await page.evaluate(
      () => (window as any).__motion.getState().project,
    );
    await render.evaluate(
      async (p) => (window as any).__renderer.prepare(p, ""),
      p,
    );
    return Buffer.from(
      await render.evaluate(() => (window as any).__renderer.frame(0)),
      "base64",
    );
  };
  const whites = (bytes: Buffer) => {
    let count = 0;
    for (let y = 48; y < 79; y++)
      for (let x = 135; x < 189; x++) {
        const i = (y * 320 + x) * 4;
        if (bytes[i] > 235 && bytes[i + 1] > 235 && bytes[i + 2] > 235) count++;
      }
    return count;
  };
  const open = whites(await frame());
  expect(open).toBeGreaterThan(200);
  await field("Eyelid closure", 0.5);
  const half = whites(await frame());
  expect(half).toBeGreaterThan(open * 0.1);
  expect(half).toBeLessThan(open * 0.8);
  await field("Eyelid closure", 1);
  expect(whites(await frame())).toBe(0);
  const name = "Image face " + Date.now();
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
  expect(saved.scenes[0].layers[0].props.facialEnabled).toBe(true);
  expect(
    Object.keys(saved.scenes[0].layers[0].props.facialDrawings),
  ).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(name + ".motion") })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__motion.getState().project),
  ).toEqual(saved);
  await render.close();
});
