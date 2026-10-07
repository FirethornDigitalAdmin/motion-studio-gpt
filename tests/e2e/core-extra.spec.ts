import { TEST_PROJECT_ROOT } from "../paths";
import { test, expect } from "@playwright/test";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const get = (p: any) => p.evaluate(() => window.__motion.getState().project);
async function field(p: any, label: string, n: number) {
  await p.getByRole("spinbutton", { name: label, exact: true }).fill(String(n));
  await p.getByRole("spinbutton", { name: label, exact: true }).press("Tab");
}
async function drag(
  page: any,
  locator: any,
  dx: number,
  dy = 0,
  shift = false,
) {
  const b = await locator.boundingBox();
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
    steps: 5,
  });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test("all import types load, byte hashes survive zip, missing assets relink", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const converted = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#98aabb";
    ctx.fillRect(0, 0, 32, 32);
    return {
      jpg: c.toDataURL("image/jpeg").split(",")[1],
      webp: c.toDataURL("image/webp").split(",")[1],
    };
  });
  await writeFile(
    "tests/fixtures/image.jpg",
    Buffer.from(converted.jpg, "base64"),
  );
  await writeFile(
    "tests/fixtures/image.webp",
    Buffer.from(converted.webp, "base64"),
  );
  await writeFile(
    "tests/fixtures/image.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#93b5d9"/></svg>',
  );
  const files = [
    "checker.png",
    "image.jpg",
    "image.webp",
    "image.svg",
    "Roboto.ttf",
    "SourceSans3.otf",
    "Fixture.woff2",
  ].map((f) => path.resolve("tests/fixtures", f));
  await page.getByTestId("asset-import").setInputFiles(files);
  await expect
    .poll(() => page.evaluate(() => window.__motion.getState().resources.size))
    .toBe(4);
  expect(await page.evaluate(() => window.__motion.getState().missing)).toEqual(
    [],
  );
  for (const font of ["Roboto", "SourceSans3", "Fixture"])
    expect(
      await page.evaluate(
        (font) => document.fonts.check(`16px "${font}"`),
        font,
      ),
    ).toBe(true);
  await page.getByRole("button", { name: "Place image.svg" }).click();
  const name = "ZIP-" + Date.now();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill(name);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save & download project zip" })
    .click();
  const download = await downloadPromise;
  const zip = path.resolve("test-results/project.motion.zip");
  await download.saveAs(zip);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const original = await get(page);
  for (const a of original.assets) {
    const bytes = await readFile(
      path.resolve(TEST_PROJECT_ROOT, name + ".motion", a.relativePath),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.hash);
    expect(bytes).toEqual(
      await readFile(path.resolve("tests/fixtures", a.originalName)),
    );
  }
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("zip-import").setInputFiles(zip);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await get(page)).toEqual(original);
  await expect
    .poll(() => page.evaluate(() => window.__motion.getState().resources.size))
    .toBe(4);
  // Removing both the saved copy and staged copy proves the missing-asset path.
  const folder = await page.evaluate(() => window.__motion.getState().folder);
  const a = original.assets.find((a: any) => a.originalName === "image.svg");
  await rm(path.resolve(TEST_PROJECT_ROOT, folder, a.relativePath));
  await rm(
    path.resolve(TEST_PROJECT_ROOT, ".imports", path.basename(a.relativePath)),
  );
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: folder, exact: false }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Assets", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Relink", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stage canvas")).toBeVisible();
  const choose = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Relink", exact: true }).click();
  await (await choose).setFiles("tests/fixtures/image.svg");
  await expect
    .poll(() => page.evaluate(() => window.__motion.getState().missing.length))
    .toBe(0);
  expect((await get(page)).scenes[0].layers[0].props.assetId).toBe(a.id);
});

test("drag handles, scene/layer boundaries, names, ordering, deletion, curve and one-step undo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Shape", exact: false })
    .first()
    .click();
  let p = await get(page),
    l = p.scenes[0].layers[0];
  await drag(
    page,
    page.getByRole("button", { name: "Scale selected layer" }),
    25,
    10,
    true,
  );
  expect((await get(page)).scenes[0].layers[0].scale).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes[0].layers[0].scale).toBe(1);
  await drag(
    page,
    page.getByRole("button", { name: "Rotate selected layer" }),
    35,
    0,
    true,
  );
  expect((await get(page)).scenes[0].layers[0].rotation % 15).toBe(0);
  expect((await get(page)).scenes[0].layers[0].rotation).not.toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes[0].layers[0].rotation).toBe(0);
  await drag(page, page.locator(".selection"), 35, 8, true);
  p = await get(page);
  expect(p.scenes[0].layers[0].x).toBeGreaterThan(l.x);
  expect(p.scenes[0].layers[0].y).toBe(l.y);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("textbox", { name: "Layer name" }).fill("Panel");
  await page.getByRole("textbox", { name: "Layer name" }).press("Tab");
  await page.getByLabel("Shape type", { exact: true }).selectOption("ellipse");
  await field(page, "Anchor X", 0.2);
  await page.getByLabel("Layer colour").fill("#ffcc88");
  await page
    .getByRole("button", { name: "Keyframe Scale", exact: true })
    .click();
  await page.getByLabel("Easing", { exact: true }).selectOption("bezier");
  await field(page, "X1", 0.4);
  expect(
    (await get(page)).scenes[0].layers[0].keyframes.scale[0].easing.x1,
  ).toBe(0.4);
  await page.getByLabel("Easing", { exact: true }).selectOption("ease-out");
  await page.locator(".layer-item summary").click();
  await page
    .locator(".layer-item")
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  expect((await get(page)).scenes[0].layers).toHaveLength(2);
  await page
    .locator("details[open]")
    .evaluateAll((ds) =>
      ds.forEach((d) => ((d as HTMLDetailsElement).open = false)),
    );
  await page.locator(".layer-item").first().locator("summary").click();
  await page
    .locator(".layer-item")
    .first()
    .getByRole("button", { name: "Send back", exact: true })
    .click();
  expect((await get(page)).scenes[0].layers[0].name).toBe("Panel copy");
  await page
    .locator("details[open]")
    .evaluateAll((ds) =>
      ds.forEach((d) => ((d as HTMLDetailsElement).open = false)),
    );
  const originalBar = page.getByTestId("bar-" + l.id);
  await drag(page, originalBar.locator(".left"), 35);
  expect(
    (await get(page)).scenes[0].layers.find((x: any) => x.id === l.id).start,
  ).toBeCloseTo(0.5, 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await drag(page, page.locator(".scene-block .right"), -70);
  expect((await get(page)).scenes[0].duration).toBeLessThan(15);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await drag(page, page.locator(".scene-block .left"), 70);
  expect((await get(page)).scenes[0].start).toBeCloseTo(1, 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  page.once("dialog", (d) => d.accept("Renamed scene"));
  await page.locator(".scene-item summary").click();
  await page
    .locator(".scene-item")
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  expect((await get(page)).scenes[0].name).toBe("Renamed scene");
  await page
    .locator("details[open]")
    .evaluateAll((ds) =>
      ds.forEach((d) => ((d as HTMLDetailsElement).open = false)),
    );
  await page.locator(".layer-item").first().locator("summary").click();
  await page
    .locator(".layer-item")
    .first()
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  expect((await get(page)).scenes[0].layers).toHaveLength(1);
  await page
    .locator("details[open]")
    .evaluateAll((ds) =>
      ds.forEach((d) => ((d as HTMLDetailsElement).open = false)),
    );
  await page.locator(".scene-item summary").click();
  await page
    .locator(".scene-item")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  expect((await get(page)).scenes).toHaveLength(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await get(page)).scenes).toHaveLength(1);
});

test("file drop and empty project produce no automatic export jobs", async ({
  page,
  request,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/export") && r.method() === "POST")
      calls.push(r.url());
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const file = new File(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="10"/></svg>',
      ],
      "drop.svg",
      { type: "image/svg+xml" },
    );
    const dt = new DataTransfer();
    dt.items.add(file);
    document
      .querySelector(".app")!
      .dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
      );
  });
  await expect(
    page.getByRole("button", { name: "Place drop.svg" }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  expect((await get(page)).scenes).toHaveLength(0);
});
