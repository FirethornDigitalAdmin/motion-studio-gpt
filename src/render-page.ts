import { renderFrame, loadResources, type RenderContext } from "./renderer";
import { projectSchema, type Project } from "./model";
const canvas = document.createElement("canvas");
document.body.replaceChildren(canvas);
let project: Project;
(window as any).__renderer = {
  prepare: async (p: Project, folder: string) => {
    project = projectSchema.parse(p);
    canvas.width = p.settings.width;
    canvas.height = p.settings.height;
    const r = await loadResources(
      p,
      (path) => "/api/asset?" + new URLSearchParams({ folder, path }),
    );
    if (r.missing.length)
      throw new Error("Missing assets: " + r.missing.join(", "));
    (canvas.getContext("2d") as RenderContext).resources = r.images;
  },
  frame: (time: number) => {
    const ctx = canvas.getContext("2d") as RenderContext;
    renderFrame(project, time, ctx, 1);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let s = "";
    for (let i = 0; i < data.length; i += 32768)
      s += String.fromCharCode(...data.subarray(i, i + 32768));
    return btoa(s);
  },
  png: (time: number) => {
    renderFrame(project, time, canvas.getContext("2d") as RenderContext, 1);
    return canvas.toDataURL("image/png");
  },
};
