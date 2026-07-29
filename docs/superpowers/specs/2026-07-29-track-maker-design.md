# Track Maker Extension — Design

## Summary

A new toolbar extension, `track-maker`, that procedurally generates music
(melody, drums, and full arranged soundtracks) from music-theory parameters
and saves the results as `.wav` assets into the current project. Follows the
existing extension pattern (`pixel-art`, `sfx-generator`) exactly: self-contained
static frontend, tiny backend save route, fully offline, no external
libraries or network calls. No ML/TensorFlow/Magenta — generation is
algorithmic (scales, interval/rhythm biasing, pattern rules), and all audio
is hand-synthesized (oscillators + noise + envelopes), matching
`sfx-generator`'s engine style. Every generated parameter is exposed as a
slider/control for full manual editing after generation.

## Architecture

`source/extensions/track-maker/`
- `manifest.json` — `name: "track-maker"`, `displayName: "Track Maker"`,
  icon `🎼`, `activation: ["toolbar"]`, `view: { type: "modal", size: "full",
  entry: "index.html" }`
- `frontend/index.html` — one self-contained file (HTML/CSS/JS, no build
  step, no external libraries), structured as three tabs (Melody, Drums,
  Track) sharing a header of song-wide settings.
- `backend/index.js` — Express router with a `POST /save` route: validates
  `project`/`filename`/`dataUrl` (must be `data:audio/wav;base64,...`),
  writes via `ctx.resolveProjectAssetPath`, mirrors `sfx-generator`'s
  backend.

Reads `?project=` from the URL query string like the existing extensions;
shows "No project — open this from the editor." if absent.

## Shared song settings (header, all tabs)

- Key (root note)
- Scale/mode (major, minor, natural/harmonic/melodic minor, pentatonic
  major/minor, dorian, mixolydian, etc.)
- Tempo (BPM)
- Seed (drives all randomized generation; same seed + params = same output)

## Tab 1 — Melody (piano/synth)

**Generation**
- Mood preset buttons (Calm, Playful, Epic, Mysterious, Tense, Bright, ...)
  seed a full parameter set: register/octave range, note density, interval
  jumpiness (stepwise vs. leapy), syncopation, rest probability, phrase
  length in bars.
- "Generate" produces a note sequence over the phrase length, constrained to
  the selected key/scale.
- Every seeded parameter above is exposed as an individual slider so the
  user can hand-tune after picking a mood, then regenerate.

**Editing**
- Output shown as a piano-roll grid: pitch rows (within the selected
  register) × time-step columns (subdivision configurable, e.g. 1/8 or
  1/16). Click a cell to add/remove a note; drag a note's edge to change its
  length; drag a note vertically to change pitch.

**Synth**
- A synth params panel controls playback timbre: waveform (sine/
  square/saw/triangle), ADSR envelope, filter cutoff/resonance, vibrato
  depth/speed, portamento/glide — same slider style as `sfx-generator`'s
  panel, applied per note during playback and render.

**Save**
- "Save to Assets" renders the phrase to a WAV via `OfflineAudioContext`
  and POSTs it to `/api/extensions/track-maker/save`, same flow as
  `sfx-generator`.

## Tab 2 — Drums

**Generation**
- Pattern-style presets (four-on-the-floor, breakbeat, trap, boom-bap, ...)
  seed a step grid: rows = kit voices (kick, snare, closed hat, open hat,
  clap, tom — minimum set), columns = steps (16 or 32 per bar, configurable),
  over a configurable number of bars.
- Density, swing, and syncopation are also exposed as sliders that
  re-bias the preset's generation.

**Editing**
- Click any cell to toggle it on/off — full manual override after the
  preset seeds the grid.

**Synth**
- Each drum voice has its own procedural synth params (base pitch, pitch
  envelope/decay, amplitude decay, tone/noise mix, click/snap transient
  amount) — oscillator + noise + envelope technique, one voice type per kit
  row, each independently tweakable via sliders.

**Save**
- "Save to Assets" renders the pattern to a WAV, same save flow.

## Tab 3 — Track (arranged soundtrack)

**Arrangement**
- User sets a target length in bars (computed duration in seconds/minutes
  shown live given current tempo), clamped to a sane maximum (a few hundred
  bars) so a render can't hang the tab.
- "Generate Arrangement" builds a section list (e.g. Intro, Verse, Chorus,
  Verse, Chorus, Outro) sized to fill the target length. Each section
  applies an energy/density modifier to the current Melody and Drum
  generation settings (intro sparse/thin, chorus busier/louder/higher
  register, outro thinning out, fills into section changes) so sections are
  related but not identical repeats.
- One melody voice + drums layered together — no multi-voice/multi-track
  stacking.
- Section list is editable: reorder, duplicate, remove, or regenerate a
  single section without regenerating the whole arrangement.

**Save**
- Play/Render mixes melody + drums for the full arrangement into one
  stereo buffer via `OfflineAudioContext`; "Save to Assets" exports it as
  the final soundtrack WAV, same save flow as the other tabs.

## Error handling

- Missing `?project=` → same message as `sfx-generator`.
- Target length clamped to prevent runaway renders.
- Save failures surface in a status line (existing pattern: `.status`,
  `.status.error`, `.status.ok` classes).

## Testing

No automated test harness exists for extensions in this repo — they are
hand-verified through the running app (per the `run` skill). Manual
verification plan:
- Each tab generates a sensible result from its default preset.
- Grid editing (piano roll and drum grid) correctly adds/removes/moves
  notes/steps and playback reflects the edit.
- Synth param sliders audibly change the rendered sound.
- Track arrangement produces a section list whose sections are audibly
  distinct (not exact loops).
- Save on each tab writes a valid `.wav` into the project's `assets/`
  folder and the asset appears in the Explorer.
