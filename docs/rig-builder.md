# Rig builder

Open **Rig builder** in the toolbar. Select an existing rig first to edit its artwork and proportions, or start a new character. **Load Louis artwork** supplies the current reusable separated artwork. **Import part artwork** accepts PNG, SVG, JPEG and WebP; transparent separated parts are recommended. Filenames such as `head.png`, `forearm_R.png` and `hand_L_open.png` map to their corresponding slots when imported together. A single file is assigned to the selected slot.

Select a part in **Artwork hierarchy**, assign any imported image to **Slot artwork**, then drag the green cross or edit **Pivot X/Y** to register the part to its joint. Artwork previews preserve aspect ratio. **Artwork scale X/Y** adjusts its size independently of the skeleton. Existing atlas crops are retained until artwork is replaced.

In **Rest pose · edit joints**, drag the hips, wrists or ankles; focused joint handles also respond to arrow keys. Change upper arm, forearm, thigh and shin lengths in **Skeleton proportions**. These dimensions are also used by action presets. The preview uses the native character renderer. Idle, walk and seated previews have play/pause and a time scrubber. Out-of-reach targets show a warning; all 16 body slots must reference imported images before placing a rig.

**Place rig in scene** adds a normal native rig layer. **Apply to selected rig** changes its artwork, pivots, crops and limb proportions while retaining its animation, authored pose and scene contacts. Placement/application is one undo operation. Cancel discards the draft rig edits; imported artwork stays in the project's asset library.

Keep **Save to project character library** checked to create/update a reusable character template. Templates are included in native project saves and ZIPs, and appear in **Character library** as saved rigs. Reused templates start without scene-specific contacts or drawing keys. To animate a newly placed rest pose with an action preset, use **Return to action preset** in the Inspector and choose **Rig action**. Pose editing, foot pins, prop contacts and drawing swaps remain available on the placed rig.

This release builds characters on Motion Studio's connected humanoid skeleton with its fixed part hierarchy. It does not automatically separate a flattened image, create arbitrary bones, add mesh skinning or construct a multi-view turnaround. Artistic consistency and joint coverage still depend on the supplied drawings.

The **Rig Builder Workshop.motion** example project contains a placed Louis rig and its reusable template.
