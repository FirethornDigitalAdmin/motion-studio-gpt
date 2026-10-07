import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { rm, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Project } from "../src/model";
import { audioExportArgs } from "./audio";
export function ffmpegPath() {
  return process.env.MOTION_FFMPEG || "ffmpeg";
}
export async function checkFfmpeg() {
  const proc = spawn(ffmpegPath(), ["-version"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    proc.on("error", () =>
      reject(
        new Error(
          'ffmpeg was not found. Windows: winget install Gyan.FFmpeg, then reopen your terminal. Render a saved project with: npm run render -- "<projectFolder>" "<out.mp4>"',
        ),
      ),
    );
    proc.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error("ffmpeg could not start. Check MOTION_FFMPEG or PATH."),
          ),
    );
  });
}
export async function renderVideo(
  project: Project,
  folder: string,
  out: string,
  origin: string,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  await checkFfmpeg();
  if (project.settings.width % 2 || project.settings.height % 2)
    throw new Error(
      "MP4 requires even width and height. Choose even pixel dimensions in Project settings.",
    );
  if (existsSync(out))
    throw new Error("Output already exists. Choose a new output filename.");
  const browser = await chromium.launch({ headless: true });
  const temp = out + ".rendering.mp4";
  let ff: ReturnType<typeof spawn> | undefined;
  let ffDone: Promise<number | null> | undefined;
  let errorLog = "";
  const cancel = () => {
    ff?.kill();
    void browser.close();
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new Error("Cancelled");
    const page = await browser.newPage();
    await page.goto(origin + "/render");
    await page.waitForFunction(() => !!(window as any).__renderer);
    await page.evaluate(
      async ({ project, folder }) => {
        await (window as any).__renderer.prepare(project, folder);
      },
      { project, folder },
    );
    const { width, height, fps, durationSec } = project.settings;
    const projectRoot = process.env.MOTION_PROJECTS_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../projects");
    const audioFolder = path.join(projectRoot, folder || ".imports");
    ff = spawn(
      ffmpegPath(),
      [
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgba",
        "-video_size",
        `${width}x${height}`,
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        ...audioExportArgs(project, audioFolder, !folder),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "16",
        "-movflags",
        "+faststart",
        temp,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    ffDone = new Promise((resolve, reject) => {
      ff!.once("error", reject);
      ff!.once("close", resolve);
    });
    ff.stderr!.on(
      "data",
      (d) => (errorLog = (errorLog + d.toString()).slice(-4000)),
    );
    ff.stdin!.on("error", () => {});
    const frames = Math.ceil(durationSec * fps);
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new Error("Cancelled");
      const encoded = await page.evaluate(
        (t) => (window as any).__renderer.frame(t),
        i / fps,
      );
      const data = Buffer.from(encoded, "base64");
      if (!ff.stdin!.write(data))
        await Promise.race([
          once(ff.stdin!, "drain"),
          ffDone.then(() => {
            throw new Error(errorLog || "Encoder stopped");
          }),
        ]);
      onProgress((i + 1) / frames);
    }
    ff.stdin!.end();
    const code = await ffDone;
    if (code !== 0) throw new Error(errorLog || "ffmpeg failed");
    if (signal.aborted) throw new Error("Cancelled");
    await rename(temp, out);
  } catch (e) {
    ff?.kill();
    await ffDone?.catch(() => {});
    await rm(temp, { force: true });
    throw e;
  } finally {
    signal.removeEventListener("abort", cancel);
    await browser.close();
  }
}
