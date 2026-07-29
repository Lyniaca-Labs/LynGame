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
