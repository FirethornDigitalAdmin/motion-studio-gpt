import path from "node:path";
import { readFile, mkdtemp, copyFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import { projectSchema } from "../src/model";
import { renderVideo } from "./render";
import { startServer } from "./index";
const [folder, out] = process.argv.slice(2);
if (!folder || !out) {
  console.error("Usage: npm run render -- <projectFolder> <out.mp4>");
  process.exit(1);
}
const temp = await mkdtemp(path.join(os.tmpdir(), "motion-render-"));
let app: Awaited<ReturnType<typeof startServer>> | undefined;
try {
  const project = projectSchema.parse(
    JSON.parse(await readFile(path.join(folder, "project.json"), "utf8")),
  );
  const target = path.join(temp, "Render.motion");
  await mkdir(path.join(target, "assets"), { recursive: true });
  await copyFile(
    path.join(folder, "project.json"),
    path.join(target, "project.json"),
  );
  for (const a of project.assets)
    await copyFile(
      path.join(folder, a.relativePath),
      path.join(target, a.relativePath),
    );
  process.env.MOTION_PROJECTS_DIR = temp;
  const port = Number(process.env.MOTION_RENDER_PORT || 4174);
  app = await startServer(port);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  await renderVideo(
    project,
    "Render.motion",
    path.resolve(out),
    `http://127.0.0.1:${port}`,
    controller.signal,
    (p) => process.stdout.write(`\rRendering ${Math.round(p * 100)}%`),
  );
  console.log("\nSaved " + path.resolve(out));
} catch (e) {
  console.error("\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  if (app) {
    await app.vite.close();
    await new Promise<void>((r) => app!.server.close(() => r()));
  }
  await rm(temp, { recursive: true, force: true });
}
