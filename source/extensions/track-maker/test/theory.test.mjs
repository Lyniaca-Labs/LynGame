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
