export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export function noteNameToMidi(name, octave) {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx === -1) throw new Error(`Unknown note name "${name}"`);
  return (octave + 1) * 12 + idx;
}

// degree is a zero-based index into SCALES[scaleName] that may be negative
// or >= scale length; it wraps across octaves using floor-division so
// e.g. degree -1 lands on the scale's last degree, one octave down.
export function scaleDegreeToMidi(rootMidi, scaleName, degree) {
  const scale = SCALES[scaleName];
  if (!scale) throw new Error(`Unknown scale "${scaleName}"`);
  const len = scale.length;
  const octaveShift = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + octaveShift * 12 + scale[idx];
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi) {
  const idx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[idx]}${octave}`;
}
