# Motion tools

Open **Motion tools** in the toolbar, or choose **Curve editor** or **Diagnostics** in the bottom workspace. The scene preview stays visible while you edit. Return to **Timeline** for normal tracks, speech drawings and other discrete keys.

## Curve editor

Select a layer and choose a numeric property. The graph shows the native interpolation over the layer’s duration, with layer-local seconds on the horizontal axis and the property’s value on the vertical axis. It samples the same `valueAt` function used by preview and export.

- Select a key on the graph or in **Key**. Clicking a graph key seeks to it.
- Drag a key to change its time and value. Dragged times snap to project frames. A complete drag is one undo step.
- Arrow keys nudge the focused key: left/right changes one frame; up/down changes its value. Shift moves ten steps. Enter or Space selects and seeks to the key.
- **Graph key time/value** provide numeric editing. Changing only a value preserves an existing fractional timestamp.
- **Add key at playhead** records the evaluated value; **Delete selected key** removes it.
- **Graph easing** edits the outgoing segment. Choose Custom curve to drag its cyan/amber Bézier handles. Focus a handle and use arrows to adjust it in 0.05 steps. Vertical handles can overshoot; horizontal handles stay within 0–1. Spring parameters remain available.
- The play button and **Motion playhead** let you preview or seek while the graph is open.

The graph displays authored properties, not a solver-generated joint path. If a rig contact overrides a wrist or ankle, the preview can differ from that property’s graph. When **Continuous joint motion** is active for eligible joints, shape-preserving interpolation takes precedence over outgoing easing. The graph reflects that behaviour and disables the unused easing controls. Toggle Continuous joint motion in the normal inspector to switch modes.

Locked layers remain inspectable but cannot be edited. Colliding key times and unsupported values are rejected. Curves are ordinary native keys: they work with undo, the authoring API, project save/reopen and export.

## Onion skins

Enable **Rig onion skins** in the bottom workspace. These ghost selected rig characters; they do not change the saved project or export.

- **Before** and **After** independently show 0–3 poses on each side.
- **Every** sets frame spacing.
- **Opacity** sets the nearest ghost’s opacity. More distant ghosts fade progressively.
- Cyan is before; amber is after. Ghosts use the current frame’s camera so pose movement can be compared without a camera pan obscuring it.
- The current character masks overlapping ghost pixels, keeping its original colours clear while neighbouring pose silhouettes remain visible.

Ghosts evaluate the existing rig solver, including poses, drawing changes and contacts. They are clipped to the character/scene/project interval. Image characters and non-rig layers do not have rig ghost poses.

## Diagnostics

Choose a scene and open **Diagnostics**. The panel shows live reach/contact problems at the playhead. **Scan scene motion** checks the chosen scene-local start/end interval.

A scan reports:

- IK targets more than one rig pixel beyond reach.
- Pinned contacts whose evaluated attachment misses the pin by more than two scene pixels.
- Missing or invalid contact targets reported by the native solver.
- Fast head, wrist or ankle movement above **Speed threshold**, in scene pixels per second. These are informational findings: quick action can be intentional.
- Duplicate key times and keys beyond their layer duration.

Click a finding to select its character and seek to the reported project time. Repeated frame findings are grouped; reach/pin/speed findings retain the largest observed error or speed. Up to 150 findings are displayed.

Scans yield between chunks so they can be cancelled. The requested sample rate cannot exceed project fps, and a scan is capped at 3,600 samples; the completed status shows the actual sample rate. A changed project or scan setting marks earlier results stale. Scans never edit the project.

This is a sampled technical check, not a judge of acting quality. Events between samples may be missed. It does not certify believable walking, good artwork, or collision-free animation.
