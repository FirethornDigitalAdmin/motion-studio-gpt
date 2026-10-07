# Louis animation pack — production record

Design source: supplied full-body blond, bearded Louis, navy polo, beige chinos, plain white trainers. No logo or asymmetric equipment is invented. Anatomical right is the nearer arm on screen-left in this three-quarter view. Do not mirror a facing change.

Checklist:
1. Inspect Motion Studio format (done): version 1 image layers with keyed transforms and assetId switches; no bone graph or IK.
2. Generate canonical separated parts, features, hands, props and reference views.
3. Assemble a rigid cutout hierarchy; solve limbs with two-bone IK; document contact points and resets.
4. Inspect rest, extremes, stride contacts, grip and seated poses.
5. Author clips with locomotion / action / hand-prop / expression / gaze-blink / speech ownership.
6. Export native Motion Studio image layers and transparent fixed-registration frames/atlases.
7. Verify schema, asset hashes, decoding, endpoints, contacts, native rendering and viewer controls.

Primary animation support: three-quarter, facing screen-right. Turnaround views are reference-only; full facing changes need new artwork and are outstanding. Body artwork is raster, not infinitely detailed vector artwork. 4K composition is supported; source-resolution limitations must be stated.

Deliverables must be marked according to actual verification. This file is updated as production proceeds.

Completed evidence: 69 transparent parts; 28 expression presets; 15 visemes; 83 native clips, 6108 transparent frames and atlases; six combination demonstrations; actual 3840×2160, 24 fps, 24-second native review video; native schema/asset preparation, sampled render parity, UI controls, stance contacts, prop transitions and all frame-edge checks. Build and 23 existing unit tests pass. 18 sequences are motion studies; remaining requirements and numeric reach errors are in COVERAGE.md/CONTINUATION.md. This is a working core delivery, not a claim that every requested production action and separated drawing is complete.
