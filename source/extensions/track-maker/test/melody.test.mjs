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
