# Motion Studio — GPT Version

The GPT version of Motion Studio, published as `FirethornDigitalAdmin/motion-studio-gpt`.

This repository includes the editor, local server, tests, documentation and character-library source assets. Generated animation frames, atlases, rendered previews, deliverable archives and local project libraries are excluded.

A local motion-design editor. Every launch opens an **empty project**. No example composition is created, and no export starts until you choose **Export MP4 → Start export** (or explicitly run the render CLI).

Vite + React + TypeScript, Zustand, zod and a local Express server. No AI, cloud service, account, telemetry or external API is used by the running editor. Dependencies and Chromium need an internet connection for the first installation; editing and rendering then work offline.

## Install and run

Use Node **20.19+**, 22.12+ or a newer supported release, with npm. The minimum patch version is required by Vite 7. Install ffmpeg and make it available in `PATH`.

On Windows 11, if ffmpeg is missing:

```powershell
winget install Gyan.FFmpeg
```

Reopen your terminal after installing it. From this folder:

```powershell
npm install
npm run dev
```

Installation also downloads the Playwright Chromium used for exports. Open **http://127.0.0.1:4173**. Keep the terminal running while you use the editor. Stop it with Ctrl+C when finished.

If a managed environment skips installation scripts, run `npx playwright install chromium` once. `npm run build` checks TypeScript and builds the frontend; use `npm run dev` to serve the complete local application, including filesystem and export APIs.

Optional environment variables:

| Variable              | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `PORT`                | Editor port; default 4173                                   |
| `MOTION_PROJECTS_DIR` | Absolute path to your project library; default `./projects` |
| `MOTION_FFMPEG`       | Absolute path to ffmpeg, if it is not in PATH               |
| `MOTION_RENDER_PORT`  | Temporary CLI renderer port; default 4174                   |

For example, in PowerShell: `$env:MOTION_PROJECTS_DIR = 'D:\Motion Projects'` before starting the server. The server listens only on loopback.

## Editing basics

- **Text / Shape / Cursor** add a layer. The first layer creates an empty scene automatically. **+** beside Scenes creates another scene.
- **Import** or drop image, font or audio files anywhere in the editor. PNG, JPG/JPEG, WebP, static SVG, TTF, OTF, WOFF2, MP3, WAV, M4A, OGG and FLAC are supported. Go to Assets and choose **+** to place an image or audio track. Imported fonts appear in Font family under their filename without the extension.
- Select a layer in the canvas, Layers panel or timeline. Hold Shift when selecting to build a multi-selection. Drag a layer on the canvas to move it; Shift constrains movement to one axis. Use the bottom-right handle to scale and the circular handle above the selection to rotate; Shift snaps rotation to 15°.
- Layer controls toggle visibility and locking. The **···** menus rename, duplicate, reorder and delete scenes/layers. You can also drag layers in the Layers panel to change their stacking order. The top panel row is the frontmost layer.
- Project settings changes duration, aspect ratio, pixel resolution, frame rate and background. Existing layers and keyframes are preserved. Dimensions determine the canvas; changing them does not proportionally reposition existing artwork.
- Drag the ruler to scrub. Drag scene/layer bodies to move their timing and their left/right edges to trim. Keyframe diamonds drag in time; double-click one to seek to it. The zoom slider changes the timeline scale. Vertical track scrolling stays aligned with track labels.
- Play/pause with Space. Use ← / → for individual frames, Replay to start again, and Loop to repeat. Scrubbing pauses playback. Arrow keys and Space retain their normal behaviour inside text fields.
- Enter an exact timestamp in the transport's **Playhead time** field. Select a scene to edit its name, start and duration in the inspector.

### Voices and talking characters

Place an imported audio file on the timeline. Its waveform, Start and Duration controls set its cue; **Audio offset** trims the beginning of the source, and **Volume** controls level. Visibility mutes a track. Playback uses Web Audio and follows pause, seek and looping. MP4 exports mix the same trimmed cues as AAC audio.

On an image layer, enter an **Actor** name and enable **Talking mouth**. Enter the same actor name on their audio tracks. **Mouth X/Y** position the mouth as fractions of the sprite; width and height use image-layer pixels. The mouth follows the recorded speech amplitude, closes during pauses, and inherits the character's transform. This is stylised speech motion, not phoneme-specific facial animation. Multiple poses can share an actor name.

The editor imports finished recordings; voice generation is performed separately. The Louis & Patch scene's ElevenLabs performances and provenance are documented in `assets/northern-dev/VOICES-AND-PATCH.md`.

### Keyframes and motion

Click **◇** beside a property to add/remove a keyframe at the playhead. Once animated, editing the property updates a key at that time or adds another. Key times are relative to the layer's start; layer starts are relative to their scene's start.

Transform, size, pivot, opacity and typography numbers interpolate. Colours interpolate in RGB. Text content, font family, text alignment and shape type switch at the next keyframe. The Keyframes section lets you edit time, value and outgoing easing. Easing supports linear, ease in/out/in-out, cubic Bézier and spring, with a live curve preview. Spring parameters control stiffness, damping and mass; spring progress is normalised to reach the end key exactly. Invalid negative sizes/radii and out-of-range opacity are clamped during interpolation.

Animation presets create ordinary editable keys. Choose slide/fade/scale in or out, direction, distance, delay, duration and easing, then Apply preset. Applying again replaces that property's keys; one Undo restores them. Selected unlocked layers receive the preset.

For multi-selection, Stagger offsets layer starts in scene array order (bottom to top), reverse order or a reproducible seeded shuffle. It preserves each layer's duration and keyframes. Layer content is clipped by its scene's time range.

Cursor layers have timed path targets, editable offsets, smoothing and click times. Add targets at the playhead, edit their coordinates or drag the numbered canvas points. Offsets use the layer's local coordinates; layer transforms also affect the path. A click emits a short deterministic ripple. Smoothing uses smoothstep between targets; it is not a freehand spline editor.

### Character animation tools

Add **Louis rig** from **Character library**, or select an existing rig. Click **Pose** above the canvas (or **Edit joints on canvas** in the inspector). Drag hips, wrists and ankles to record an authored pose at the playhead. Drag the head handle to tilt the head; elbow and knee handles choose the bend direction. The two-bone IK solver preserves arm and leg lengths and reports unreachable targets. Each complete drag is one undo step. A first pose edit captures the current action; earlier action frames remain intact. Further pose keys interpolate with editable timeline easing. **Return to action preset** keys a switch back to the action track.

**Onion** previews the selected character before and after the playhead in cyan and amber. Set the spacing in frames in the inspector. These guides and skeleton handles are editor-only and never appear in exports.

Use **Contacts & props** to select a wrist or ankle and **Pin joint in scene**. Its position stays fixed while the body or layer moves, within the limb's reach. Prop contacts use image or shape layers: **Hand follows prop** solves the arm towards an animated grip; **Prop follows hand** attaches the prop to the wrist. Grip X/Y are fractions of the prop drawing, with optional rotation following. Contacts have Start/End times relative to the character layer. **Release at playhead** ends a contact; for a carried prop it also writes free position/rotation keys so the prop stays where it was released. One contact can drive a prop at a time; circular ownership is rejected. A missing or out-of-time target is reported in the inspector.

Save named poses under **Pose library** and apply them at another time or to another Louis rig. The library belongs to the project and includes expression, gaze, hand drawings, bone proportions and drawing registration. It saves in project.json and travels with the project zip.

**Drawing registration & proportions** adjusts bone lengths and the pivot/scale of individual drawings. Choose an imported image for a drawing slot; changes become discrete drawing keys at the playhead. This supports alternate hand shapes and character views when matching separated artwork exists. **Smooth joint overlaps** adds rounded underpaint at elbows and knees to help connected drawings meet cleanly. It is not mesh deformation, automatic view generation, or an arbitrary-skeleton rig builder. The existing natural blink uses closing eyelids while eye and pupil sizes stay fixed.

Pose keys, contacts and registered drawings use the same deterministic resolver in preview and MP4 export. Earlier projects receive defaults when opened; opening a normalized project does not mark it as an unsaved edit.

### Undo and redo

Ctrl+Z / Ctrl+Shift+Z (Cmd equivalents on macOS), or the toolbar arrows. A complete drag is one history entry. Text/number field changes are grouped until the field loses focus; Undo also commits and reverses the active field edit. History retains the last 100 edits and is reset when opening a project.

## Save and open

**Save** writes:

```text
projects/
  My project.motion/
    project.json
    assets/
      <sha256>.<original-extension>
```

`project.json` is the schema-validated source of truth. Originals are copied byte for byte and never rewritten. Content-addressed filenames avoid collisions. Imports into a saved project can create original asset files before the next Save, but project.json is changed only when saved. Deleted/undone assets are not physically removed from disk automatically.

Open lists `.motion` folders inside the project library. To open an existing folder from elsewhere, copy it into that library, change `MOTION_PROJECTS_DIR`, or import its zip. The CLI can render an arbitrary project folder directly.

**Save & download project zip** packages project.json and the referenced originals. **Open → Import project zip** validates and extracts into a new library folder. Missing/undecodable assets show a placeholder and **Relink** in Assets; relinking keeps layer references and reloads the restored file even when its bytes are identical. Relink missing assets before export.

A dot in the title marks unsaved changes. New/Open ask before discarding them, and browser refresh/close invokes the browser's unsaved-changes warning. There is no autosave or automatic restoration: a fresh launch stays empty.

## Export

Choose **Export MP4 → Start export**. Progress and cancellation are available in that dialog, which can be closed and reopened while rendering. After completion, Download MP4 saves a browser copy, and Export again prepares another export. The server also keeps the finished MP4 in the project library.

The headless render page contains only a canvas. It prepares all images and fonts and waits for `document.fonts.ready` before frame zero. Both preview and export call `src/renderer.ts → renderFrame(project, timeSec, ctx, scale)`. Preview is device-pixel-ratio aware; export draws at the exact project resolution, including text, shapes and static SVG. It never enlarges a bitmap of the preview canvas.

Frames are streamed as raw RGBA to ffmpeg: `libx264`, `yuv420p`, CRF 16, `-movflags +faststart`. Export emits `ceil(duration × fps)` frames at timestamps `frameIndex / fps`. Canvas dimensions must be even for MP4. Cancellation closes Chromium, terminates ffmpeg and removes the partial output. H.264 does not preserve transparency.

CLI, using the same pipeline:

```powershell
npm run render -- "projects/My project.motion" "out.mp4"
```

The output's parent directory must exist. Existing output files are refused rather than overwritten. Ctrl+C cancels a CLI export. If ffmpeg is missing, the UI shows installation steps and a render command for the saved project. Install it or set `MOTION_FFMPEG`, then retry.

## Verification

```powershell
npm run verify
```

This runs the TypeScript/build check, Vitest and Playwright. Browser tests use **port 4175** and **`.test-projects/`**, separate from your normal library. They intentionally create fixture projects and export videos as verification actions. Results and screenshots go to `test-results/`; the HTML report is `playwright-report/index.html`. Tests use a development-only ffmpeg binary for reproducibility; the normal editor uses ffmpeg from PATH or your explicit override.

`npm test` runs just unit tests; `npm run test:e2e` runs browser/export checks. Tests include licensed open fonts solely as fixtures; their licences are in `tests/fixtures/`.

## Works (tested)

Verified locally on macOS arm64 with Node 24.19, Chromium and ffmpeg. **37 unit tests and 15 Playwright tests**, plus TypeScript and the production frontend build:

- Empty launch; no automatic export; button and file-drop import; image/font decoding for every supported extension.
- Original asset byte equality and SHA-256 checks; folder save/reopen with deep project.json equality; complete zip round-trip and missing-file relink.
- Scene creation, duplication, rename, ordering and deletion. Layer naming, duplication, stacking changes, visibility and locking.
- Canvas movement, Shift constraint, scale/rotate handles, inspector values and selection; scene/layer trimming and keyframe dragging.
- Project duration, aspect choices, resolution and fps changes without deleting layers. Typography size, weight, line height, spacing, font and alignment edits.
- X/opacity animation, arbitrary-time interpolation, cubic curves and all spring damping regimes; colour/size/pivot animation and discrete text keys.
- Scrubbing, playback, frame stepping, grouped drag undo/redo, undo from a focused field and the unsaved-close warning. Editing issued no external network requests.
- Preset key replacement and undo, repeatable seeded stagger, cursor point movement, smoothing controls, click ripples and identical pixels after seeking away and back.
- UI export, cancellation, CLI export and clear missing-ffmpeg diagnostics.
- Character joint dragging and one-step undo/redo, pose libraries, fixed bone lengths, world-space foot pins, animated prop grips, timed carry/release, drawing registration keys, normalized legacy project opening and deep save/reopen. A six-second character export checks deterministic poses and compares encoded frames against direct rendering with mean RGB error below 3 / 255.
- Audio import and decoding, Web Audio playback after seeking, actor-specific mouth opening and pauses, offset/mute/scene clipping, and measured silence/tone/silence cue timing in an encoded MP4.
- **3-second 1920×1080 export at 30 fps**: ffmpeg extracts frames 0, 45 and 89 and compares them with direct renderFrame output at the same timestamps, including an imported SVG and font. Thresholds are mean absolute RGB channel error **< 3 / 255** and fewer than **1%** of channels differing by more than 24. Actual values are recorded in `test-results/export-parity.json`.

Phase 1 core was tested before the Phase 2 UI was introduced. Later tests cover the added property controls and advanced features.

## Not implemented

Video layers, automatic scene transitions, blur/effects, in-editor AI generation and cloud sync are outside v1. There is no native desktop installer, native arbitrary-folder picker, collaboration, or persisted undo history.

## Known limitations

- Windows 11 is the target; this build was exercised on the available macOS host, not a Windows machine. Windows installation and native filesystem behaviour need a Windows smoke test.
- This is a desktop browser editor, with a minimum useful viewport around 1000×660. It is not designed for phone editing.
- Preview is scaled to fit; a full 4K MP4 performance benchmark was not run. Export is a serial frame pipeline and can take substantially longer than the composition duration.
- Raster images retain their original pixel resolution; enlarging them cannot add detail. Animated raster imports freeze a decoded frame; animated SVG is unsupported. Static SVG is kept as vector-backed image data for full-resolution drawing. Assets with decoding errors share the missing-asset relink workflow.
- System fonts can differ across computers. Import the exact font for portable typography. Use distinct font filenames/family names; conflicting font files with the same imported family name are not disambiguated automatically.
- The upload limit is 100 MiB per original file or complete zip. Orphaned imports and completed exports require manual filesystem cleanup.
- Reducing duration clips playback without deleting authored layers or keys. Scenes can overlap; their layers composite in scene array order. Stagger can place layers beyond a scene's end, where they are clipped.
- ffmpeg encoding is lossy; parity is measured against a stated threshold, not exact encoded pixels. Native render determinism is tested with exact pixel equality.
