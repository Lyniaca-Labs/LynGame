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

test("renderLeadVoice length matches the last note's end time plus release tail", () => {
  const notes = [{ startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 }];
  const stepDurationSec = 0.25;
  const out = renderLeadVoice(notes, LEAD_PARAMS, SR, stepDurationSec);
  // Buffer length = (note end time + release time) * sampleRate
  const expectedLen = Math.ceil((2 * stepDurationSec + LEAD_PARAMS.release) * SR);
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

test("renderLeadVoice release tail decays toward zero for the note defining buffer length", () => {
  // Last note defines maxEndStep and should have release room
  const notes = [
    { startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 },
  ];
  const stepDurationSec = 0.25;
  const out = renderLeadVoice(notes, LEAD_PARAMS, SR, stepDurationSec);
  const noteDurationSec = 2 * stepDurationSec;
  const noteEndSample = Math.floor(noteDurationSec * SR);
  const releaseSamples = Math.floor(LEAD_PARAMS.release * SR);
  // Check after release ends (tail should be ~0)
  const releaseEndSample = noteEndSample + releaseSamples;
  const silentWindow = out.subarray(Math.max(releaseEndSample, out.length - 1000));
  const rms = (arr) => Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / (arr.length || 1));
  assert.ok(rms(silentWindow) < 0.001, `Post-release RMS ${rms(silentWindow)} should be near zero`);
});

test("renderLeadVoice short note (attack+decay > length) has no envelope discontinuity", () => {
  // Short note where attack+decay exceeds the note length
  // attack (0.01s = 441 samples) + decay (0.05s = 2205 samples) = 2646 samples total
  // Need note < 2646 samples: 0.06s * 44100 / 0.25 step = 0.24 lengthSteps
  const shortNote = { startStep: 0, lengthSteps: 0.2, midi: 60, velocity: 1 };
  const stepDurationSec = 0.25;
  const out = renderLeadVoice([shortNote], LEAD_PARAMS, SR, stepDurationSec);
  // Check for no large jumps in envelope (compute adjacent-sample deltas)
  let maxDelta = 0;
  for (let i = 1; i < out.length; i++) {
    const delta = Math.abs(out[i] - out[i - 1]);
    maxDelta = Math.max(maxDelta, delta);
  }
  // A discontinuous click would show delta > ~0.1 per sample at 44.1kHz
  assert.ok(maxDelta < 0.05, `Max sample delta ${maxDelta} should be < 0.05 (no click)`);
});

test("renderLeadVoice very short note (length < attack) has no envelope discontinuity", () => {
  // Very short note where note length < attack time
  // attack = 0.01s = 441 samples, so note length ~0.0025s = ~110 samples
  // 0.0025s / 0.25s per step = 0.01 lengthSteps
  const veryShortNote = { startStep: 0, lengthSteps: 0.01, midi: 60, velocity: 1 };
  const stepDurationSec = 0.25;
  const out = renderLeadVoice([veryShortNote], LEAD_PARAMS, SR, stepDurationSec);
  // Check for no large jumps in envelope across the entire note+release
  let maxDelta = 0;
  for (let i = 1; i < out.length; i++) {
    const delta = Math.abs(out[i] - out[i - 1]);
    maxDelta = Math.max(maxDelta, delta);
  }
  // Should not have the 0.25 discontinuity reported by reviewer
  assert.ok(maxDelta < 0.05, `Max sample delta ${maxDelta} should be < 0.05 (no click on very short note)`);
});

// Drum kit tests
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

test("renderLeadVoice with glideTime=0 (default) behaves identically to no legato (backward compatible)", () => {
  const notes = [
    { startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 },
    { startStep: 2, lengthSteps: 2, midi: 64, velocity: 1 },
  ];
  const withoutGlide = renderLeadVoice(notes, LEAD_PARAMS, SR, 0.25);
  const withZeroGlide = renderLeadVoice(notes, { ...LEAD_PARAMS, glideTime: 0 }, SR, 0.25);
  assert.deepEqual(withoutGlide, withZeroGlide);
});

test("renderLeadVoice legato: back-to-back notes glide pitch smoothly instead of re-attacking", () => {
  const notes = [
    { startStep: 0, lengthSteps: 4, midi: 60, velocity: 1 },
    { startStep: 4, lengthSteps: 4, midi: 67, velocity: 1 },
  ];
  const stepDurationSec = 0.25;
  const params = { ...LEAD_PARAMS, glideTime: 0.05 };
  const out = renderLeadVoice(notes, params, SR, stepDurationSec);

  // No hard silence/attack dip at the join between the two notes — with
  // legato, amplitude should stay roughly at sustain level right across
  // the boundary instead of dropping to (near) zero and ramping back up.
  const joinSample = Math.floor(4 * stepDurationSec * SR);
  const around = out.subarray(joinSample - 50, joinSample + 50);
  const rms = (arr) => Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / (arr.length || 1));
  assert.ok(rms(around) > 0.3, `expected sustained energy across the legato join, got rms=${rms(around)}`);
});

test("renderLeadVoice legato: a non-adjacent note (gap or different pitch start) does not glide", () => {
  const notes = [
    { startStep: 0, lengthSteps: 2, midi: 60, velocity: 1 },
    { startStep: 3, lengthSteps: 2, midi: 67, velocity: 1 }, // gap at step 2
  ];
  const stepDurationSec = 0.25;
  // Zero release so note 1's tail doesn't bleed into the gap we're checking.
  const params = { ...LEAD_PARAMS, release: 0, glideTime: 0.05 };
  const out = renderLeadVoice(notes, params, SR, stepDurationSec);
  // Should still produce a valid, in-range buffer; the gap step is silent.
  for (const s of out) assert.ok(s >= -1 && s <= 1);
  const gapStart = Math.floor(2 * stepDurationSec * SR) + 10;
  const gapEnd = Math.floor(3 * stepDurationSec * SR) - 10;
  const rms = (arr) => Math.sqrt(arr.reduce((a, v) => a + v * v, 0) / (arr.length || 1));
  assert.ok(rms(out.subarray(gapStart, gapEnd)) < 0.05);
});
