import { test, expect } from "@playwright/test";
import path from "node:path";
test("camera cuts, sprite gestures and selection remain deterministic after seeking", async ({
  page,
}) => {
  await page.goto("/");
  const field = async (name: string, n: number) => {
    const el = page.getByRole("spinbutton", { name, exact: true });
    await el.fill(String(n));
    await el.press("Tab");
  };
  await page
    .getByTestId("asset-import")
    .setInputFiles(path.resolve("tests/fixtures/image.svg"));
  await page.getByRole("button", { name: "Place image.svg" }).click();
  await field("Width", 800);
  await field("Height", 600);
  await page
    .getByRole("checkbox", { name: "Moving parts", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Keyframe Head angle", exact: true })
    .click();
  await field("Playhead time", 2);
  await field("Head angle", 8);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: /Scene 1.*15.0s/ }).click();
  await page
    .getByRole("button", { name: "Add camera shot", exact: true })
    .click();
  await field("Shot start", 1);
  await field("Shot duration", 3);
  await field("Focus X", 1920);
  await field("Focus Y", 1080);
  await field("Shot zoom", 2);
  await field("End zoom", 2.5);
  const frame = () =>
    page
      .locator('canvas[aria-label="Composition preview"]')
      .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await field("Playhead time", 2);
  const close = await frame();
  await field("Playhead time", 0);
  expect(await frame()).not.toBe(close);
  await field("Playhead time", 2);
  expect(await frame()).toBe(close);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("button", { name: "▧ image.svg", exact: true }).click();
  const box = await page.locator(".selection").boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  const x = await page
    .getByRole("spinbutton", { name: "X", exact: true })
    .inputValue();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2);
  await page.mouse.up();
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "X", exact: true })
        .inputValue(),
    ),
  ).toBeGreaterThan(Number(x));
});
