# Northern Dev — Character Performance

Native project: `projects/Northern Dev - Character Performance.motion`.

The original 44-second Louis and Patch story, workshop, portal, connected full-body drawings and Patch recordings are retained. The Directors Cut and tea-break projects are preserved separately.

Authoring was performed through Motion Studio's visible inspector and timeline. Louis changes from focused to confident, curious, sceptical and unimpressed; Patch looks between the device and Louis, becomes worried, and reacts to the final rain joke. Face registrations are stored per pose-image asset. The eyes and pupils have fixed dimensions, with eyelids covering them during blinks and half-closed expressions. The head deformation carries the facial features and talking mouth together. Continuous joint interpolation preserves authored holds and removes velocity changes at passing head and arm keys.

The edit has 13 camera shots, including listener cuts during the black-hole warning, subscription price and final punchline. Existing mesh regions retain the original connected hand and arm contours. This project uses image puppets with registered facial controls; the original characters have not been replaced by the tea-break skeletal rig.

The “raise a ticket” shot is a two-character composition showing Louis's complete shrug, laptop grip and head, with Patch listening beside the portal. It was widened after reviewing the first encoded film.

Louis's five replacement recordings use the supplied ElevenLabs voice `u7lytyl6B5TvrqvPt70j` (Louis Voice 1), model `eleven_v3`. Delivery tags provide confidence, curiosity, sarcasm and a tired finish. Selected generation IDs, prompts and durations are in `voices/louis-new-voice/recordings.json`. Old Louis recordings remain as disabled layers. Patch's corrected “Lewis” pronunciation is retained. Audio-driven mouth animation follows the new recordings. Patch's final reply starts at 32.1 seconds to leave a gap after Louis's longer new line.

Validation: successful production build, 40 unit tests, 15 existing browser tests, and a new browser test proving image-eye occlusion and native persistence. The saved ZIP has passed its CRC integrity check, all 22 native assets resolve, and the nine active dialogue clips have no overlap. Export: 1920 × 1080, 30 fps, H.264 CRF 16, 44 seconds.

Encoded audio verification compared each new recording against its corresponding section of the MP4: waveform correlations exceeded 0.99 for all five Louis lines. All seven original image assets were verified byte-for-byte against their copies in the native project.
