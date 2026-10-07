import { defineConfig } from "@playwright/test";
import path from "node:path";
import { TEST_PROJECT_ROOT } from "./tests/paths";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1440, height: 960 },
    headless: true,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node --import tsx server/index.ts",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: "4175",
      MOTION_PROJECTS_DIR: TEST_PROJECT_ROOT,
      MOTION_FFMPEG:
        process.env.MOTION_FFMPEG ||
        path.resolve("node_modules/ffmpeg-static/ffmpeg"),
    },
  },
});
