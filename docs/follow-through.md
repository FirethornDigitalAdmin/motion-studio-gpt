# Follow-through

Select a rig and expand **Follow-through** in Character animation. Enable the effect after recording authored head or wrist keys. Head settling affects head angle; Arm overlap affects both wrist positions. The rig still solves the connected limbs, and active pins and reaching contacts override the wrist targets. Feet, body translation and facial performance stay as authored. Preset action clips are unchanged.

Strength blends the filtered movement with your keys. Frequency (1–8 Hz) controls how quickly it catches up. Damping (0.35–1) controls bounce; 1 settles without oscillation. Begin with strength 0.65, frequency 3 and damping 0.65. Reduce arm strength if an exaggerated gesture exceeds reach; use Diagnostics to check it.

The curve editor shows the authored curve in lavender and the follow-through result in mint. Contacts may override the result on canvas. Scrubbing, onion skins and export all use the same deterministic spring response, with a normalised two-second history sampled at 60 Hz. This is an authored-pose tool, not automatic acting or a replacement for animation timing.

**Bake follow-through to keys** samples affected channels across the character's duration at the project frame rate, retains original key times, and disables the live effect. It is one undoable edit. Baked keys match the live result at output frames; between-frame interpolation can differ slightly. Long bakes are limited to 18,000 frames. Save normally to retain settings and baked animation in the native project.

The validated authoring API supports `setFollowThrough` with a partial `values` object (`enabled`, `head`, `arms`, `strength`, `frequency`, `damping`), and `bakeFollowThrough` with `layerId`. Both honour locks, project revision checks and atomic batch undo.
