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
