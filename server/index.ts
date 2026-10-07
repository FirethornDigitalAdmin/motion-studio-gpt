import express from "express";
import multer from "multer";
import archiver from "archiver";
import unzipper from "unzipper";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  rename,
  rm,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "node:http";
import { projectSchema, type Project } from "../src/model";
import { checkFfmpeg, renderVideo } from "./render";
import { analyseAudio } from "./audio";
import { installEditorApi } from "./editorApi";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function startServer(port = Number(process.env.PORT || 4173)) {
  const app = express();
  const projectRoot = path.resolve(
    process.env.MOTION_PROJECTS_DIR || path.join(root, "projects"),
  );
  const cache = path.join(projectRoot, ".imports");
  await mkdir(cache, { recursive: true });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
  });
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return res.status(403).json({ error: "Local connections only" });
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      !["http://" + host].includes(req.headers.origin)
    )
      return res
        .status(403)
        .json({ error: "Cross-origin writes are not allowed" });
    next();
  });
  app.use(express.json({ limit: "32mb" }));
  installEditorApi(app);
  const route =
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);
  const safeFolder = (name: string) => {
    if (!/^[\w .-]+\.motion$/.test(name) || name.startsWith("."))
      throw new Error(
        "Choose a project name using letters, numbers, spaces or dashes.",
      );
    return path.join(projectRoot, name);
  };
  app.get(
    "/api/projects",
    route(async (_req, res) => {
      res.json(
        (await readdir(projectRoot, { withFileTypes: true }))
          .filter((d) => d.isDirectory() && d.name.endsWith(".motion"))
          .map((d) => d.name),
      );
    }),
  );
  app.post(
    "/api/character-library",
    route(async (req, res) => {
      const pack = path.join(root, "assets/louis-animation-pack");
      const catalog = JSON.parse(
        await readFile(path.join(pack, "production/catalog.json"), "utf8"),
      );
      const item = String(req.body.item);
      const isRig = item === "louis" || item === "louis-clean";
      const entry = catalog.find((c: { id: string }) => c.id === item);
      if (!entry) throw new Error("Unknown character-library item");
      let files: Record<
        string,
        {
          file: string;
          crop?: { x: number; y: number; width: number; height: number };
        }
      > = isRig
        ? JSON.parse(
            await readFile(path.join(pack, "parts/index.json"), "utf8"),
          )
        : { [item]: { file: entry.file } };
      if (item === "louis")
        files = {
          ...files,
          ...JSON.parse(
            await readFile(
              path.join(pack, "production/parts/index.json"),
              "utf8",
            ),
          ),
        };
      if (item === "louis-clean")
        files = JSON.parse(
          await readFile(path.join(pack, "clean-v3/parts/index.json"), "utf8"),
        );
      const crops: Record<string, unknown> = {};
      const assets = [];
      const slots: Record<string, string> = {};
      for (const [slot, source] of Object.entries(files)) {
        const bytes = await readFile(path.join(pack, source.file));
        const hash = createHash("sha256").update(bytes).digest("hex");
        const ext = path.extname(source.file);
        const filename = hash + ext;
        await writeFile(path.join(cache, filename), bytes);
        if (req.body.folder) {
          const target = path.join(
            safeFolder(String(req.body.folder)),
            "assets",
          );
          await mkdir(target, { recursive: true });
          await writeFile(path.join(target, filename), bytes);
        }
        const assetId =
          (item === "louis-clean" ? "louis-clean-" : "louis-library-") + slot;
        slots[slot] = assetId;
        if (source.crop) crops[slot] = source.crop;
        assets.push({
          id: assetId,
          originalName: isRig ? "Louis · " + slot + ext : entry.name + ext,
          relativePath: "assets/" + filename,
          type: "image",
          hash,
        });
      }
      res.json({
        assets,
        slots,
        crops,
        rigVersion: item === "louis-clean" ? 3 : 2,
        ...entry,
      });
    }),
  );
  app.get(
    "/api/project",
    route(async (req, res) => {
      const folder = safeFolder(String(req.query.folder));
      res.json(
        projectSchema.parse(
          JSON.parse(await readFile(path.join(folder, "project.json"), "utf8")),
        ),
      );
    }),
  );
  app.post(
    "/api/save",
    route(async (req, res) => {
      const project = projectSchema.parse(req.body.project);
      const folderName = String(req.body.folder);
      const folder = safeFolder(folderName);
      await mkdir(path.join(folder, "assets"), { recursive: true });
      for (const a of project.assets) {
        const dest = path.join(folder, a.relativePath);
        try {
          await readFile(dest);
        } catch {
          try {
            await copyFile(
              path.join(cache, path.basename(a.relativePath)),
              dest,
            );
          } catch {
            if (req.body.sourceFolder)
              await copyFile(
                path.join(safeFolder(req.body.sourceFolder), a.relativePath),
                dest,
              );
          }
        }
      }
      const temp = path.join(folder, "project.json.tmp");
      await writeFile(temp, JSON.stringify(project, null, 2));
      await rename(temp, path.join(folder, "project.json"));
      res.json({ folder: folderName });
    }),
  );
  app.post(
    "/api/import",
    upload.array("files"),
    route(async (req, res) => {
      const assets = [];
      for (const f of req.files as Express.Multer.File[]) {
        const ext = path.extname(f.originalname).toLowerCase();
        if (
          ![
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".svg",
            ".ttf",
            ".otf",
            ".woff2",
            ".mp3",
            ".wav",
            ".m4a",
            ".ogg",
            ".flac",
          ].includes(ext)
        )
          throw new Error(
            "Supported imports: images, fonts, MP3, WAV, M4A, OGG and FLAC.",
          );
        const hash = createHash("sha256").update(f.buffer).digest("hex");
        const filename = hash + ext;
        await writeFile(path.join(cache, filename), f.buffer);
        if (req.body.folder) {
          const assetFolder = path.join(safeFolder(req.body.folder), "assets");
          await mkdir(assetFolder, { recursive: true });
          await writeFile(path.join(assetFolder, filename), f.buffer);
        }
        assets.push({
          id: randomUUID(),
          originalName: f.originalname,
          relativePath: "assets/" + filename,
          type: [".ttf", ".otf", ".woff2"].includes(ext)
            ? "font"
            : [".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)
              ? "audio"
              : "image",
          hash,
          ...([".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)
            ? await analyseAudio(path.join(cache, filename))
            : {}),
        });
      }
      res.json(assets);
    }),
  );
  app.get(
    "/api/asset",
    route(async (req, res) => {
      const rel = String(req.query.path);
      if (!/^assets\/[\w.-]+$/.test(rel)) throw new Error("Invalid asset path");
      const folder = req.query.folder
        ? safeFolder(String(req.query.folder))
        : null;
      const location = folder
        ? path.join(folder, rel)
        : path.join(cache, path.basename(rel));
      res.set("X-Content-Type-Options", "nosniff");
      if (location.endsWith(".svg"))
        res.set(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'",
        );
      res.sendFile(location, { dotfiles: "allow" });
    }),
  );
  app.get(
    "/api/zip",
    route(async (req, res) => {
      const folder = safeFolder(String(req.query.folder));
      res.attachment(path.basename(folder) + ".zip");
      const zip = archiver("zip");
      zip.on("error", (e) => res.destroy(e));
      zip.pipe(res);
      zip.file(path.join(folder, "project.json"), { name: "project.json" });
      const project = projectSchema.parse(
        JSON.parse(await readFile(path.join(folder, "project.json"), "utf8")),
      );
      for (const asset of project.assets)
        zip.file(path.join(folder, asset.relativePath), {
          name: asset.relativePath,
        });
      await zip.finalize();
    }),
  );
  app.post(
    "/api/unzip",
    upload.single("file"),
    route(async (req, res) => {
      if (!req.file) throw new Error("Choose a project zip.");
      const zip = await unzipper.Open.buffer(req.file.buffer);
      const json = zip.files.find((f) => f.path === "project.json");
      if (!json)
        throw new Error("The zip must contain project.json at its root.");
      const project = projectSchema.parse(
        JSON.parse((await json.buffer()).toString()),
      );
      const suffix = randomUUID().slice(0, 8);
      const folderName =
        project.name.replace(/[^\w -]/g, "").slice(0, 80) +
        "-" +
        suffix +
        ".motion";
      const folder = safeFolder(folderName);
      await mkdir(path.join(folder, "assets"), { recursive: true });
      for (const a of project.assets) {
        const entry = zip.files.find((f) => f.path === a.relativePath);
        if (entry) {
          const buffer = await entry.buffer();
          if (buffer.length > 100 * 1024 * 1024)
            throw new Error("Asset too large");
          if (createHash("sha256").update(buffer).digest("hex") !== a.hash)
            throw new Error("Asset hash mismatch");
          await writeFile(path.join(folder, a.relativePath), buffer);
        }
      }
      await writeFile(
        path.join(folder, "project.json"),
        JSON.stringify(project, null, 2),
      );
      res.json({ project, folder: folderName });
    }),
  );
  const jobs = new Map<
    string,
    {
      progress: number;
      status: string;
      error?: string;
      output?: string;
      controller: AbortController;
    }
  >();
  app.get(
    "/api/export/check",
    route(async (_req, res) => {
      await checkFfmpeg();
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/export",
    route(async (req, res) => {
      const project = projectSchema.parse(req.body.project);
      await checkFfmpeg();
      const folder = String(req.body.folder || "");
      if (folder) safeFolder(folder);
      const id = randomUUID();
      const output = path.join(
        projectRoot,
        project.name.replace(/[^\w -]/g, "") + "-" + id.slice(0, 8) + ".mp4",
      );
      const job = {
        progress: 0,
        status: "rendering",
        controller: new AbortController(),
        output,
      };
      jobs.set(id, job);
      void renderVideo(
        project,
        folder,
        output,
        `http://127.0.0.1:${port}`,
        job.controller.signal,
        (n) => (job.progress = n),
      )
        .then(() => (job.status = "complete"))
        .catch((e) => {
          job.status = job.controller.signal.aborted ? "cancelled" : "failed";
          (job as any).error = e.message;
        });
      res.json({ id });
    }),
  );
  app.get("/api/export/:id", (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j) return res.status(404).json({ error: "Job not found" });
    res.json({
      progress: j.progress,
      status: j.status,
      error: j.error,
      output: j.status === "complete" ? path.basename(j.output!) : undefined,
    });
  });
  app.post("/api/export/:id/cancel", (req, res) => {
    jobs.get(req.params.id)?.controller.abort();
    res.json({ ok: true });
  });
  app.get("/api/export/:id/download", (req, res) => {
    const j = jobs.get(req.params.id);
    if (j?.status !== "complete") return res.status(404).end();
    res.download(j.output!, path.basename(j.output!), { dotfiles: "allow" });
  });
  const server = createHttpServer(app);
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: err.message || "Request failed" });
    },
  );
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Motion Studio http://127.0.0.1:${port}\nProjects: ${projectRoot}`,
    ),
  );
  return { server, vite, projectRoot };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void startServer();
