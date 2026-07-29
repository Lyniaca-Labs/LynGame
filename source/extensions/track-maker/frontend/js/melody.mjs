import { createRng, randRange, randInt } from "./rng.mjs";
import { SCALES, scaleDegreeToMidi } from "./theory.mjs";

export const MOODS = {
  calm: { registerLowOctave: 0, registerHighOctave: 1, density: 0.35, jump: 0.15, syncopation: 0.1, restProb: 0.35 },
  playful: { registerLowOctave: 0, registerHighOctave: 1, density: 0.6, jump: 0.4, syncopation: 0.35, restProb: 0.2 },
  epic: { registerLowOctave: -1, registerHighOctave: 1, density: 0.55, jump: 0.5, syncopation: 0.2, restProb: 0.15 },
  mysterious: { registerLowOctave: -1, registerHighOctave: 0, density: 0.3, jump: 0.25, syncopation: 0.3, restProb: 0.4 },
  tense: { registerLowOctave: -1, registerHighOctave: 1, density: 0.7, jump: 0.6, syncopation: 0.5, restProb: 0.1 },
  bright: { registerLowOctave: 0, registerHighOctave: 2, density: 0.65, jump: 0.35, syncopation: 0.2, restProb: 0.15 },
};

export function moodToParams(moodName) {
  return { ...MOODS[moodName] };
}

// Walks step-by-step across the phrase. At each step, probabilistically
// starts a new note (biased by density/syncopation) or continues a rest;
// each new note's scale degree is a bounded random walk from the previous
// note's degree (bounded by `jump`) so melodies stay mostly stepwise with
// occasional leaps, and degree is clamped to the requested register.
export function generateMelody(params) {
  const {
    rootMidi, scaleName, bars, stepsPerBar,
    registerLowOctave, registerHighOctave,
    density, jump, syncopation, restProb, seed,
  } = params;

  const scaleLen = SCALES[scaleName].length;
  const minDegree = registerLowOctave * scaleLen;
  const maxDegree = registerHighOctave * scaleLen + (scaleLen - 1);
  const totalSteps = bars * stepsPerBar;

  const rng = createRng(seed);
  const notes = [];
  let currentDegree = randInt(rng, minDegree, maxDegree);
  let step = 0;

  while (step < totalSteps) {
    const onStrongBeat = step % 2 === 0;
    const onsetChance = onStrongBeat ? density : density * (0.4 + syncopation * 0.6);
    const startsNote = rng() < onsetChance && rng() >= restProb;

    if (!startsNote) {
      step += 1;
      continue;
    }

    const maxJumpDegrees = 1 + Math.round(jump * 4);
    let nextDegree = currentDegree + randInt(rng, -maxJumpDegrees, maxJumpDegrees);
    nextDegree = Math.max(minDegree, Math.min(maxDegree, nextDegree));
    currentDegree = nextDegree;

    const maxLen = Math.max(1, Math.min(stepsPerBar, totalSteps - step));
    const lengthSteps = Math.max(1, Math.min(maxLen, randInt(rng, 1, Math.max(1, Math.round((1 - density) * stepsPerBar) + 1))));
    const midi = scaleDegreeToMidi(rootMidi, scaleName, currentDegree);
    const velocity = Math.min(1, Math.max(0.4, randRange(rng, 0.6, 1)));

    notes.push({ startStep: step, lengthSteps, midi, velocity });
    step += lengthSteps;
  }

  return notes;
}
