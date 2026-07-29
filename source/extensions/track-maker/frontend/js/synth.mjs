import { midiToHz } from "./theory.mjs";

export const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"];

export function oscillatorSample(waveform, phase01) {
  const p = phase01 - Math.floor(phase01);
  switch (waveform) {
    case "sine": return Math.sin(p * 2 * Math.PI);
    case "square": return p < 0.5 ? 1 : -1;
    case "sawtooth": return 1 - p * 2;
    case "triangle": return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
    default: return 0;
  }
}

// One-pole low-pass, cutoff01 in [0,1] mapped to a coefficient — same
// shape of filter as sfx-generator's LPF, reused for the lead voice's
// filterCutoff param.
function applyLowPass(samples, cutoff01) {
  if (cutoff01 >= 1) return samples;
  const a = Math.max(0.001, cutoff01);
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    prev = prev + a * (samples[i] - prev);
    samples[i] = prev;
  }
  return samples;
}

export function renderLeadVoice(notes, synthParams, sampleRate, stepDurationSec) {
  if (!notes.length) return new Float32Array(0);

  const { waveform, attack, decay, sustainLevel, release, filterCutoff, vibratoDepth, vibratoRate } = synthParams;
  const maxEndStep = Math.max(...notes.map((n) => n.startStep + n.lengthSteps));
  // Include release tail room for the note defining maxEndStep
  const totalSamples = Math.ceil((maxEndStep * stepDurationSec + release) * sampleRate);
  const out = new Float32Array(totalSamples);

  for (const note of notes) {
    const startSample = Math.floor(note.startStep * stepDurationSec * sampleRate);
    const noteDurationSec = note.lengthSteps * stepDurationSec;
    const noteSamples = Math.max(1, Math.floor(noteDurationSec * sampleRate));
    const releaseSamples = Math.floor(release * sampleRate);
    const totalNoteSamples = Math.min(out.length - startSample, noteSamples + releaseSamples);
    if (totalNoteSamples <= 0) continue;

    const hz = midiToHz(note.midi);
    const attackSamples = Math.max(1, Math.floor(attack * sampleRate));
    const decaySamples = Math.max(1, Math.floor(decay * sampleRate));

    // Compute envelope value at note-off boundary (i = noteSamples - 1)
    // to ensure smooth transition into release phase
    let envAtNoteOff = sustainLevel;
    const noteOffIndex = noteSamples - 1;
    if (noteOffIndex < attackSamples) {
      envAtNoteOff = noteOffIndex / attackSamples;
    } else {
      const decayEndSample = Math.min(attackSamples + decaySamples, noteSamples);
      if (noteOffIndex < decayEndSample) {
        const t = (noteOffIndex - attackSamples) / (decayEndSample - attackSamples);
        envAtNoteOff = 1 - t * (1 - sustainLevel);
      } else {
        envAtNoteOff = sustainLevel;
      }
    }

    let phase = 0;
    let vibPhase = 0;
    for (let i = 0; i < totalNoteSamples; i++) {
      vibPhase += vibratoRate / sampleRate;
      const vibHz = hz * (1 + Math.sin(vibPhase * 2 * Math.PI) * vibratoDepth * 0.06);
      phase += vibHz / sampleRate;

      let env;
      if (i < noteSamples) {
        // Note is still sounding: compute envelope respecting note-off boundary
        if (i < attackSamples) {
          env = i / attackSamples;
        } else {
          const decayEndSample = Math.min(attackSamples + decaySamples, noteSamples);
          if (i < decayEndSample) {
            const t = (i - attackSamples) / (decayEndSample - attackSamples);
            env = 1 - t * (1 - sustainLevel);
          } else {
            env = sustainLevel;
          }
        }
      } else {
        // Release phase: fade from envelope value at note-off
        const t = (i - noteSamples) / Math.max(1, releaseSamples);
        env = envAtNoteOff * Math.max(0, 1 - t);
      }

      const sample = oscillatorSample(waveform, phase) * env * note.velocity;
      out[startSample + i] += sample;
    }
  }

  applyLowPass(out, filterCutoff);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

export const DEFAULT_DRUM_VOICE_PARAMS = {
  kick: { basePitchHz: 150, pitchDecay: 0.04, ampDecay: 0.25, toneNoiseMix: 0.05, clickAmount: 0.3 },
  snare: { basePitchHz: 200, pitchDecay: 0.02, ampDecay: 0.15, toneNoiseMix: 0.6, clickAmount: 0.4 },
  closedHat: { basePitchHz: 6000, pitchDecay: 0.005, ampDecay: 0.04, toneNoiseMix: 0.95, clickAmount: 0.1 },
  openHat: { basePitchHz: 5000, pitchDecay: 0.005, ampDecay: 0.25, toneNoiseMix: 0.9, clickAmount: 0.1 },
  clap: { basePitchHz: 1200, pitchDecay: 0.01, ampDecay: 0.12, toneNoiseMix: 0.85, clickAmount: 0.2 },
  tom: { basePitchHz: 180, pitchDecay: 0.06, ampDecay: 0.3, toneNoiseMix: 0.15, clickAmount: 0.15 },
};

function noiseSample() {
  return Math.random() * 2 - 1;
}

export function renderDrumHit(voiceType, voiceParams, sampleRate) {
  const { basePitchHz, pitchDecay, ampDecay, toneNoiseMix, clickAmount } = voiceParams;
  const length = Math.max(64, Math.floor(ampDecay * 4 * sampleRate));
  const out = new Float32Array(length);
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const pitchEnv = Math.exp(-t / Math.max(0.001, pitchDecay));
    const hz = basePitchHz * (1 + pitchEnv * 2);
    phase += hz / sampleRate;

    const tone = Math.sin(phase * 2 * Math.PI);
    const noise = noiseSample();
    let s = tone * (1 - toneNoiseMix) + noise * toneNoiseMix;

    if (t < 0.002) s += (1 - t / 0.002) * clickAmount * (Math.random() * 2 - 1);

    const ampEnv = Math.exp(-t / Math.max(0.001, ampDecay));
    out[i] = Math.max(-1, Math.min(1, s * ampEnv));
  }

  return out;
}

export function renderDrumKit(grid, voiceParamsByVoice, sampleRate, stepDurationSec, swing) {
  const voices = Object.keys(grid);
  const steps = grid[voices[0]]?.length ?? 0;
  const baseLength = Math.ceil(steps * stepDurationSec * sampleRate);
  const tailLength = Math.ceil(1 * sampleRate); // headroom for decay tails past the last step
  const out = new Float32Array(baseLength + tailLength);

  for (const voice of voices) {
    const hits = grid[voice];
    const params = voiceParamsByVoice[voice] ?? voiceParamsByVoice[Object.keys(voiceParamsByVoice)[0]];
    for (let step = 0; step < hits.length; step++) {
      if (!hits[step]) continue;
      const swingOffsetSec = step % 2 === 1 ? swing * stepDurationSec * 0.5 : 0;
      const startSample = Math.floor((step * stepDurationSec + swingOffsetSec) * sampleRate);
      const hit = renderDrumHit(voice, params, sampleRate);
      for (let i = 0; i < hit.length && startSample + i < out.length; i++) {
        out[startSample + i] += hit[i];
      }
    }
  }

  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}
