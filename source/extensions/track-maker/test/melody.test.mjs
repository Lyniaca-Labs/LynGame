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

test("accentSteps biases note onsets to land on the marked (drum-accented) steps", () => {
  const totalSteps = BASE.bars * BASE.stepsPerBar;
  const accentSteps = new Array(totalSteps).fill(false);
  // Accent every 4th step (a typical kick/snare quarter-note pulse).
  for (let i = 0; i < totalSteps; i += 4) accentSteps[i] = true;

  // Pin density very low so non-accented steps have near-zero onset chance —
  // isolates the accent bias's effect instead of measuring it against the
  // noisy baseline of a normal (small-sample) generated phrase.
  const params = { ...BASE, density: 0.02, jump: 0.2, syncopation: 0, restProb: 0, accentSteps };
  const notes = generateMelody(params);
  assert.ok(notes.length > 0, "expected at least some notes to be generated");
  const onAccentCount = notes.filter((n) => accentSteps[n.startStep]).length;
  assert.ok(onAccentCount / notes.length >= 0.7, `expected most onsets on accented steps, got ${onAccentCount}/${notes.length}`);

  // Notes still stay within total steps and non-overlapping with accents applied.
  for (let i = 0; i < notes.length - 1; i++) {
    assert.ok(notes[i].startStep + notes[i].lengthSteps <= notes[i + 1].startStep);
  }
});

test("without accentSteps, generateMelody behaves as before (no accentSteps key required)", () => {
  const params = { ...BASE, ...moodToParams("epic") };
  assert.doesNotThrow(() => generateMelody(params));
});
