import { createRng, randRange, randInt, pick } from "./rng.mjs";
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

// Musically-common note lengths (in steps at a 16-steps-per-bar grid);
// scaled proportionally for other subdivisions. Picking from a small set
// instead of an arbitrary random length keeps the generated rhythm feeling
// like a groove instead of an erratic run of odd durations.
const LENGTH_CHOICES_16 = [1, 2, 3, 4, 6, 8, 12, 16];

// Walks step-by-step across the phrase. At each step, probabilistically
// starts a new note (biased by density/syncopation, and by `accentSteps`
// if given — see below) or continues a rest; each new note's scale degree
// is a bounded random walk from the previous note's degree (bounded by
// `jump`, and biased toward small steps via a two-sample average so
// melodies stay mostly stepwise with occasional leaps rather than an
// erratic zig-zag), and degree is clamped to the requested register.
//
// `accentSteps` is an optional boolean[totalSteps] (section-relative, same
// indexing as a drum pattern's grid) marking steps where the drum pattern
// already has a strong hit (e.g. kick or snare). When provided, note
// onsets are biased to land on those steps too, so a generated melody
// rhythmically locks in with whatever drum pattern it's paired with
// instead of drifting independently against it.
export function generateMelody(params) {
  const {
    rootMidi, scaleName, bars, stepsPerBar,
    registerLowOctave, registerHighOctave,
    density, jump, syncopation, restProb, seed,
    accentSteps,
  } = params;

  const scaleLen = SCALES[scaleName].length;
  const minDegree = registerLowOctave * scaleLen;
  const maxDegree = registerHighOctave * scaleLen + (scaleLen - 1);
  const totalSteps = bars * stepsPerBar;

  // Quarter-note pulse for this subdivision (e.g. every 4th step at 16
  // steps/bar) — a much more musically meaningful "strong beat" than a
  // fixed step-parity check, and it's the same pulse a typical drum
  // pattern's kick/snare line up with.
  const pulseSteps = Math.max(1, Math.round(stepsPerBar / 4));
  const lengthScale = stepsPerBar / 16;
  const lengthChoices = LENGTH_CHOICES_16
    .map((l) => Math.max(1, Math.round(l * lengthScale)))
    .filter((l, i, arr) => arr.indexOf(l) === i);

  const rng = createRng(seed);
  const notes = [];
  let currentDegree = randInt(rng, minDegree, maxDegree);
  let step = 0;

  while (step < totalSteps) {
    const onStrongBeat = step % pulseSteps === 0;
    let onsetChance = onStrongBeat ? density : density * (0.4 + syncopation * 0.6);
    if (accentSteps && accentSteps[step]) onsetChance = Math.min(1, onsetChance + 0.35);
    const startsNote = rng() < onsetChance && rng() >= restProb;

    if (!startsNote) {
      step += 1;
      continue;
    }

    const maxJumpDegrees = 1 + Math.round(jump * 4);
    // Average two uniform picks instead of one: biases the interval walk
    // toward small steps (triangular-ish distribution) while still
    // allowing an occasional full-size leap, which reads as a much more
    // "flowing" contour than a uniform random walk.
    const walkA = randInt(rng, -maxJumpDegrees, maxJumpDegrees);
    const walkB = randInt(rng, -maxJumpDegrees, maxJumpDegrees);
    let nextDegree = currentDegree + Math.round((walkA + walkB) / 2);
    nextDegree = Math.max(minDegree, Math.min(maxDegree, nextDegree));
    currentDegree = nextDegree;

    const maxLen = Math.max(1, Math.min(stepsPerBar, totalSteps - step));
    const eligibleLengths = lengthChoices.filter((l) => l <= maxLen);
    if (!eligibleLengths.length) eligibleLengths.push(maxLen);
    // Higher density leans toward the shorter end of the eligible lengths
    // (more, busier notes); lower density leans longer (sparser, held notes).
    const shortHalf = eligibleLengths.slice(0, Math.max(1, Math.ceil(eligibleLengths.length / 2)));
    const lengthSteps = rng() < density ? pick(rng, shortHalf) : pick(rng, eligibleLengths);
    const midi = scaleDegreeToMidi(rootMidi, scaleName, currentDegree);
    const velocity = Math.min(1, Math.max(0.4, randRange(rng, 0.6, 1)));

    notes.push({ startStep: step, lengthSteps, midi, velocity });
    step += lengthSteps;
  }

  return notes;
}
