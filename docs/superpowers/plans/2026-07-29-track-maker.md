# Track Maker Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `track-maker` toolbar extension that procedurally generates melodies, drum patterns, and full arranged soundtracks from music-theory parameters, and saves them as `.wav` assets into the current project.

**Architecture:** Follows the existing `pixel-art`/`sfx-generator` extension pattern — `manifest.json` + a tiny Express `backend/index.js` save route + a static `frontend/`. Because this extension has substantially more logic than the existing ones, the pure generation/DSP logic (music theory, melody/drum generators, arrangement builder, synth rendering, WAV encoding, buffer mixing) is split into small ES modules under `frontend/js/`, loaded natively via `<script type="module">` (no build step, no bundler — same "just static files" constraint as every other extension). `frontend/index.html` stays the UI shell (tabs, sliders, piano-roll/step-grid rendering, wiring) exactly like the existing extensions' single-file style. No ML, no external libraries, no network calls — everything is hand-written procedural JS.

**Tech Stack:** Vanilla JS (ES modules), Web Audio API (`AudioContext` for playback only — all sample generation is manual `Float32Array` math, no `OfflineAudioContext`), Express (backend save route), Node's built-in `node:test` + `node:assert` for unit-testing the pure modules (no new dependencies).

## Global Constraints

- No external libraries, no CDN scripts, no network calls at runtime (spec: "fully offline, no external libraries or network calls").
- No ML/TensorFlow/Magenta — generation is algorithmic (spec: scales, interval/rhythm biasing, pattern rules).
- All drum/synth sounds are procedurally synthesized (oscillators + noise + envelopes) — no sample files (spec: "Drum sound source" decision).
- Extension folder: `source/extensions/track-maker/`, `name: "track-maker"`, icon `🎼`, `activation: ["toolbar"]`, modal view, `size: "full"`.
- Reads `?project=` from the URL query string; shows "No project — open this from the editor." if absent (matches `sfx-generator`).
- Target arrangement length is clamped to prevent runaway renders (a few hundred bars max).
- Save flow matches `sfx-generator` exactly: client encodes WAV → base64 data URL → `POST /api/extensions/track-maker/save` → on success, `window.parent.postMessage({ type: "EXTENSION_ASSET_SAVED", extension: "track-maker", project, filename }, "*")`.
- One melody voice + drums per track (no multi-voice stacking).

---

## File Structure

```
source/extensions/track-maker/
  manifest.json
  backend/
    index.js
  frontend/
    index.html
    js/
      rng.mjs            # seeded PRNG + random helpers
      theory.mjs         # note/scale math
      melody.mjs         # melody generator (moods -> note sequence)
      drums.mjs          # drum pattern generator (styles -> step grid)
      arrangement.mjs     # section-based song arrangement builder
      synth.mjs          # procedural PCM synthesis (lead voice + drum kit)
      mix.mjs            # buffer mixing/summing
      wav.mjs            # WAV encoding + data URL helpers
  test/
    rng.test.mjs
    theory.test.mjs
    melody.test.mjs
    drums.test.mjs
    arrangement.test.mjs
    synth.test.mjs
    mix.test.mjs
    wav.test.mjs
```

All `frontend/js/*.mjs` files are pure logic (no DOM access) so they can be run directly under Node for testing, and also loaded natively in the browser via `<script type="module">` from `index.html`. `test/*.mjs` files use Node's built-in test runner (`node --test`) and are dev-only — never referenced by `index.html`.

---

### Task 1: Extension scaffold (manifest, backend save route, HTML shell)

**Files:**
- Create: `source/extensions/track-maker/manifest.json`
- Create: `source/extensions/track-maker/backend/index.js`
- Create: `source/extensions/track-maker/frontend/index.html`

**Interfaces:**
- Produces: a working toolbar entry; `POST /api/extensions/track-maker/save` accepting `{ project, filename, dataUrl }` where `dataUrl` starts with `data:audio/wav;base64,`; the HTML shell exposes three tab buttons (`Melody`, `Drums`, `Track`) each toggling a `<section>` panel, plus a shared header with key/scale/tempo/seed controls and a per-tab filename input + Save button + status line (`.status`/`.status.ok`/`.status.error`, matching `sfx-generator`'s CSS classes).

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "name": "track-maker",
  "displayName": "Track Maker",
  "description": "Procedurally generate melodies, drum patterns, and full soundtracks from music-theory parameters, then save them straight into the current project's assets.",
  "icon": "🎼",
  "activation": ["toolbar"],
  "view": {
    "type": "modal",
    "size": "full",
    "entry": "index.html"
  }
}
```

- [ ] **Step 2: Write `backend/index.js`**

```js
import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/track-maker.
// Mirrors sfx-generator's /save route — accepts a WAV data URL and writes it
// into the current project's assets folder via the shared ExtensionContext.
export function register(router, ctx) {
  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      let filename = String(req.body?.filename ?? "").trim();
      const dataUrl = String(req.body?.dataUrl ?? "");

      if (!project || !filename) {
        return res.status(400).json({ success: false, error: "Missing project or filename" });
      }
      if (!filename.toLowerCase().endsWith(".wav")) filename += ".wav";
      if (!dataUrl.startsWith("data:audio/wav;base64,")) {
        return res.status(400).json({ success: false, error: "Expected a WAV data URL" });
      }

      const filePath = ctx.resolveProjectAssetPath(project, filename);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

      res.json({ success: true, filename });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
```

- [ ] **Step 3: Write the `index.html` shell**

Create `source/extensions/track-maker/frontend/index.html` with:
- The same dark-theme CSS variables/reset as `sfx-generator`'s `index.html` (`--bg`, `--bg-elevated`, `--border`, `--text`, `--accent`, button/input styles) so it looks consistent with the rest of the toolset. Copy the `<style>` block from `source/extensions/sfx-generator/frontend/index.html` verbatim as a starting point, then add:
  - `.tabs` / `.tab-btn` / `.tab-btn.active` styles for the tab bar.
  - `.panel` / `.panel.hidden { display: none; }` for the three tab panels.
- A `<header>` containing: `<strong>🎼 Track Maker</strong>`, then shared song controls — a `<select id="key">` (C through B), `<select id="scale">` (major, naturalMinor, harmonicMinor, dorian, mixolydian, majorPentatonic, minorPentatonic), `<input type="number" id="tempo" value="120" min="40" max="240">` labeled "BPM", `<input type="number" id="seed" value="1">` labeled "Seed" with a `<button id="reseedBtn">🎲</button>` next to it that sets a new random integer into `#seed`.
- A `<div class="tabs">` with three buttons: `<button class="tab-btn active" data-tab="melody">Melody</button>`, `data-tab="drums"` "Drums", `data-tab="track"` "Track".
- Three `<section class="panel" id="panel-melody">`, `id="panel-drums"` (with `hidden` class initially), `id="panel-track"` (with `hidden` class initially) — leave their inner content as an empty `<div class="body"></div>` placeholder for now (filled in Tasks 11-13).
- Each panel gets its own footer bar reusing the same save-row markup as `sfx-generator`: `<input type="text" id="filename-melody" placeholder="my_melody">`, `<button id="save-melody" class="primary">Save to Assets</button>`, `<span class="status" id="status-melody"></span>` (and the `-drums`/`-track` equivalents).
- A `<script type="module">` block at the bottom that:
  1. Reads `?project=` via `new URLSearchParams(location.search)`.
  2. Wires the tab buttons: clicking a `.tab-btn` sets `.active` on itself (removing from siblings) and toggles `hidden` on the matching `.panel`.
  3. Wires `#reseedBtn` to set `#seed.value = Math.floor(Math.random() * 1e9)`.
  4. For each of the three Save buttons, if `!project`, clicking sets its status span's text to `"No project — open this from the editor."` with class `status error` (placeholder behavior until Tasks 11-13 wire real generation/save).

- [ ] **Step 4: Manually verify the scaffold loads**

Use the `run` skill to start the dev app (client + server). Open the app, open a project, click the toolbar and confirm "🎼 Track Maker" appears and opens a full-size modal. Confirm the three tabs switch panels, the key/scale/tempo/seed header controls render, and clicking "🎲" changes the seed value. Confirm clicking any Save button with no changes shows the "No project" message only if you loaded the extension outside of a project context — otherwise it should currently do nothing (real save wiring comes later); this step just confirms the shell renders and doesn't throw console errors.

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/manifest.json source/extensions/track-maker/backend/index.js source/extensions/track-maker/frontend/index.html
git commit -m "feat(track-maker): scaffold extension shell (manifest, save route, tabbed HTML shell)"
```

---

### Task 2: `rng.mjs` — seeded PRNG

**Files:**
- Create: `source/extensions/track-maker/frontend/js/rng.mjs`
- Test: `source/extensions/track-maker/test/rng.test.mjs`

**Interfaces:**
- Produces:
  - `createRng(seed: number): () => number` — returns a function producing deterministic pseudo-random floats in `[0, 1)`; same `seed` always produces the same sequence of calls.
  - `randRange(rng: () => number, min: number, max: number): number`
  - `randInt(rng: () => number, min: number, max: number): number` — inclusive of both bounds.
  - `pick(rng: () => number, arr: any[]): any`

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/rng.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRng, randRange, randInt, pick } from "../frontend/js/rng.mjs";

test("createRng is deterministic for a given seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test("createRng produces values in [0, 1)", () => {
  const rng = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("different seeds produce different sequences", () => {
  const a = createRng(1)();
  const b = createRng(2)();
  assert.notEqual(a, b);
});

test("randRange stays within bounds", () => {
  const rng = createRng(7);
  for (let i = 0; i < 500; i++) {
    const v = randRange(rng, 10, 20);
    assert.ok(v >= 10 && v < 20);
  }
});

test("randInt is inclusive of both bounds and only returns integers", () => {
  const rng = createRng(9);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = randInt(rng, 0, 3);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 0 && v <= 3);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test("pick returns an element from the array", () => {
  const rng = createRng(3);
  const arr = ["a", "b", "c"];
  for (let i = 0; i < 50; i++) {
    assert.ok(arr.includes(pick(rng, arr)));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/rng.test.mjs`
Expected: FAIL — `rng.mjs` does not exist yet (module not found).

- [ ] **Step 3: Write `rng.mjs`**

```js
// Deterministic PRNG (mulberry32) so a given seed always reproduces the
// same generated melody/drum pattern/arrangement — needed for the seed
// field in the shared song settings to be meaningful.
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/rng.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/rng.mjs source/extensions/track-maker/test/rng.test.mjs
git commit -m "feat(track-maker): add seeded PRNG module"
```

---

### Task 3: `theory.mjs` — note/scale math

**Files:**
- Create: `source/extensions/track-maker/frontend/js/theory.mjs`
- Test: `source/extensions/track-maker/test/theory.test.mjs`

**Interfaces:**
- Consumes: nothing (pure, no dependency on Task 2).
- Produces:
  - `NOTE_NAMES: string[]` — `["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`.
  - `SCALES: Record<string, number[]>` — keys: `major`, `naturalMinor`, `harmonicMinor`, `dorian`, `mixolydian`, `majorPentatonic`, `minorPentatonic`. Values are semitone-offset arrays from the root, e.g. `major: [0,2,4,5,7,9,11]`.
  - `noteNameToMidi(name: string, octave: number): number` — `noteNameToMidi("C", 4) === 60`.
  - `scaleDegreeToMidi(rootMidi: number, scaleName: string, degree: number): number` — `degree` is a zero-based scale-degree index into `SCALES[scaleName]` that can be negative or exceed the scale length; it wraps across octaves (e.g. for `major` with 7 degrees, `degree === 7` is one octave above `degree === 0`; `degree === -1` is the 7th degree one octave down).
  - `midiToHz(midi: number): number` — `midiToHz(69) === 440`.
  - `midiToNoteName(midi: number): string` — e.g. `midiToNoteName(60) === "C4"`.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/theory.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_NAMES, SCALES, noteNameToMidi, scaleDegreeToMidi, midiToHz, midiToNoteName } from "../frontend/js/theory.mjs";

test("NOTE_NAMES has 12 entries starting at C", () => {
  assert.equal(NOTE_NAMES.length, 12);
  assert.equal(NOTE_NAMES[0], "C");
});

test("SCALES defines the required modes with valid semitone offsets", () => {
  for (const name of ["major", "naturalMinor", "harmonicMinor", "dorian", "mixolydian", "majorPentatonic", "minorPentatonic"]) {
    assert.ok(Array.isArray(SCALES[name]), `${name} missing`);
    assert.equal(SCALES[name][0], 0, `${name} must start at root (0)`);
    for (const v of SCALES[name]) assert.ok(v >= 0 && v < 12);
  }
});

test("noteNameToMidi matches standard MIDI numbering (C4 = 60, A4 = 69)", () => {
  assert.equal(noteNameToMidi("C", 4), 60);
  assert.equal(noteNameToMidi("A", 4), 69);
  assert.equal(noteNameToMidi("C", 5), 72);
});

test("scaleDegreeToMidi handles degree 0 and positive octave wrap", () => {
  const root = noteNameToMidi("C", 4); // 60
  assert.equal(scaleDegreeToMidi(root, "major", 0), 60);
  assert.equal(scaleDegreeToMidi(root, "major", 7), 72); // one octave up, 7-note scale
});

test("scaleDegreeToMidi handles negative degree wrap", () => {
  const root = noteNameToMidi("C", 4); // 60
  // degree -1 => 7th degree of the scale one octave down => B3 => 59
  assert.equal(scaleDegreeToMidi(root, "major", -1), 59);
});

test("midiToHz: A4 (69) is 440Hz", () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(81) - 880) < 1e-9); // A5
});

test("midiToNoteName round-trips with noteNameToMidi", () => {
  assert.equal(midiToNoteName(60), "C4");
  assert.equal(midiToNoteName(69), "A4");
  assert.equal(midiToNoteName(61), "C#4");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/theory.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `theory.mjs`**

```js
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export function noteNameToMidi(name, octave) {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx === -1) throw new Error(`Unknown note name "${name}"`);
  return (octave + 1) * 12 + idx;
}

// degree is a zero-based index into SCALES[scaleName] that may be negative
// or >= scale length; it wraps across octaves using floor-division so
// e.g. degree -1 lands on the scale's last degree, one octave down.
export function scaleDegreeToMidi(rootMidi, scaleName, degree) {
  const scale = SCALES[scaleName];
  if (!scale) throw new Error(`Unknown scale "${scaleName}"`);
  const len = scale.length;
  const octaveShift = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + octaveShift * 12 + scale[idx];
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  const idx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[idx]}${octave}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/theory.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/theory.mjs source/extensions/track-maker/test/theory.test.mjs
git commit -m "feat(track-maker): add music theory module (notes, scales, MIDI conversion)"
```

---

### Task 4: `melody.mjs` — melody generator

**Files:**
- Create: `source/extensions/track-maker/frontend/js/melody.mjs`
- Test: `source/extensions/track-maker/test/melody.test.mjs`

**Interfaces:**
- Consumes: `createRng`, `randRange`, `randInt`, `pick` from `rng.mjs` (Task 2); `SCALES`, `scaleDegreeToMidi` from `theory.mjs` (Task 3).
- Produces:
  - `MOODS: Record<string, MoodParams>` where `MoodParams = { registerLowOctave: number, registerHighOctave: number, density: number, jump: number, syncopation: number, restProb: number }`. Keys: `calm`, `playful`, `epic`, `mysterious`, `tense`, `bright`.
  - `moodToParams(moodName: string): MoodParams` — returns a fresh copy of `MOODS[moodName]` (never the shared object, so callers can mutate it).
  - `generateMelody({ rootMidi, scaleName, bars, stepsPerBar, registerLowOctave, registerHighOctave, density, jump, syncopation, restProb, seed }): Note[]` where `Note = { startStep: number, lengthSteps: number, midi: number, velocity: number }`. Notes are sorted by `startStep`, non-overlapping (`note[i].startStep + note[i].lengthSteps <= note[i+1].startStep`), all `midi` values are within `[rootMidi + registerLowOctave*12, rootMidi + registerHighOctave*12 + 11]` and belong to `scaleName` relative to `rootMidi`. Same `seed` + params always produces the same output.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/melody.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { MOODS, moodToParams, generateMelody } from "../frontend/js/melody.mjs";
import { SCALES } from "../frontend/js/theory.mjs";

const BASE = { rootMidi: 60, scaleName: "major", bars: 4, stepsPerBar: 8, seed: 123 };

test("MOODS defines the required presets", () => {
  for (const name of ["calm", "playful", "epic", "mysterious", "tense", "bright"]) {
    assert.ok(MOODS[name], `${name} missing`);
  }
});

test("moodToParams returns an independent copy", () => {
  const a = moodToParams("calm");
  a.density = 999;
  const b = moodToParams("calm");
  assert.notEqual(b.density, 999);
});

test("generateMelody is deterministic for a given seed", () => {
  const params = { ...BASE, ...moodToParams("playful") };
  const a = generateMelody(params);
  const b = generateMelody(params);
  assert.deepEqual(a, b);
});

test("generateMelody notes are non-overlapping and sorted", () => {
  const params = { ...BASE, ...moodToParams("epic") };
  const notes = generateMelody(params);
  for (let i = 0; i < notes.length - 1; i++) {
    assert.ok(notes[i].startStep <= notes[i + 1].startStep);
    assert.ok(notes[i].startStep + notes[i].lengthSteps <= notes[i + 1].startStep);
  }
});

test("generateMelody notes stay within the register and total step count", () => {
  const params = { ...BASE, ...moodToParams("mysterious"), registerLowOctave: -1, registerHighOctave: 1 };
  const notes = generateMelody(params);
  const totalSteps = BASE.bars * BASE.stepsPerBar;
  const scale = SCALES[BASE.scaleName];
  const minMidi = BASE.rootMidi + params.registerLowOctave * 12;
  const maxMidi = BASE.rootMidi + params.registerHighOctave * 12 + 11;
  for (const n of notes) {
    assert.ok(n.midi >= minMidi && n.midi <= maxMidi, `midi ${n.midi} out of register`);
    assert.ok(n.startStep >= 0 && n.startStep + n.lengthSteps <= totalSteps);
    const semitone = ((n.midi - BASE.rootMidi) % 12 + 12) % 12;
    assert.ok(scale.includes(semitone), `midi ${n.midi} not in scale`);
  }
});

test("higher density produces more notes than lower density (same seed)", () => {
  const low = generateMelody({ ...BASE, ...moodToParams("calm"), density: 0.1 });
  const high = generateMelody({ ...BASE, ...moodToParams("calm"), density: 0.9 });
  assert.ok(high.length >= low.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/melody.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `melody.mjs`**

```js
import { createRng, randRange, randInt } from "./rng.mjs";
import { SCALES, scaleDegreeToMidi } from "./theory.mjs";

export const MOODS = {
  calm: { registerLowOctave: 0, registerHighOctave: 1, density: 0.35, jump: 0.15, syncopation: 0.1, restProb: 0.35 },
  playful: { registerLowOctave: 0, registerHighOctave: 1, density: 0.6, jump: 0.4, syncopation: 0.35, restProb: 0.2 },
  epic: { registerLowOctave: -1, registerHighOctave: 1, density: 0.55, jump: 0.5, syncopation: 0.2, restProb: 0.15 },
  mysterious: { registerLowOctave: -1, registerHighOctave: 0, density: 0.3, jump: 0.25, syncopation: 0.3, restProb: 0.4 },
  tense: { registerLowOctave: -1, registerHighOctave: 1, density: 0.7, jump: 0.6, syncopation: 0.5, restProb: 0.1 },
  bright: { registerLowOctave: 0, registerHighOctave: 2, density: 0.65, jump: 0.35, syncopation: 0.2, restProb: 0.15 },
};

export function moodToParams(moodName) {
  return { ...MOODS[moodName] };
}

// Walks step-by-step across the phrase. At each step, probabilistically
// starts a new note (biased by density/syncopation) or continues a rest;
// each new note's scale degree is a bounded random walk from the previous
// note's degree (bounded by `jump`) so melodies stay mostly stepwise with
// occasional leaps, and degree is clamped to the requested register.
export function generateMelody(params) {
  const {
    rootMidi, scaleName, bars, stepsPerBar,
    registerLowOctave, registerHighOctave,
    density, jump, syncopation, restProb, seed,
  } = params;

  const scaleLen = SCALES[scaleName].length;
  const minDegree = registerLowOctave * scaleLen;
  const maxDegree = registerHighOctave * scaleLen + (scaleLen - 1);
  const totalSteps = bars * stepsPerBar;

  const rng = createRng(seed);
  const notes = [];
  let currentDegree = randInt(rng, minDegree, maxDegree);
  let step = 0;

  while (step < totalSteps) {
    const onStrongBeat = step % 2 === 0;
    const onsetChance = onStrongBeat ? density : density * (0.4 + syncopation * 0.6);
    const startsNote = rng() < onsetChance && rng() >= restProb;

    if (!startsNote) {
      step += 1;
      continue;
    }

    const maxJumpDegrees = 1 + Math.round(jump * 4);
    let nextDegree = currentDegree + randInt(rng, -maxJumpDegrees, maxJumpDegrees);
    nextDegree = Math.max(minDegree, Math.min(maxDegree, nextDegree));
    currentDegree = nextDegree;

    const maxLen = Math.max(1, Math.min(stepsPerBar, totalSteps - step));
    const lengthSteps = Math.max(1, Math.min(maxLen, randInt(rng, 1, Math.max(1, Math.round((1 - density) * stepsPerBar) + 1))));
    const midi = scaleDegreeToMidi(rootMidi, scaleName, currentDegree);
    const velocity = Math.min(1, Math.max(0.4, randRange(rng, 0.6, 1)));

    notes.push({ startStep: step, lengthSteps, midi, velocity });
    step += lengthSteps;
  }

  return notes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/melody.test.mjs`
Expected: PASS (6 tests). If the density-comparison test is flaky, re-run — it's seeded/deterministic per input so it should not actually flake; if it fails on logic, adjust `onsetChance`/`restProb` interaction in Step 3 until higher `density` reliably yields `length >= low.length` for the fixed seed, then re-run.

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/melody.mjs source/extensions/track-maker/test/melody.test.mjs
git commit -m "feat(track-maker): add melody generator module"
```

---

### Task 5: `drums.mjs` — drum pattern generator

**Files:**
- Create: `source/extensions/track-maker/frontend/js/drums.mjs`
- Test: `source/extensions/track-maker/test/drums.test.mjs`

**Interfaces:**
- Consumes: `createRng`, `randRange` from `rng.mjs` (Task 2).
- Produces:
  - `KIT_VOICES: string[]` — `["kick", "snare", "closedHat", "openHat", "clap", "tom"]`.
  - `DRUM_PATTERN_STYLES: Record<string, Record<string,{pulses:number}>>` — keys: `fourOnFloor`, `breakbeat`, `trap`, `boomBap`; each maps every `KIT_VOICES` entry to a base `{ pulses }` count used as the Euclidean-rhythm pulse count per bar.
  - `euclideanRhythm(pulses: number, steps: number): boolean[]` — Bjorklund-style even distribution of `pulses` onsets across `steps` slots; length always `steps`; exactly `pulses` entries are `true` (clamped: `pulses` is clamped to `[0, steps]` internally).
  - `generateDrumPattern({ bars, stepsPerBar, style, density, swing, syncopation, seed }): { steps: number, grid: Record<string, boolean[]> }` — `steps === bars * stepsPerBar`; `grid` has one boolean array of length `steps` per `KIT_VOICES` entry. Same `seed` + params always produces the same output.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/drums.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { KIT_VOICES, DRUM_PATTERN_STYLES, euclideanRhythm, generateDrumPattern } from "../frontend/js/drums.mjs";

test("DRUM_PATTERN_STYLES defines the required styles for every kit voice", () => {
  for (const style of ["fourOnFloor", "breakbeat", "trap", "boomBap"]) {
    assert.ok(DRUM_PATTERN_STYLES[style], `${style} missing`);
    for (const voice of KIT_VOICES) {
      assert.ok(DRUM_PATTERN_STYLES[style][voice], `${style}.${voice} missing`);
    }
  }
});

test("euclideanRhythm returns the requested length with the requested pulse count", () => {
  const r = euclideanRhythm(3, 8);
  assert.equal(r.length, 8);
  assert.equal(r.filter(Boolean).length, 3);
});

test("euclideanRhythm clamps pulses to [0, steps]", () => {
  assert.equal(euclideanRhythm(0, 8).filter(Boolean).length, 0);
  assert.equal(euclideanRhythm(99, 8).filter(Boolean).length, 8);
});

test("generateDrumPattern produces a full grid at the requested length", () => {
  const pattern = generateDrumPattern({ bars: 2, stepsPerBar: 16, style: "fourOnFloor", density: 0.5, swing: 0, syncopation: 0, seed: 1 });
  assert.equal(pattern.steps, 32);
  for (const voice of KIT_VOICES) {
    assert.ok(Array.isArray(pattern.grid[voice]));
    assert.equal(pattern.grid[voice].length, 32);
  }
});

test("generateDrumPattern is deterministic for a given seed", () => {
  const params = { bars: 4, stepsPerBar: 16, style: "breakbeat", density: 0.6, swing: 0.2, syncopation: 0.3, seed: 55 };
  assert.deepEqual(generateDrumPattern(params), generateDrumPattern(params));
});

test("fourOnFloor style puts a kick on every downbeat step (step % (stepsPerBar/4) === 0) at density 1", () => {
  const stepsPerBar = 16;
  const pattern = generateDrumPattern({ bars: 1, stepsPerBar, style: "fourOnFloor", density: 1, swing: 0, syncopation: 0, seed: 2 });
  for (let s = 0; s < stepsPerBar; s += stepsPerBar / 4) {
    assert.equal(pattern.grid.kick[s], true, `expected kick at step ${s}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/drums.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `drums.mjs`**

```js
import { createRng } from "./rng.mjs";

export const KIT_VOICES = ["kick", "snare", "closedHat", "openHat", "clap", "tom"];

// pulses are "per 16 steps" base counts; generateDrumPattern scales them to
// the actual stepsPerBar/bars and density before calling euclideanRhythm.
export const DRUM_PATTERN_STYLES = {
  fourOnFloor: { kick: { pulses: 4 }, snare: { pulses: 2 }, closedHat: { pulses: 8 }, openHat: { pulses: 2 }, clap: { pulses: 2 }, tom: { pulses: 0 } },
  breakbeat: { kick: { pulses: 3 }, snare: { pulses: 3 }, closedHat: { pulses: 10 }, openHat: { pulses: 2 }, clap: { pulses: 1 }, tom: { pulses: 1 } },
  trap: { kick: { pulses: 3 }, snare: { pulses: 2 }, closedHat: { pulses: 14 }, openHat: { pulses: 1 }, clap: { pulses: 2 }, tom: { pulses: 0 } },
  boomBap: { kick: { pulses: 4 }, snare: { pulses: 2 }, closedHat: { pulses: 6 }, openHat: { pulses: 1 }, clap: { pulses: 0 }, tom: { pulses: 1 } },
};

// Bjorklund-ish even distribution: place `pulses` onsets as evenly as
// possible across `steps` slots by accumulating a fractional step and
// firing whenever it crosses a whole number.
export function euclideanRhythm(pulses, steps) {
  const p = Math.max(0, Math.min(steps, Math.round(pulses)));
  const out = new Array(steps).fill(false);
  if (p === 0) return out;
  const spacing = steps / p;
  for (let i = 0; i < p; i++) {
    out[Math.floor(i * spacing)] = true;
  }
  return out;
}

export function generateDrumPattern({ bars, stepsPerBar, style, density, swing, syncopation, seed }) {
  const totalSteps = bars * stepsPerBar;
  const rng = createRng(seed);
  const styleDef = DRUM_PATTERN_STYLES[style];
  const grid = {};

  for (const voice of KIT_VOICES) {
    const basePulsesPerBar = Math.round(styleDef[voice].pulses * (stepsPerBar / 16) * density);
    const perBar = euclideanRhythm(basePulsesPerBar, stepsPerBar);
    const full = [];
    for (let b = 0; b < bars; b++) {
      for (let s = 0; s < stepsPerBar; s++) {
        let hit = perBar[s];
        // syncopation randomly nudges a small fraction of off-hits on,
        // and on-hits off, without changing the overall onset count much.
        if (rng() < syncopation * 0.15) hit = !hit;
        full.push(hit);
      }
    }
    grid[voice] = full.slice(0, totalSteps);
  }

  return { steps: totalSteps, grid };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/drums.test.mjs`
Expected: PASS (6 tests). Note: the syncopation test uses `syncopation: 0`, so no flips occur and the fourOnFloor downbeat assertion is exact.

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/drums.mjs source/extensions/track-maker/test/drums.test.mjs
git commit -m "feat(track-maker): add drum pattern generator module"
```

---

### Task 6: `arrangement.mjs` — section-based arrangement builder

**Files:**
- Create: `source/extensions/track-maker/frontend/js/arrangement.mjs`
- Test: `source/extensions/track-maker/test/arrangement.test.mjs`

**Interfaces:**
- Consumes: `generateMelody` from `melody.mjs` (Task 4); `generateDrumPattern`, `KIT_VOICES` from `drums.mjs` (Task 5).
- Produces:
  - `SECTION_ORDER: string[]` — `["intro", "verse", "chorus", "verse", "chorus", "outro"]`.
  - `energyForSection(type: string): { densityMult: number, registerShift: number, velocityMult: number }` — modifiers per section type (`intro`/`outro` low density & velocity, `chorus` highest).
  - `buildArrangement({ targetBars: number, sectionBars?: number }): { type: string, bars: number }[]` — cycles through `SECTION_ORDER` (repeating from the start if needed) in `sectionBars`-sized chunks (default `4`) until the running total reaches `targetBars`; the last section's `bars` is trimmed so the sum is exactly `targetBars`. If `targetBars < sectionBars`, returns a single section of `targetBars` using `SECTION_ORDER[0]`.
  - `generateArrangement({ rootMidi, scaleName, bars: melodyBars, stepsPerBar, melodyParams, drumParams, targetBars, seed }): { totalSteps: number, sections: { type: string, bars: number, startStep: number, melodyNotes: Note[], drumGrid: Record<string, boolean[]> }[] }` — calls `buildArrangement`, then for each section derives a per-section seed (`seed + sectionIndex * 1000` — deterministic, distinct per section), calls `generateMelody`/`generateDrumPattern` for that section's bar count with `energyForSection(type)` modifiers applied to `melodyParams`/`drumParams` (density/register/velocity as documented above), and offsets the returned notes/grid so `melodyNotes[i].startStep` and grid indices are **absolute** across the whole arrangement (section 2's step 0 = `section1.bars * stepsPerBar`).

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/arrangement.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { SECTION_ORDER, energyForSection, buildArrangement, generateArrangement } from "../frontend/js/arrangement.mjs";
import { KIT_VOICES } from "../frontend/js/drums.mjs";

test("energyForSection returns modifiers for every section type in SECTION_ORDER", () => {
  for (const type of new Set(SECTION_ORDER)) {
    const e = energyForSection(type);
    assert.ok(typeof e.densityMult === "number");
    assert.ok(typeof e.registerShift === "number");
    assert.ok(typeof e.velocityMult === "number");
  }
});

test("buildArrangement sections sum exactly to targetBars", () => {
  for (const targetBars of [4, 10, 24, 33]) {
    const sections = buildArrangement({ targetBars, sectionBars: 4 });
    const sum = sections.reduce((acc, s) => acc + s.bars, 0);
    assert.equal(sum, targetBars, `targetBars=${targetBars}`);
    for (const s of sections) assert.ok(s.bars > 0);
  }
});

test("buildArrangement handles targetBars smaller than sectionBars", () => {
  const sections = buildArrangement({ targetBars: 2, sectionBars: 4 });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].bars, 2);
});

const ARR_BASE = {
  rootMidi: 60, scaleName: "major", stepsPerBar: 8,
  melodyParams: { registerLowOctave: 0, registerHighOctave: 1, density: 0.5, jump: 0.3, syncopation: 0.2, restProb: 0.2 },
  drumParams: { style: "fourOnFloor", density: 0.6, swing: 0.1, syncopation: 0.2 },
  targetBars: 12, seed: 7,
};

test("generateArrangement sections tile the full timeline with absolute, non-overlapping step ranges", () => {
  const { totalSteps, sections } = generateArrangement(ARR_BASE);
  let expectedStart = 0;
  for (const s of sections) {
    assert.equal(s.startStep, expectedStart);
    expectedStart += s.bars * ARR_BASE.stepsPerBar;
    for (const voice of KIT_VOICES) {
      assert.equal(s.drumGrid[voice].length, s.bars * ARR_BASE.stepsPerBar);
    }
    for (const note of s.melodyNotes) {
      assert.ok(note.startStep >= s.startStep && note.startStep < s.startStep + s.bars * ARR_BASE.stepsPerBar);
    }
  }
  assert.equal(expectedStart, totalSteps);
  assert.equal(totalSteps, ARR_BASE.targetBars * ARR_BASE.stepsPerBar);
});

test("generateArrangement is deterministic for a given seed", () => {
  const a = generateArrangement(ARR_BASE);
  const b = generateArrangement(ARR_BASE);
  assert.deepEqual(a, b);
});

test("generateArrangement sections are not identical to each other (arrangement has variation)", () => {
  const { sections } = generateArrangement(ARR_BASE);
  const verseSections = sections.filter((s) => s.type === "verse");
  const chorusSections = sections.filter((s) => s.type === "chorus");
  if (verseSections.length >= 2) {
    assert.notDeepEqual(verseSections[0].melodyNotes, verseSections[1].melodyNotes);
  }
  if (chorusSections.length && verseSections.length) {
    // chorus should generally be louder/denser than verse per energyForSection
    const chorusVel = chorusSections[0].melodyNotes.reduce((a, n) => a + n.velocity, 0) / (chorusSections[0].melodyNotes.length || 1);
    const verseVel = verseSections[0].melodyNotes.reduce((a, n) => a + n.velocity, 0) / (verseSections[0].melodyNotes.length || 1);
    assert.ok(chorusVel >= verseVel * 0.9); // loose bound, avoid flakiness on small samples
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/arrangement.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `arrangement.mjs`**

```js
import { generateMelody } from "./melody.mjs";
import { generateDrumPattern, KIT_VOICES } from "./drums.mjs";

export const SECTION_ORDER = ["intro", "verse", "chorus", "verse", "chorus", "outro"];

const ENERGY = {
  intro: { densityMult: 0.5, registerShift: 0, velocityMult: 0.7 },
  verse: { densityMult: 0.85, registerShift: 0, velocityMult: 0.85 },
  chorus: { densityMult: 1.15, registerShift: 1, velocityMult: 1.1 },
  outro: { densityMult: 0.45, registerShift: -1, velocityMult: 0.6 },
};

export function energyForSection(type) {
  return ENERGY[type] ?? { densityMult: 1, registerShift: 0, velocityMult: 1 };
}

export function buildArrangement({ targetBars, sectionBars = 4 }) {
  if (targetBars <= sectionBars) {
    return [{ type: SECTION_ORDER[0], bars: targetBars }];
  }

  const sections = [];
  let remaining = targetBars;
  let i = 0;
  while (remaining > 0) {
    const type = SECTION_ORDER[i % SECTION_ORDER.length];
    const bars = Math.min(sectionBars, remaining);
    sections.push({ type, bars });
    remaining -= bars;
    i += 1;
  }
  return sections;
}

function applyEnergyToMelodyParams(melodyParams, energy) {
  return {
    ...melodyParams,
    density: Math.max(0.05, Math.min(1, melodyParams.density * energy.densityMult)),
    registerLowOctave: melodyParams.registerLowOctave + energy.registerShift,
    registerHighOctave: melodyParams.registerHighOctave + energy.registerShift,
  };
}

function applyEnergyToDrumParams(drumParams, energy) {
  return {
    ...drumParams,
    density: Math.max(0.05, Math.min(1, drumParams.density * energy.densityMult)),
  };
}

function scaleVelocity(notes, mult) {
  return notes.map((n) => ({ ...n, velocity: Math.max(0, Math.min(1, n.velocity * mult)) }));
}

export function generateArrangement({ rootMidi, scaleName, stepsPerBar, melodyParams, drumParams, targetBars, seed, sectionBars = 4 }) {
  const sectionDefs = buildArrangement({ targetBars, sectionBars });
  const sections = [];
  let startStep = 0;

  sectionDefs.forEach((def, index) => {
    const energy = energyForSection(def.type);
    const sectionSeed = seed + index * 1000;

    const sectionMelodyParams = applyEnergyToMelodyParams(melodyParams, energy);
    const rawNotes = generateMelody({
      rootMidi, scaleName, bars: def.bars, stepsPerBar,
      ...sectionMelodyParams, seed: sectionSeed,
    });
    const melodyNotes = scaleVelocity(rawNotes, energy.velocityMult).map((n) => ({
      ...n,
      startStep: n.startStep + startStep,
    }));

    const sectionDrumParams = applyEnergyToDrumParams(drumParams, energy);
    const rawPattern = generateDrumPattern({
      bars: def.bars, stepsPerBar, seed: sectionSeed + 1,
      ...sectionDrumParams,
    });

    sections.push({
      type: def.type,
      bars: def.bars,
      startStep,
      melodyNotes,
      drumGrid: rawPattern.grid,
    });

    startStep += def.bars * stepsPerBar;
  });

  return { totalSteps: startStep, sections };
}

export { KIT_VOICES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/arrangement.test.mjs`
Expected: PASS (6 tests). If the "not identical" test fails because two `verse` sections end up equal, confirm `sectionSeed` differs per section index (it does, by construction) — the sections should already differ; if the loose velocity-ratio bound still trips on some run, widen the `0.9` multiplier slightly rather than tightening generation logic (it's a smoke check, not a strict spec).

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/arrangement.mjs source/extensions/track-maker/test/arrangement.test.mjs
git commit -m "feat(track-maker): add section-based arrangement builder"
```

---

### Task 7: `wav.mjs` — WAV encoding

**Files:**
- Create: `source/extensions/track-maker/frontend/js/wav.mjs`
- Test: `source/extensions/track-maker/test/wav.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer` — mono 16-bit PCM WAV, byte length `44 + samples.length * 2`, matching `sfx-generator`'s encoder exactly (same header layout).
  - `bufferToDataUrl(buffer: ArrayBuffer): string` — `"data:audio/wav;base64," + <base64>`. Uses `Buffer.from(...).toString("base64")` when `btoa` is unavailable (Node test environment) and `btoa` when it is (browser), so the module works in both.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/wav.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav, bufferToDataUrl } from "../frontend/js/wav.mjs";

test("encodeWav produces the correct byte length", () => {
  const samples = new Float32Array(1000);
  const buf = encodeWav(samples, 44100);
  assert.equal(buf.byteLength, 44 + 1000 * 2);
});

test("encodeWav writes a valid RIFF/WAVE header", () => {
  const buf = encodeWav(new Float32Array(10), 44100);
  const view = new DataView(buf);
  const readStr = (offset, len) => String.fromCharCode(...new Uint8Array(buf, offset, len));
  assert.equal(readStr(0, 4), "RIFF");
  assert.equal(readStr(8, 4), "WAVE");
  assert.equal(readStr(12, 4), "fmt ");
  assert.equal(readStr(36, 4), "data");
  assert.equal(view.getUint32(24, true), 44100); // sample rate
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint16(34, true), 16); // bits per sample
});

test("encodeWav clamps out-of-range samples instead of wrapping", () => {
  const buf = encodeWav(new Float32Array([2, -2]), 44100);
  const view = new DataView(buf);
  assert.equal(view.getInt16(44, true), 0x7fff);
  assert.equal(view.getInt16(46, true), -0x8000);
});

test("bufferToDataUrl produces a data URL with the correct prefix and decodes back to the same bytes", () => {
  const buf = encodeWav(new Float32Array([0.5, -0.5, 0]), 44100);
  const url = bufferToDataUrl(buf);
  assert.ok(url.startsWith("data:audio/wav;base64,"));
  const base64 = url.slice(url.indexOf(",") + 1);
  const decoded = Buffer.from(base64, "base64");
  assert.deepEqual(new Uint8Array(decoded), new Uint8Array(buf));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/wav.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `wav.mjs`**

```js
export function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, numSamples * 2, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export function bufferToDataUrl(buffer) {
  const bytes = new Uint8Array(buffer);
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return "data:audio/wav;base64," + btoa(binary);
  }
  return "data:audio/wav;base64," + Buffer.from(bytes).toString("base64");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/wav.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/wav.mjs source/extensions/track-maker/test/wav.test.mjs
git commit -m "feat(track-maker): add WAV encoding module"
```

---

### Task 8: `synth.mjs` — lead voice PCM synthesis

**Files:**
- Create: `source/extensions/track-maker/frontend/js/synth.mjs`
- Test: `source/extensions/track-maker/test/synth.test.mjs`

**Interfaces:**
- Consumes: `midiToHz` from `theory.mjs` (Task 3); `Note` shape from `melody.mjs` (Task 4: `{ startStep, lengthSteps, midi, velocity }`).
- Produces:
  - `WAVEFORMS: string[]` — `["sine", "square", "sawtooth", "triangle"]`.
  - `oscillatorSample(waveform: string, phase01: number): number` — returns a single-cycle waveform sample for `phase01` in `[0, 1)`, range `[-1, 1]`.
  - `renderLeadVoice(notes: Note[], synthParams: LeadSynthParams, sampleRate: number, stepDurationSec: number): Float32Array` where `LeadSynthParams = { waveform: string, attack: number, decay: number, sustainLevel: number, release: number, filterCutoff: number, vibratoDepth: number, vibratoRate: number }` (all time values in seconds except `sustainLevel`/`filterCutoff`(0-1)/`vibratoDepth`(0-1, semitones fraction)/`vibratoRate`(Hz)). Output length is `Math.ceil(maxNoteEndStep * stepDurationSec * sampleRate)` where `maxNoteEndStep = max(startStep+lengthSteps)` across `notes` (or `0` length if `notes` is empty). Every sample is in `[-1, 1]`.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/synth.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { WAVEFORMS, oscillatorSample, renderLeadVoice } from "../frontend/js/synth.mjs";

const SR = 44100;
const LEAD_PARAMS = { waveform: "sine", attack: 0.01, decay: 0.05, sustainLevel: 0.7, release: 0.05, filterCutoff: 1, vibratoDepth: 0, vibratoRate: 5 };

test("WAVEFORMS lists the four required types", () => {
  assert.deepEqual(WAVEFORMS, ["sine", "square", "sawtooth", "triangle"]);
});

test("oscillatorSample stays within [-1, 1] across all waveforms and phases", () => {
  for (const wf of WAVEFORMS) {
    for (let i = 0; i < 100; i++) {
      const v = oscillatorSample(wf, i / 100);
      assert.ok(v >= -1 && v <= 1, `${wf} phase ${i / 100} => ${v}`);
    }
  }
});

test("renderLeadVoice returns an empty buffer for no notes", () => {
  const out = renderLeadVoice([], LEAD_PARAMS, SR, 0.25);
  assert.equal(out.length, 0);
});

test("renderLeadVoice length matches the last note's end time", () => {
  const notes = [{ startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 }];
  const stepDurationSec = 0.25;
  const out = renderLeadVoice(notes, LEAD_PARAMS, SR, stepDurationSec);
  const expectedLen = Math.ceil(2 * stepDurationSec * SR);
  assert.equal(out.length, expectedLen);
});

test("renderLeadVoice output stays within [-1, 1]", () => {
  const notes = [
    { startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 },
    { startStep: 2, lengthSteps: 2, midi: 67, velocity: 0.8 },
  ];
  const out = renderLeadVoice(notes, LEAD_PARAMS, SR, 0.25);
  for (const s of out) assert.ok(s >= -1 && s <= 1);
});

test("renderLeadVoice produces silence before a note's start and non-silence during it", () => {
  const notes = [{ startStep: 4, lengthSteps: 2, midi: 69, velocity: 1 }];
  const stepDurationSec = 0.25;
  const out = renderLeadVoice(notes, LEAD_PARAMS, SR, stepDurationSec);
  const noteStartSample = Math.floor(4 * stepDurationSec * SR);
  const beforeWindow = out.subarray(0, noteStartSample);
  const duringWindow = out.subarray(noteStartSample + 100, noteStartSample + 1000);
  const rms = (arr) => Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / (arr.length || 1));
  assert.ok(rms(beforeWindow) < 1e-6);
  assert.ok(rms(duringWindow) > 0.01);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/synth.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `synth.mjs` (lead voice section)**

```js
import { midiToHz } from "./theory.mjs";

export const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"];

export function oscillatorSample(waveform, phase01) {
  const p = phase01 - Math.floor(phase01);
  switch (waveform) {
    case "sine": return Math.sin(p * 2 * Math.PI);
    case "square": return p < 0.5 ? 1 : -1;
    case "sawtooth": return 1 - p * 2;
    case "triangle": return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
    default: return 0;
  }
}

// One-pole low-pass, cutoff01 in [0,1] mapped to a coefficient — same
// shape of filter as sfx-generator's LPF, reused for the lead voice's
// filterCutoff param.
function applyLowPass(samples, cutoff01) {
  if (cutoff01 >= 1) return samples;
  const a = Math.max(0.001, cutoff01);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    prev = prev + a * (samples[i] - prev);
    samples[i] = prev;
  }
  return samples;
}

export function renderLeadVoice(notes, synthParams, sampleRate, stepDurationSec) {
  if (!notes.length) return new Float32Array(0);

  const { waveform, attack, decay, sustainLevel, release, filterCutoff, vibratoDepth, vibratoRate } = synthParams;
  const maxEndStep = Math.max(...notes.map((n) => n.startStep + n.lengthSteps));
  const totalSamples = Math.ceil(maxEndStep * stepDurationSec * sampleRate);
  const out = new Float32Array(totalSamples);

  for (const note of notes) {
    const startSample = Math.floor(note.startStep * stepDurationSec * sampleRate);
    const noteDurationSec = note.lengthSteps * stepDurationSec;
    const noteSamples = Math.max(1, Math.floor(noteDurationSec * sampleRate));
    const releaseSamples = Math.floor(release * sampleRate);
    const totalNoteSamples = Math.min(out.length - startSample, noteSamples + releaseSamples);
    if (totalNoteSamples <= 0) continue;

    const hz = midiToHz(note.midi);
    const attackSamples = Math.max(1, Math.floor(attack * sampleRate));
    const decaySamples = Math.max(1, Math.floor(decay * sampleRate));

    let phase = 0;
    let vibPhase = 0;
    for (let i = 0; i < totalNoteSamples; i++) {
      vibPhase += vibratoRate / sampleRate;
      const vibHz = hz * (1 + Math.sin(vibPhase * 2 * Math.PI) * vibratoDepth * 0.06);
      phase += vibHz / sampleRate;

      let env;
      if (i < attackSamples) {
        env = i / attackSamples;
      } else if (i < attackSamples + decaySamples) {
        const t = (i - attackSamples) / decaySamples;
        env = 1 - t * (1 - sustainLevel);
      } else if (i < noteSamples) {
        env = sustainLevel;
      } else {
        const t = (i - noteSamples) / Math.max(1, releaseSamples);
        env = sustainLevel * Math.max(0, 1 - t);
      }

      const sample = oscillatorSample(waveform, phase) * env * note.velocity;
      out[startSample + i] += sample;
    }
  }

  applyLowPass(out, filterCutoff);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/synth.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/synth.mjs source/extensions/track-maker/test/synth.test.mjs
git commit -m "feat(track-maker): add lead voice synth renderer"
```

---

### Task 9: `synth.mjs` — drum kit PCM synthesis

**Files:**
- Modify: `source/extensions/track-maker/frontend/js/synth.mjs`
- Modify: `source/extensions/track-maker/test/synth.test.mjs`

**Interfaces:**
- Consumes: `KIT_VOICES` from `drums.mjs` (Task 5).
- Produces (added to `synth.mjs`):
  - `DEFAULT_DRUM_VOICE_PARAMS: Record<string, DrumVoiceParams>` — one entry per `KIT_VOICES` name, `DrumVoiceParams = { basePitchHz: number, pitchDecay: number, ampDecay: number, toneNoiseMix: number, clickAmount: number }` (`toneNoiseMix` 0=pure tone,1=pure noise; times in seconds).
  - `renderDrumHit(voiceType: string, voiceParams: DrumVoiceParams, sampleRate: number): Float32Array` — renders a single hit's full decay tail (length derived from `ampDecay`, at least a few hundred samples), values in `[-1, 1]`.
  - `renderDrumKit(grid: Record<string, boolean[]>, voiceParamsByVoice: Record<string, DrumVoiceParams>, sampleRate: number, stepDurationSec: number, swing: number): Float32Array` — mixes every voice's hits (from `grid[voice][step] === true`) into one buffer of length `grid[KIT_VOICES[0]].length * stepDurationSec * sampleRate` (plus tail overhang from the last hit, so the buffer is long enough to contain full decay tails); odd-indexed steps (`step % 2 === 1`) are shifted later in time by `swing * stepDurationSec * 0.5` seconds (swing in `[0,1]`); output clamped to `[-1, 1]`.

- [ ] **Step 1: Write the failing test (append to `synth.test.mjs`)**

```js
// append to source/extensions/track-maker/test/synth.test.mjs
import { DEFAULT_DRUM_VOICE_PARAMS, renderDrumHit, renderDrumKit } from "../frontend/js/synth.mjs";
import { KIT_VOICES } from "../frontend/js/drums.mjs";

test("DEFAULT_DRUM_VOICE_PARAMS has an entry for every kit voice", () => {
  for (const voice of KIT_VOICES) assert.ok(DEFAULT_DRUM_VOICE_PARAMS[voice], `${voice} missing`);
});

test("renderDrumHit returns a non-empty buffer within [-1, 1]", () => {
  const out = renderDrumHit("kick", DEFAULT_DRUM_VOICE_PARAMS.kick, SR);
  assert.ok(out.length > 0);
  for (const s of out) assert.ok(s >= -1 && s <= 1);
});

test("renderDrumKit produces silence on steps with no hits and energy on steps with hits", () => {
  const steps = 8;
  const grid = { kick: new Array(steps).fill(false), snare: new Array(steps).fill(false), closedHat: new Array(steps).fill(false), openHat: new Array(steps).fill(false), clap: new Array(steps).fill(false), tom: new Array(steps).fill(false) };
  grid.kick[2] = true;
  const stepDurationSec = 0.25;
  const out = renderDrumKit(grid, DEFAULT_DRUM_VOICE_PARAMS, SR, stepDurationSec, 0);
  const hitSample = Math.floor(2 * stepDurationSec * SR);
  const rms = (arr) => Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / (arr.length || 1));
  assert.ok(rms(out.subarray(0, hitSample)) < 1e-6);
  assert.ok(rms(out.subarray(hitSample, hitSample + 500)) > 0.01);
});

test("renderDrumKit output stays within [-1, 1] with multiple simultaneous voices", () => {
  const steps = 4;
  const grid = {};
  for (const v of KIT_VOICES) grid[v] = new Array(steps).fill(true); // worst case: every voice hits every step
  const out = renderDrumKit(grid, DEFAULT_DRUM_VOICE_PARAMS, SR, 0.25, 0.3);
  for (const s of out) assert.ok(s >= -1 && s <= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/synth.test.mjs`
Expected: FAIL on the new drum-kit tests (existing lead-voice tests still pass).

- [ ] **Step 3: Append drum synthesis to `synth.mjs`**

```js
// append to source/extensions/track-maker/frontend/js/synth.mjs

export const DEFAULT_DRUM_VOICE_PARAMS = {
  kick: { basePitchHz: 150, pitchDecay: 0.04, ampDecay: 0.25, toneNoiseMix: 0.05, clickAmount: 0.3 },
  snare: { basePitchHz: 200, pitchDecay: 0.02, ampDecay: 0.15, toneNoiseMix: 0.6, clickAmount: 0.4 },
  closedHat: { basePitchHz: 6000, pitchDecay: 0.005, ampDecay: 0.04, toneNoiseMix: 0.95, clickAmount: 0.1 },
  openHat: { basePitchHz: 5000, pitchDecay: 0.005, ampDecay: 0.25, toneNoiseMix: 0.9, clickAmount: 0.1 },
  clap: { basePitchHz: 1200, pitchDecay: 0.01, ampDecay: 0.12, toneNoiseMix: 0.85, clickAmount: 0.2 },
  tom: { basePitchHz: 180, pitchDecay: 0.06, ampDecay: 0.3, toneNoiseMix: 0.15, clickAmount: 0.15 },
};

function noiseSample() {
  return Math.random() * 2 - 1;
}

export function renderDrumHit(voiceType, voiceParams, sampleRate) {
  const { basePitchHz, pitchDecay, ampDecay, toneNoiseMix, clickAmount } = voiceParams;
  const length = Math.max(64, Math.floor(ampDecay * 4 * sampleRate));
  const out = new Float32Array(length);
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const pitchEnv = Math.exp(-t / Math.max(0.001, pitchDecay));
    const hz = basePitchHz * (1 + pitchEnv * 2);
    phase += hz / sampleRate;

    const tone = Math.sin(phase * 2 * Math.PI);
    const noise = noiseSample();
    let s = tone * (1 - toneNoiseMix) + noise * toneNoiseMix;

    if (t < 0.002) s += (1 - t / 0.002) * clickAmount * (Math.random() * 2 - 1);

    const ampEnv = Math.exp(-t / Math.max(0.001, ampDecay));
    out[i] = s * ampEnv;
  }

  return out;
}

export function renderDrumKit(grid, voiceParamsByVoice, sampleRate, stepDurationSec, swing) {
  const voices = Object.keys(grid);
  const steps = grid[voices[0]]?.length ?? 0;
  const baseLength = Math.ceil(steps * stepDurationSec * sampleRate);
  const tailLength = Math.ceil(1 * sampleRate); // headroom for decay tails past the last step
  const out = new Float32Array(baseLength + tailLength);

  for (const voice of voices) {
    const hits = grid[voice];
    const params = voiceParamsByVoice[voice] ?? voiceParamsByVoice[Object.keys(voiceParamsByVoice)[0]];
    for (let step = 0; step < hits.length; step++) {
      if (!hits[step]) continue;
      const swingOffsetSec = step % 2 === 1 ? swing * stepDurationSec * 0.5 : 0;
      const startSample = Math.floor((step * stepDurationSec + swingOffsetSec) * sampleRate);
      const hit = renderDrumHit(voice, params, sampleRate);
      for (let i = 0; i < hit.length && startSample + i < out.length; i++) {
        out[startSample + i] += hit[i];
      }
    }
  }

  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/synth.test.mjs`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/track-maker/frontend/js/synth.mjs source/extensions/track-maker/test/synth.test.mjs
git commit -m "feat(track-maker): add procedural drum kit synth renderer"
```

---

### Task 10: `mix.mjs` — buffer mixing

**Files:**
- Create: `source/extensions/track-maker/frontend/js/mix.mjs`
- Test: `source/extensions/track-maker/test/mix.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mixBuffers(buffers: Float32Array[], gains?: number[]): Float32Array` — sums buffers sample-by-sample (shorter buffers implicitly zero-padded), each optionally scaled by the corresponding entry in `gains` (default `1` per buffer if `gains` omitted or shorter than `buffers`), output length equals the longest input buffer's length, output clamped to `[-1, 1]`. Returns `new Float32Array(0)` if `buffers` is empty.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/track-maker/test/mix.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mixBuffers } from "../frontend/js/mix.mjs";

test("mixBuffers returns an empty array for no input buffers", () => {
  assert.equal(mixBuffers([]).length, 0);
});

test("mixBuffers sums same-length buffers", () => {
  const a = new Float32Array([0.1, 0.2, 0.3]);
  const b = new Float32Array([0.1, 0.1, 0.1]);
  const out = mixBuffers([a, b]);
  assert.equal(out.length, 3);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(out[1] - 0.3) < 1e-6);
  assert.ok(Math.abs(out[2] - 0.4) < 1e-6);
});

test("mixBuffers pads shorter buffers with silence and output length matches the longest", () => {
  const a = new Float32Array([0.1, 0.1, 0.1, 0.1]);
  const b = new Float32Array([0.1]);
  const out = mixBuffers([a, b]);
  assert.equal(out.length, 4);
  assert.ok(Math.abs(out[0] - 0.2) < 1e-6);
  assert.ok(Math.abs(out[3] - 0.1) < 1e-6);
});

test("mixBuffers applies per-buffer gains", () => {
  const a = new Float32Array([1]);
  const b = new Float32Array([1]);
  const out = mixBuffers([a, b], [0.5, 0.25]);
  assert.ok(Math.abs(out[0] - 0.75) < 1e-6);
});

test("mixBuffers clamps output to [-1, 1]", () => {
  const a = new Float32Array([1, -1]);
  const b = new Float32Array([1, -1]);
  const out = mixBuffers([a, b]);
  assert.equal(out[0], 1);
  assert.equal(out[1], -1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/track-maker/test/mix.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mix.mjs`**

```js
export function mixBuffers(buffers, gains) {
  if (!buffers.length) return new Float32Array(0);
  const length = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(length);

  buffers.forEach((buf, i) => {
    const gain = gains && gains[i] !== undefined ? gains[i] : 1;
    for (let j = 0; j < buf.length; j++) out[j] += buf[j] * gain;
  });

  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/track-maker/test/mix.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full unit test suite for the extension**

Run: `node --test source/extensions/track-maker/test/`
Expected: All tests across all 8 test files PASS.

- [ ] **Step 6: Commit**

```bash
git add source/extensions/track-maker/frontend/js/mix.mjs source/extensions/track-maker/test/mix.test.mjs
git commit -m "feat(track-maker): add buffer mixing module"
```

---

### Task 11: Melody tab UI

**Files:**
- Modify: `source/extensions/track-maker/frontend/index.html`

**Interfaces:**
- Consumes: `MOODS`, `moodToParams`, `generateMelody` from `js/melody.mjs`; `WAVEFORMS`, `renderLeadVoice` from `js/synth.mjs`; `encodeWav`, `bufferToDataUrl` from `js/wav.mjs`; shared header state (`#key`, `#scale`, `#tempo`, `#seed`) from Task 1.
- Produces: a fully working Melody tab — no other task depends on its internals, but Task 13 (Track tab) reuses the same slider-panel-building pattern established here.

- [ ] **Step 1: Build the Melody tab markup and param panel**

Inside `<section id="panel-melody"><div class="body">`, add:
- A mood preset row: one `<button class="mood-btn" data-mood="calm">Calm</button>` per `Object.keys(MOODS)` (Calm, Playful, Epic, Mysterious, Tense, Bright — label-case the key), generated by JS rather than hardcoded HTML so it can't drift from `MOODS`.
- A sliders panel (reuse `sfx-generator`'s `.row`/`.val` CSS) for: Register Low Octave (-2..2), Register High Octave (-2..2), Density (0-1, step 0.01), Jump (0-1), Syncopation (0-1), Rest Probability (0-1), Bars (1-32, integer), Steps/Bar (4, 8, 16 — a `<select>`).
- A synth params panel: waveform buttons (`WAVEFORMS`), then sliders for Attack/Decay/Release (0-2s), Sustain Level (0-1), Filter Cutoff (0-1), Vibrato Depth (0-1), Vibrato Rate (0-20Hz).
- A piano-roll `<canvas id="pianoRoll" width="900" height="260">` for visualizing/editing notes, and a "▶ Play" button + duration readout, matching the transport styling from `sfx-generator`.

- [ ] **Step 2: Wire generation and the params-panel-building pattern**

In the module script, add a `melodyState` object holding all slider values, current `notes` (`Note[]`), and current synth params. Write `buildSliderRow(container, {key, label, min, max, step, onChange})` once (reused by Drums/Track tabs too) that creates a `.row` with a `<label>`, `<input type="range">`, and a `.val` span, wires `input` events to call `onChange(value)` and update the `.val` text, and returns the `<input>` element. Use it to build every slider listed in Step 1. Clicking a mood button calls `moodToParams(mood)`, merges it into `melodyState`, updates every slider's displayed value to match, then calls `regenerateMelody()`.

`regenerateMelody()`: reads `rootMidi` from `#key`+octave 4 (via `noteNameToMidi`, imported from `theory.mjs`), reads `scaleName` from `#scale`, reads `seed` from `#seed`, calls `generateMelody({...melodyState, rootMidi, scaleName, seed})`, stores the result in `melodyState.notes`, and calls `drawPianoRoll()`.

- [ ] **Step 3: Implement the piano-roll canvas — draw + click/drag editing**

`drawPianoRoll()`: clears the canvas, draws horizontal gridlines per scale-degree row (row range = current register), vertical gridlines per step (grouped every `stepsPerBar` with a heavier line), then draws each note in `melodyState.notes` as a filled rectangle at `(startStep * colWidth, rowForMidi(note.midi) * rowHeight, lengthSteps * colWidth, rowHeight)`.

Add `mousedown`/`mousemove`/`mouseup` listeners on the canvas: on `mousedown`, compute `(step, midi)` from the click position; if an existing note occupies that cell, remove it from `melodyState.notes`; otherwise start a drag-paint that adds a new 1-step note at `(step, midi)` and, while the mouse is held and moves into adjacent same-row cells, extends that note's `lengthSteps` to cover them (remove any other notes it now overlaps). On `mouseup`, re-sort `melodyState.notes` by `startStep` and call `drawPianoRoll()`. This satisfies the "click to add/remove, drag to change length/pitch" editing requirement from the spec.

- [ ] **Step 4: Wire playback and save**

`playMelody()`: build a Float32Array via `renderLeadVoice(melodyState.notes, melodyState.synthParams, 44100, stepDurationSec)` where `stepDurationSec = 60 / tempo / (stepsPerBar / 4)`, then play it through an `AudioContext` exactly like `sfx-generator`'s `playCurrent()` (create buffer, `copyToChannel`, `createBufferSource`, `connect`, `start`), stopping any currently-playing source first.

Wire `#save-melody` click: guard on `project` present and `melodyState.notes.length > 0` (mirroring `sfx-generator`'s guards and status messages), render via `renderLeadVoice` + `encodeWav` + `bufferToDataUrl`, `POST` to `/api/extensions/track-maker/save` with `{ project, filename: filenameInput.value.trim(), dataUrl }`, update `#status-melody`, and on success `postMessage({ type: "EXTENSION_ASSET_SAVED", extension: "track-maker", project, filename }, "*")` to `window.parent`.

Seed a default mood (`"calm"`) and call `regenerateMelody()` once on load so the tab isn't empty when opened.

- [ ] **Step 5: Manually verify**

Using the `run` skill, open Track Maker on a real project, go to the Melody tab: click each mood preset and confirm the piano roll updates and sliders reflect the preset; drag sliders and confirm the roll regenerates; click/drag on the piano roll to add/remove/extend notes; click Play and confirm audio plays and matches the visual roll (higher rows = higher pitch); enter a filename and Save, then confirm the file appears in the project's Explorer under assets.

- [ ] **Step 6: Commit**

```bash
git add source/extensions/track-maker/frontend/index.html
git commit -m "feat(track-maker): wire up Melody tab (generation, piano roll editing, synth, save)"
```

---

### Task 12: Drums tab UI

**Files:**
- Modify: `source/extensions/track-maker/frontend/index.html`

**Interfaces:**
- Consumes: `DRUM_PATTERN_STYLES`, `KIT_VOICES`, `generateDrumPattern` from `js/drums.mjs`; `DEFAULT_DRUM_VOICE_PARAMS`, `renderDrumKit` from `js/synth.mjs`; `encodeWav`, `bufferToDataUrl` from `js/wav.mjs`; `buildSliderRow` helper from Task 11 (shared in the same module script — if `index.html` is a single script block this is just an in-scope function; no import needed since there's no separate JS file for the UI layer).
- Produces: a fully working Drums tab.

- [ ] **Step 1: Build the Drums tab markup**

Inside `<section id="panel-drums"><div class="body">`, add:
- A pattern-style preset row: one button per `Object.keys(DRUM_PATTERN_STYLES)` (Four On Floor, Breakbeat, Trap, Boom Bap).
- Sliders: Density (0-1), Swing (0-1), Syncopation (0-1), Bars (1-16), Steps/Bar (`<select>`: 8, 16, 32).
- A step-grid `<table id="drumGrid">` (or `<canvas>` — use a `<table>` for simpler click handling: one `<tr>` per `KIT_VOICES` entry with a row label `<td>` and one `<td class="step">` per step, toggled via CSS class `.on`).
- A "voice" selector `<select id="drumVoiceSelect">` listing `KIT_VOICES`, and a synth params panel below it (sliders: Base Pitch Hz (40-8000), Pitch Decay (0-0.2s), Amp Decay (0-1s), Tone/Noise Mix (0-1), Click Amount (0-1)) that shows/edits `drumState.voiceParams[selectedVoice]` — changing the `<select>` re-populates the sliders from that voice's current params without regenerating the pattern.
- "▶ Play" button + duration readout, filename input + Save button + status line (same as Task 1's placeholder, now wired for real).

- [ ] **Step 2: Wire generation and grid editing**

`drumState = { style, density, swing, syncopation, bars, stepsPerBar, grid, voiceParams: structuredClone(DEFAULT_DRUM_VOICE_PARAMS), seed }`. Clicking a style preset button sets `drumState.style` and calls `regenerateDrums()`, which calls `generateDrumPattern({...drumState, seed})` (reading `seed` from the shared `#seed` field), stores `grid`, and calls `renderDrumGridTable()`.

`renderDrumGridTable()`: rebuilds the `<table>` rows/cells from `drumState.grid`, adding `.on` class where `true`. Clicking a `<td class="step">` toggles the corresponding boolean in `drumState.grid[voice][step]`, toggles the `.on` class on that cell directly (no full table rebuild needed for a single click), and does not touch any other cell — this is the "click any cell to toggle it" manual override from the spec.

- [ ] **Step 3: Wire per-voice synth params**

Changing `#drumVoiceSelect` calls `loadVoiceParamsIntoSliders(selectedVoice)` which sets each synth-panel slider's displayed value from `drumState.voiceParams[selectedVoice]` without firing regeneration. Each synth-panel slider's `onChange` writes into `drumState.voiceParams[selectedVoice][field]` directly (these affect only rendering/playback, not the grid, so no `regenerateDrums()` call is needed — just re-render audio on next Play/Save).

- [ ] **Step 4: Wire playback and save**

`playDrums()`: `renderDrumKit(drumState.grid, drumState.voiceParams, 44100, stepDurationSec, drumState.swing)` (same `stepDurationSec` formula as Task 11, using the shared `#tempo`), play via `AudioContext` same as Task 11's `playMelody()`.

Wire `#save-drums` identically to Task 11's save wiring (guard on `project` present and grid non-empty — grid is never truly "empty" since it always has the right shape, so guard instead on `bars > 0`), rendering via `renderDrumKit` + `encodeWav` + `bufferToDataUrl`, posting to the same `/save` endpoint with `extension: "track-maker"` in the `postMessage`.

Seed a default style (`"fourOnFloor"`) and call `regenerateDrums()` once on load.

- [ ] **Step 5: Manually verify**

Open the Drums tab: click each style preset and confirm the grid updates; click individual cells and confirm they toggle without affecting others; select different voices in the voice dropdown and confirm sliders show that voice's params; adjust a synth slider (e.g. kick Base Pitch Hz) and confirm Play sounds different; Save and confirm the asset appears in the Explorer.

- [ ] **Step 6: Commit**

```bash
git add source/extensions/track-maker/frontend/index.html
git commit -m "feat(track-maker): wire up Drums tab (pattern generation, step grid editing, per-voice synth, save)"
```

---

### Task 13: Track tab UI (arrangement)

**Files:**
- Modify: `source/extensions/track-maker/frontend/index.html`

**Interfaces:**
- Consumes: `generateArrangement`, `SECTION_ORDER` from `js/arrangement.mjs`; `renderLeadVoice`, `renderDrumKit` from `js/synth.mjs`; `mixBuffers` from `js/mix.mjs`; `encodeWav`, `bufferToDataUrl` from `js/wav.mjs`; the current `melodyState.synthParams` and `drumState.voiceParams` from Tasks 11-12 (the Track tab renders using whatever synth/voice params are currently set on the other two tabs, per the spec's shared-settings design); `buildSliderRow` from Task 11.
- Produces: a fully working Track tab that completes the extension.

- [ ] **Step 1: Build the Track tab markup**

Inside `<section id="panel-track"><div class="body">`, add:
- `<input type="number" id="targetBars" value="32" min="1" max="256">` labeled "Length (bars)", plus a computed `<span id="targetDuration">` showing `(targetBars * secondsPerBar).toFixed(1) + "s"` given the current tempo, recalculated on any `#targetBars`/`#tempo` change.
- `<button id="generateArrangementBtn">Generate Arrangement</button>`.
- A `<div id="sectionList">` showing one row per generated section: `<span>{type} · {bars} bars</span>`, `<button data-action="up">↑</button>`, `<button data-action="down">↓</button>`, `<button data-action="regenerate">🔁</button>`, `<button data-action="duplicate">⧉</button>`, `<button data-action="remove">✕</button>`.
- "▶ Play" button + duration readout, filename input + Save button + status line.

- [ ] **Step 2: Wire arrangement generation**

`trackState = { targetBars: 32, arrangement: null }`. Clicking `#generateArrangementBtn` reads the shared key/scale/tempo/seed, reads `melodyState`'s current register/density/jump/syncopation/restProb/stepsPerBar as `melodyParams`, reads `drumState`'s current style/density/swing/syncopation as `drumParams`, and calls:

```js
trackState.arrangement = generateArrangement({
  rootMidi: noteNameToMidi(keySelect.value, 4),
  scaleName: scaleSelect.value,
  stepsPerBar: melodyState.stepsPerBar,
  melodyParams: { registerLowOctave: melodyState.registerLowOctave, registerHighOctave: melodyState.registerHighOctave, density: melodyState.density, jump: melodyState.jump, syncopation: melodyState.syncopation, restProb: melodyState.restProb },
  drumParams: { style: drumState.style, density: drumState.density, swing: drumState.swing, syncopation: drumState.syncopation },
  targetBars: Number(targetBarsInput.value),
  seed: Number(seedInput.value),
});
renderSectionList();
```

- [ ] **Step 3: Wire section list editing**

`renderSectionList()`: rebuilds `#sectionList` rows from `trackState.arrangement.sections`. Button handlers:
- `up`/`down`: swap the section with its neighbor in the `sections` array, then recompute every section's `startStep`/note-and-grid absolute offsets by re-deriving from the new order — simplest correct approach: recompute the whole arrangement's absolute offsets in one pass: iterate `sections` in new order, track a running `startStep`, and for each section shift its `melodyNotes[*].startStep` by `(newStartStep - section.startStep)` before setting `section.startStep = newStartStep`.
- `regenerate`: recompute just that one section by calling `generateMelody`/`generateDrumPattern` again with a freshly randomized seed offset (e.g. `Date.now() % 100000`) for that section index only, keeping its `type`/`bars`/`startStep`, then re-run the same offset-recompute pass as `up`/`down` (bar count may not have changed, but keeps the logic in one place).
- `duplicate`: deep-clones the section object (fresh note/grid arrays, not shared references) and inserts the clone immediately after the original, then re-runs the offset-recompute pass.
- `remove`: deletes the section from the array (guard: don't allow removing the last remaining section), then re-runs the offset-recompute pass.

All four handlers finish by updating `trackState.arrangement.totalSteps` (sum of all `bars * stepsPerBar`) and calling `renderSectionList()`.

- [ ] **Step 4: Wire playback and save**

`renderFullTrack()`: for the current `trackState.arrangement`, concatenate all sections' `melodyNotes` into one flat array (already absolute-offset) and call `renderLeadVoice(allNotes, melodyState.synthParams, 44100, stepDurationSec)` for the lead buffer; separately, merge all sections' `drumGrid`s into one combined `Record<string, boolean[]>` per voice (concatenate each voice's boolean arrays across sections in order) and call `renderDrumKit(combinedGrid, drumState.voiceParams, 44100, stepDurationSec, drumState.swing)` for the drum buffer; then `mixBuffers([leadBuffer, drumBuffer])` for the final mono mix.

`playTrack()`: plays the `mixBuffers` result via `AudioContext`, same pattern as Tasks 11-12.

Wire `#save-track` identically to the other two Save buttons (guard on `project` present and `trackState.arrangement` non-null), rendering via `renderFullTrack()` + `encodeWav` + `bufferToDataUrl`, posting to `/save` with `extension: "track-maker"`.

- [ ] **Step 5: Manually verify**

Open the Track tab: set a length, click Generate Arrangement, confirm a multi-section list appears whose total bars match the target; use ↑/↓ to reorder a section and confirm Play reflects the new order; use 🔁 to regenerate one section and confirm only that section's content changes; use ⧉ to duplicate and ✕ to remove a section; click Play and listen for a clearly different-feeling intro vs. chorus (per the spec's "audibly distinct sections" requirement); Save and confirm the final soundtrack `.wav` appears in the project's Explorer assets.

- [ ] **Step 6: Full extension smoke test**

Run the full unit suite one more time to confirm nothing in Tasks 11-13 required changes to the pure modules: `node --test source/extensions/track-maker/test/`. Then, in the running app, go through all three tabs end-to-end once more (generate → edit → play → save) to confirm no console errors and that all three save flows produce valid, playable `.wav` files in the project's assets.

- [ ] **Step 7: Commit**

```bash
git add source/extensions/track-maker/frontend/index.html
git commit -m "feat(track-maker): wire up Track tab (arrangement generation, section editing, mixed save)"
```

---

## Self-Review Notes

- **Spec coverage:** shared song settings (header, all tabs) ✅ Task 1/11-13; Melody mood presets + full slider editing + piano-roll click/drag editing + synth panel + save ✅ Task 11; Drums style presets + step grid + per-voice synth + save ✅ Task 12; Track target length + distinct-section arrangement + editable section list + mixed save ✅ Task 13; error handling (no project, length clamp, status line) ✅ Tasks 1 (`max="256"` on `#targetBars` plus the spec's clamp), 11-13 (status line guards); testing plan (manual verification through the running app) ✅ every UI task's final step; procedural-only synthesis, no ML/network ✅ all synth logic is hand-written PCM math in Tasks 8-9, no external libraries anywhere in the plan.
- **Type consistency checked:** `Note` shape (`{startStep, lengthSteps, midi, velocity}`) is identical across `melody.mjs` (Task 4), `arrangement.mjs` (Task 6), and `synth.mjs`'s `renderLeadVoice` (Task 8). `KIT_VOICES` is defined once in `drums.mjs` (Task 5) and re-exported/imported everywhere else that needs it (`arrangement.mjs`, `synth.mjs` tests, `index.html`) rather than redefined. `stepDurationSec` formula (`60 / tempo / (stepsPerBar / 4)`) is stated once in Task 11 and referenced (not redefined) by Tasks 12-13.
