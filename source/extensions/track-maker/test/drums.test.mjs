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
