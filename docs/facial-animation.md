# Facial performance and lip sync

Select a rig or image character. **Facial performance** appears in the inspector.

- Choose a mouth drawing from the palette to record it at the playhead. The rig uses its existing separated mouth artwork; it keeps each drawing’s registration and follows the head.
- Record an acting expression or a gaze target. These use the same editable native expression and gaze keys as the rest of the editor.
- **Record blink** writes a 0.28-second close / hold / reopen gesture. Eyeballs and pupils keep their size. Automatic blinking now repeats through long scenes; turn off Natural blinking for fully manual acting.
- **Mouth keys** lets you seek, retime, change or remove a mouth key. All keys also appear on the main timeline. The list shows up to 100 keys near the playhead.

## Build a speech track

Import the speech recording, place it on the timeline in the same scene as the character, then choose it under **Build speech track → Speech audio**.

Enter the exact transcript, or paste alignment JSON, then select **Generate mouth track**. This is one undo step and survives native save/reopen. Generation replaces mouth keys only within the overlapping speech interval; pose, camera and expression animation are preserved. Rebuild after moving or trimming the audio.

Transcript generation is a local, spelling-based draft distributed across the recording’s voiced waveform. It preserves quiet pauses but does not recognise phonemes or guarantee word timing. No cloud service or new voice generation is involved.

For accurate timing, supply timed mouth cues. Times are seconds from the original audio file; the editor accounts for scene start, character start, audio start and audio offset, and clips cues to the character’s duration.

```json
{
  "cues": [
    { "start": 0.10, "end": 0.20, "value": "PP" },
    { "start": 0.20, "end": 0.45, "value": "aa" },
    { "start": 0.45, "end": 0.60, "value": "O" }
  ]
}
```

Supported drawings: `sil PP FF TH DD kk CH SS nn RR aa E I O U`. Cues must not overlap; gaps become silence. A plain array of cues is also accepted.

Rhubarb JSON `mouthCues` with A–H/X shapes is converted to the rig’s drawings. ElevenLabs `alignment` (or the alignment object itself) with `characters`, `character_start_times_seconds` and `character_end_times_seconds` preserves supplied character timing, with approximate spelling-based mouth shapes. Character timestamps are not phoneme recognition.

For an image character, the editor draws a mouth overlay at the existing Mouth X/Y/width/height registration. This supports rounded and wide vowels and closed consonants, but does not replace a rig’s separated art. Use a rig when precise mouth artwork is important. Assign missing mouth drawings in Rig builder.

## Authoring API

The validated API now includes:

```json
{
  "label": "Speech and blink",
  "expectedRevision": 3,
  "commands": [
    {
      "op": "generateLipSync",
      "layerId": "character-id",
      "input": {
        "audioLayerId": "speech-id",
        "cues": [{ "start": 0, "end": 0.3, "value": "aa" }]
      }
    },
    { "op": "addBlink", "layerId": "character-id", "time": 1.2 }
  ]
}
```

Use `input.transcript` instead of `input.cues` for a draft. `addBlink.time` and ordinary `setKeyframe` times are character-local seconds. Set `property: "mouthShape"` with a supported drawing (or `auto`) to author individual keys. Dry runs, atomic validation, revision checks, native undo and history inspection work as for other commands.

Preview and export use the same renderer and native keys, including when scrubbing directly into a line of dialogue. Generation does not alter the source audio or character assets.
