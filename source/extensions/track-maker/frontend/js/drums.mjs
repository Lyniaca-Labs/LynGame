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

export function generateDrumPattern({ bars, stepsPerBar, style, density, syncopation, seed }) {
  const totalSteps = bars * stepsPerBar;
  const rng = createRng(seed);
  const styleDef = DRUM_PATTERN_STYLES[style];
  const grid = {};

  for (const voice of KIT_VOICES) {
    const basePulsesPerBar = styleDef[voice].pulses;
    const scaledPulsesPerBar = Math.round(basePulsesPerBar * (stepsPerBar / 16) * density);
    const perBar = euclideanRhythm(scaledPulsesPerBar, stepsPerBar);
    const full = [];
    for (let b = 0; b < bars; b++) {
      for (let s = 0; s < stepsPerBar; s++) {
        let hit = perBar[s];
        // syncopation randomly nudges a small fraction of on-hits off and nearby steps on,
        // but only for voices with non-zero base pulses (keeps explicitly silent voices silent).
        if (basePulsesPerBar > 0 && rng() < syncopation * 0.15) hit = !hit;
        full.push(hit);
      }
    }
    grid[voice] = full.slice(0, totalSteps);
  }

  return { steps: totalSteps, grid };
}
