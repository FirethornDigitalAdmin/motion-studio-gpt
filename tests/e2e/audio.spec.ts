import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const ff = path.resolve("node_modules/ffmpeg-static/ffmpeg");
const tone = path.resolve("tests/fixtures/tone.wav");
test.beforeAll(() => {
  const result = spawnSync(ff,["-y","-f","lavfi","-i","sine=frequency=800:duration=1.5",tone]);
  expect(result.status).toBe(0);
});
test("audio imports, mouth sync, seek playback and encoded cue timing", async ({page,request}) => {
  // Observe actual Web Audio scheduling without changing application state.
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).__scheduledAudio = [];
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<typeof start>) {
      (window as any).__scheduledAudio.push({args,state:this.context.state});
      return start.apply(this,args);
    };
  });
  await page.goto("/");
  const field = async (name:string,value:number) => {
    const input = page.getByRole("spinbutton",{name,exact:true}); await input.fill(String(value)); await input.press("Tab");
  };
  await page.getByRole("button",{name:"⚙ Project settings"}).click();
  await field("Project duration",2); await field("Canvas width",160); await field("Canvas height",100); await field("Frame rate",10);
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await page.getByTestId("asset-import").setInputFiles([tone,path.resolve("tests/fixtures/image.svg")]);
  await page.getByRole("button",{name:"Place image.svg"}).click();
  await field("Width",100); await field("Height",80);
  await page.getByRole("textbox",{name:"Actor",exact:true}).fill("Louis");
  await page.getByRole("checkbox",{name:"Talking mouth"}).check();
  await field("Mouth X",0.5); await field("Mouth Y",0.5);
  await page.getByRole("button",{name:"Place tone.wav"}).click();
  await page.getByRole("textbox",{name:"Actor",exact:true}).fill("Louis");
  await field("Start",0.5); await field("Duration",0.8); await field("Audio offset",0.2);
  await expect.poll(() => page.evaluate(() => (window as any).__motion.getState().audioBuffers.size)).toBe(1);
  await field("Playhead time",0.1);
  const silent = await page.locator('canvas[aria-label="Composition preview"]').evaluate((el:HTMLCanvasElement) => el.toDataURL());
  await field("Playhead time",0.8);
  const speaking = await page.locator('canvas[aria-label="Composition preview"]').evaluate((el:HTMLCanvasElement) => el.toDataURL());
  expect(speaking).not.toBe(silent);
  await field("Playhead time",1.7);
  expect(await page.locator('canvas[aria-label="Composition preview"]').evaluate((el:HTMLCanvasElement) => el.toDataURL())).toBe(silent);
  await field("Playhead time",0.8);
  await page.getByRole("button",{name:"Play",exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).__scheduledAudio.length)).toBeGreaterThan(0);
  const schedule = await page.evaluate(() => (window as any).__scheduledAudio[0]);
  expect(schedule.state).toBe("running"); expect(schedule.args[1]).toBeCloseTo(0.5,1);
  await page.getByRole("button",{name:"Pause",exact:true}).click();
  await page.getByRole("button",{name:"↑ Export MP4"}).click(); await page.getByRole("button",{name:"Start export"}).click();
  const download = page.getByRole("link",{name:"Download MP4"}); await expect(download).toBeVisible({timeout:30000});
  const response = await request.get((await download.getAttribute("href"))!);
  const movie = path.resolve("test-results/audio-timing.mp4"); await writeFile(movie,await response.body());
  const pcm = spawnSync(ff,["-v","error","-i",movie,"-vn","-f","f32le","-ac","1","-ar","16000","pipe:1"]);
  expect(pcm.status,pcm.stderr.toString()).toBe(0);
  const rms = (time:number) => {let n=0; for(let i=Math.round(time*16000);i<Math.round((time+0.1)*16000);i++)n+=pcm.stdout.readFloatLE(i*4)**2; return Math.sqrt(n/1600);};
  expect(rms(0.2)).toBeLessThan(0.001); expect(rms(0.7)).toBeGreaterThan(0.04); expect(rms(1.6)).toBeLessThan(0.001);
});
