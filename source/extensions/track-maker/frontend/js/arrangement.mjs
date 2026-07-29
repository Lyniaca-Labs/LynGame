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

// Exported so callers (e.g. index.html's per-section "regenerate" action) can
// apply the exact same per-type energy shaping that generateArrangement uses
// internally, without duplicating the multiplier math. Generation logic here
// is unchanged from before these exports were added.
export function applyEnergyToMelodyParams(melodyParams, energy) {
  return {
    ...melodyParams,
    density: Math.max(0.05, Math.min(1, melodyParams.density * energy.densityMult)),
    registerLowOctave: melodyParams.registerLowOctave + energy.registerShift,
    registerHighOctave: melodyParams.registerHighOctave + energy.registerShift,
  };
}

export function applyEnergyToDrumParams(drumParams, energy) {
  return {
    ...drumParams,
    density: Math.max(0.05, Math.min(1, drumParams.density * energy.densityMult)),
  };
}

export function scaleVelocity(notes, mult) {
  return notes.map((n) => ({ ...n, velocity: Math.max(0, Math.min(1, n.velocity * mult)) }));
}

export function generateArrangement({ rootMidi, scaleName, stepsPerBar, melodyParams, drumParams, targetBars, seed, sectionBars = 4 }) {
  const sectionDefs = buildArrangement({ targetBars, sectionBars });
  const sections = [];
  let startStep = 0;

  sectionDefs.forEach((def, index) => {
    const energy = energyForSection(def.type);
    const sectionSeed = seed + index * 1000;

    // Drums are generated first so the melody can be handed an accent mask
    // (kick/snare hit steps) and lock its note onsets to the same groove
    // instead of drifting independently against it.
    const sectionDrumParams = applyEnergyToDrumParams(drumParams, energy);
    const rawPattern = generateDrumPattern({
      bars: def.bars, stepsPerBar, seed: sectionSeed + 1,
      ...sectionDrumParams,
    });
    const accentSteps = rawPattern.grid.kick.map((k, i) => k || rawPattern.grid.snare[i]);

    const sectionMelodyParams = applyEnergyToMelodyParams(melodyParams, energy);
    const rawNotes = generateMelody({
      rootMidi, scaleName, bars: def.bars, stepsPerBar,
      ...sectionMelodyParams, seed: sectionSeed, accentSteps,
    });
    const melodyNotes = scaleVelocity(rawNotes, energy.velocityMult).map((n) => ({
      ...n,
      startStep: n.startStep + startStep,
    }));

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
