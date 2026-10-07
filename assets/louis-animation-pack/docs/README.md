# Louis animation pack

The approved wardrobe is **navy polo, beige chinos, plain white trainers**. The original supplied image is retained as provenance, but its charcoal trousers/grey shoes are superseded.

## Review

With Motion Studio running, open `http://127.0.0.1:4173/assets/louis-animation-pack/viewer/`.

The viewer also works independently: from this pack directory run `node scripts/serve.mjs`, then open `http://127.0.0.1:4176/viewer/`. This needs Node, but no install or network connection. It uses the same actual PNG parts and sampler as exports.

Play/pause, step frames, scrub, change speed, expression, gaze, mouth, hands, props and backgrounds. Select the six numbered combination clips. “Upper body override” can combine a gesture or carrying action with locomotion/posture. Reset restores the rest pose and clears overrides. Root motion is optional and can take the actor out of the review canvas.

## Motion Studio

Open the editor's **Open** menu and choose **Louis - Animation Pack Review.motion**. It contains the six combinations in a 3840×2160 composition. Its image layers, pivots, numeric keyframes and drawing switches are editable. Save/download/export as usual.

Individual clips are genuine version-1 `.motion` project folders under `native/`. To open one, copy its folder into Motion Studio's `projects/` library, or zip its `project.json` and `assets/` and use **Open → Import project zip**. They use a transparent 1536×1408 canvas at 24 fps. Do not put one `.motion` folder inside another. MP4 export has no alpha; use delivered PNGs for transparent production.

Motion Studio has no bone hierarchy/IK interface. Native clips contain **resolved cutout transforms**, not a native skeleton. The reusable hierarchy, analytic IK and layer-combination code are supplied separately in `rig/`. Custom rig/atlas JSON is explicitly custom and must not be described as Spine, Live2D, Unity or Godot rig data.

## Artwork and exports

- `source/model-sheet.png`: front, animated three-quarter reference, profile and rear; face/hand/shoe/clothing details and palette.
- `source/louis-layered.svg`: supported static SVG with named groups and embedded PNG parts. Groups/transforms are editable in an SVG editor; the drawings inside are raster, not editable vector paths. No PSD file is claimed.
- `parts/`: transparent production PNGs; `index.json` records source cell, crop and dimensions.
- `sheets/`: labelled expression, viseme, hands and interaction sheets assembled from production assets.
- `clips/`: individual clip descriptions and event metadata; `library.json` lists actual clips.
- `native/`: individual Motion Studio projects with originals and editable layer animation.
- `frames/<clip>/`: rendered transparent PNG sequences, 768×704 at 24 fps, fixed registration.
- `atlases/<clip>/`: atlas PNG pages and `atlas.json`. Maximum page size stays below 4096×4096. Frames are untrimmed, with padding/edge extrusion; metadata includes rectangles, canvas size, zero trim offsets, pivot, per-frame attachments, duration, direction and events.
- `rig/runtime.mjs`: deterministic source animation setup, expression presets, IK, combinations and renderer. No artwork is regenerated per frame.
- `validation/`: machine reports and actual rendered review images.

Coordinates: +x right, +y down, clockwise degrees. Character/world root `(768,1227)` is separate from animated pelvis. Neutral pelvis is `(768,793)`. Floor is `y=1227`. Seated surface is `y=1023` (204 px above floor); table surfaces are defined per interaction. Arm segment lengths are 135/125 px; legs 200/202 px. Anatomical right is the near arm on screen-left. Only symmetrical isolated hand drawings are reflected to produce left hands; hair/facing/body are never mirrored.

Walk is in place at 150 source pixels/second, 150 px/cycle; run is 330 px/second, 220 px/cycle. Root motion adds displacement to the whole rig; test evidence covers planted stance contacts for those constant-speed clips. Baked sprite speed is half source speed because sprite sequences are exported at half scale. Start/stop/change-speed clips are in-place performance clips and do not provide an integrated root path.

The 4K project is real, but the character source is raster (head ~238×302 pixels). 4K placement cannot invent additional painted detail. The low-resolution sprite sequences are review/game exports; use the native original parts or increase export resolution for larger composition needs. A high-detail repaint is needed for a close-up occupying a full 4K frame.

## Reproduce / extend

Within the Motion Studio workspace (using its existing dependencies):

```
node assets/louis-animation-pack/scripts/slice.mjs
npx tsx assets/louis-animation-pack/scripts/build-native.mjs
node assets/louis-animation-pack/scripts/export.mjs
node assets/louis-animation-pack/scripts/build-sheets.mjs
node assets/louis-animation-pack/scripts/validate.mjs
```

The native builder deliberately validates against the repository's current `src/model.ts`. Browser export needs the local viewer running. For reliable batch exports, run the standalone server and set `LOUIS_PACK_VIEWER_URL=http://127.0.0.1:4176/viewer/` so development hot reload cannot interrupt a batch. To export selected clips, append IDs such as `idle walk combo_walk_cup` to the export command. Source slicing must retain the same regular grid layout and palette; replacement generation changing layout requires updating the recorded rectangles/pivots. Add a clip to `clips`, implement its key-pose/breakdown timing in `sample`, preserve channel ownership, review contact poses, then rebuild.

See `COVERAGE.md` and `CONTINUATION.md` for the distinction between reviewed clips and motion studies. Files existing and playing does not by itself establish production quality.

## Render a new native review

Run `npm run build`, start `node assets/louis-animation-pack/scripts/renderer-server.mjs` (port 4177), and run `node assets/louis-animation-pack/scripts/render-review.mjs`. This uses the built Motion Studio renderer and the already installed ffmpeg-static binary; it refuses to overwrite an existing review. The normal editor still needs ffmpeg in PATH or MOTION_FFMPEG for its MP4 export dialog.
