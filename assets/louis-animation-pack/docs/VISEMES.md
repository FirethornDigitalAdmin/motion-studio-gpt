# Speech and facial controls

No audio was supplied. `viseme_demo` is a **timed drawing demonstration**, not tested lip synchronisation. It advances every 0.4 seconds, ending on silence. Other talking clips include silence at the ends of each 2.4-second phrase and before loop closure.

| Drawing | Phonemes / English examples |
|---|---|
| sil | silence, closed rest |
| PP | p, b, m — pop, bob, mum |
| FF | f, v — fine, very |
| TH | θ, ð — thin, this |
| DD | t, d — tip, dip |
| kk | k, g — cat, go |
| CH | tʃ, dʒ, ʃ — chat, jam, ship |
| SS | s, z — see, zoo |
| nn | n, l — no, low |
| RR | r — red |
| aa | a, ɑ — father; broad open vowel |
| E | ɛ, e — bed |
| I | ɪ, i — bit, see |
| O | ɔ, o — thought, go |
| U | ʊ, u, w — book, food, we |

This is a practical drawing scheme, not a phonetic analyser. Coarticulation, accent-specific vowels and audio cue alignment need timed annotations when audio is supplied. Replace cue times rather than regenerating artwork.

`sample(id,t,{expression:'angry',speech:true})` combines angry brows/eyes with speech. Speech owns the mouth and suppresses the expression's mouth drawing. An explicit `mouth:'O'` overrides both. Gaze (`gazeX/gazeY` in -1…1) is clamped inside each eye ellipse. `blink` accepts auto/open/closed/wink_R/wink_L. Narrowing eye drawings gives squint/partial eyelid states; no separately painted lid surface is present.

28 expression presets, including subtle/strong emotional pairs, are defined in `runtime.mjs`. Some emotions share mouth/eye drawings and differ by brows/head tilt. These are rig presets rather than 28 independently redrawn faces.
