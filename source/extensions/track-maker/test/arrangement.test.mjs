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
