import { it, expect } from "vitest";
import { checkFfmpeg } from "../server/render";
it("missing ffmpeg gives install steps and a CLI command", async () => {
  const previous = process.env.MOTION_FFMPEG;
  process.env.MOTION_FFMPEG = "/does-not-exist/motion-ffmpeg";
  try {
    await expect(checkFfmpeg()).rejects.toThrow(/winget install Gyan.FFmpeg/);
    await expect(checkFfmpeg()).rejects.toThrow(/npm run render --/);
  } finally {
    if (previous === undefined) delete process.env.MOTION_FFMPEG;
    else process.env.MOTION_FFMPEG = previous;
  }
});
