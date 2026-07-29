import test from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_ORDER,
  energyForSection,
  buildArrangement,
  generateArrangement,
  applyEnergyToMelodyParams,
  applyEnergyToDrumParams,
  scaleVelocity,
} from "../frontend/js/arrangement.mjs";
import { generateMelody } from "../frontend/js/melody.mjs";
import { generateDrumPattern, KIT_VOICES } from "../frontend/js/drums.mjs";

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

test("applyEnergyToMelodyParams/applyEnergyToDrumParams/scaleVelocity are exported and match generateArrangement's internal scaling", () => {
  // These are exported (Fix Round 1) specifically so index.html's per-section
  // "regenerate" action can replicate generateArrangement's per-type energy
  // shaping instead of falling back to raw/unscaled params.
  const rawMelodyParams = { registerLowOctave: 0, registerHighOctave: 1, density: 0.5, jump: 0.3, syncopation: 0.2, restProb: 0.2 };
  const rawDrumParams = { style: "fourOnFloor", density: 0.6, syncopation: 0.2 };

  for (const type of new Set(SECTION_ORDER)) {
    const energy = energyForSection(type);

    const scaledMelody = applyEnergyToMelodyParams(rawMelodyParams, energy);
    assert.equal(scaledMelody.density, Math.max(0.05, Math.min(1, rawMelodyParams.density * energy.densityMult)));
    assert.equal(scaledMelody.registerLowOctave, rawMelodyParams.registerLowOctave + energy.registerShift);
    assert.equal(scaledMelody.registerHighOctave, rawMelodyParams.registerHighOctave + energy.registerShift);

    const scaledDrum = applyEnergyToDrumParams(rawDrumParams, energy);
    assert.equal(scaledDrum.density, Math.max(0.05, Math.min(1, rawDrumParams.density * energy.densityMult)));
    assert.equal(scaledDrum.style, rawDrumParams.style); // untouched fields pass through

    const notes = [{ startStep: 0, lengthSteps: 1, midi: 60, velocity: 0.5 }];
    const scaledNotes = scaleVelocity(notes, energy.velocityMult);
    assert.equal(scaledNotes[0].velocity, Math.max(0, Math.min(1, 0.5 * energy.velocityMult)));
  }
});

test("regression: a regenerated section (index.html's regenerateSection flow) stays energy-scaled per its type, not raw/unscaled", () => {
  // Mirrors exactly what index.html's regenerateSection() does: call
  // generateMelody/generateDrumPattern directly (not generateArrangement),
  // but pass params through applyEnergyToMelodyParams/applyEnergyToDrumParams
  // and velocities through scaleVelocity first. Before the Fix Round 1 fix,
  // regenerateSection skipped this and used raw melodyState/drumState params
  // unconditionally, so a "chorus" section regenerated indistinguishably
  // from a "verse" one.
  const rootMidi = 60, scaleName = "major", stepsPerBar = 8, bars = 4, seed = 99;
  const rawMelodyParams = { registerLowOctave: 0, registerHighOctave: 1, density: 0.5, jump: 0.3, syncopation: 0.2, restProb: 0.1 };
  const rawDrumParams = { style: "fourOnFloor", density: 0.6, syncopation: 0.2 };

  function regenerateSectionLikeIndexHtml(type, sectionSeed) {
    const energy = energyForSection(type);
    const sectionMelodyParams = applyEnergyToMelodyParams(rawMelodyParams, energy);
    const rawNotes = generateMelody({ rootMidi, scaleName, bars, stepsPerBar, ...sectionMelodyParams, seed: sectionSeed });
    const notes = scaleVelocity(rawNotes, energy.velocityMult);

    const sectionDrumParams = applyEnergyToDrumParams(rawDrumParams, energy);
    const { grid } = generateDrumPattern({ bars, stepsPerBar, ...sectionDrumParams, seed: sectionSeed + 1 });

    return { notes, grid, energy };
  }

  const chorus = regenerateSectionLikeIndexHtml("chorus", seed);
  const outro = regenerateSectionLikeIndexHtml("outro", seed);

  // chorus energy (densityMult 1.15, velocityMult 1.1) is strictly louder
  // than outro energy (densityMult 0.45, velocityMult 0.6) per arrangement.mjs's
  // ENERGY table, so an average-velocity comparison should reflect that scaling
  // rather than both landing on the same raw/unscaled distribution.
  assert.ok(chorus.energy.velocityMult > outro.energy.velocityMult);
  const chorusAvgVel = chorus.notes.reduce((a, n) => a + n.velocity, 0) / (chorus.notes.length || 1);
  const outroAvgVel = outro.notes.reduce((a, n) => a + n.velocity, 0) / (outro.notes.length || 1);
  assert.ok(chorusAvgVel > outroAvgVel, `expected chorus avg velocity (${chorusAvgVel}) > outro avg velocity (${outroAvgVel})`);

  // And explicitly confirm the scaling actually took effect vs. raw params:
  // recompute chorus with NO energy scaling and show its velocities differ
  // from the energy-scaled version (proves scaleVelocity/applyEnergy* are
  // doing real work, not silently no-op-ing).
  const rawChorusNotes = generateMelody({ rootMidi, scaleName, bars, stepsPerBar, ...rawMelodyParams, seed });
  const rawAvgVel = rawChorusNotes.reduce((a, n) => a + n.velocity, 0) / (rawChorusNotes.length || 1);
  assert.notEqual(chorusAvgVel, rawAvgVel);
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

test("generateArrangement: melody note onsets are, in aggregate, biased toward drum accents (kick/snare)", () => {
  // A single seed's single section is too small a sample to check reliably
  // (a soft probability bias can easily miss on any one short section by
  // chance) — aggregate across many seeds/sections instead, which is what
  // the feature actually promises (a statistical lean toward the groove,
  // not a per-section guarantee).
  let totalOnsets = 0;
  let onAccentOnsets = 0;
  let totalSteps = 0;
  let totalAccentSteps = 0;

  for (let seed = 0; seed < 25; seed++) {
    const { sections } = generateArrangement({ ...ARR_BASE, seed });
    for (const s of sections) {
      const sectionSteps = s.bars * ARR_BASE.stepsPerBar;
      totalSteps += sectionSteps;
      for (let i = 0; i < sectionSteps; i++) {
        if (s.drumGrid.kick[i] || s.drumGrid.snare[i]) totalAccentSteps += 1;
      }
      for (const n of s.melodyNotes) {
        const localStep = n.startStep - s.startStep;
        totalOnsets += 1;
        if (s.drumGrid.kick[localStep] || s.drumGrid.snare[localStep]) onAccentOnsets += 1;
      }
    }
  }

  const accentStepFraction = totalAccentSteps / totalSteps;
  const onAccentFraction = onAccentOnsets / totalOnsets;
  assert.ok(
    onAccentFraction > accentStepFraction,
    `expected onset-accent alignment (${onAccentFraction}) to exceed chance level from accent density alone (${accentStepFraction})`
  );
});
