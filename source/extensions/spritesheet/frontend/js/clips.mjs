// Clip helpers. Clips reference frames by NAME (never index) so grid
// reordering never invalidates a clip — see the design doc's Data Model
// section for why.

export function createClip() {
  return { frames: [], fps: 8, loop: true };
}

export function uniqueClipName(clips, base) {
  if (!(base in clips)) return base;
  let n = 1;
  while (`${base}_${n}` in clips) n++;
  return `${base}_${n}`;
}

export function addFrameToClip(clip, frameName) {
  return { ...clip, frames: [...clip.frames, frameName] };
}

export function removeFrameFromClip(clip, index) {
  const frames = clip.frames.slice();
  frames.splice(index, 1);
  return { ...clip, frames };
}

export function moveFrameInClip(clip, from, to) {
  if (from === to) return clip;
  const frames = clip.frames.slice();
  const [moved] = frames.splice(from, 1);
  frames.splice(to, 0, moved);
  return { ...clip, frames };
}

// Keeps every clip's frame references in sync when a frame is renamed —
// without this, renaming a frame used in a clip would silently break that
// clip the next time it's loaded (the name it stored would no longer exist).
export function renameFrameInClips(clips, oldName, newName) {
  const next = {};
  for (const [clipName, clip] of Object.entries(clips)) {
    next[clipName] = { ...clip, frames: clip.frames.map((f) => (f === oldName ? newName : f)) };
  }
  return next;
}

// Strips a deleted frame out of every clip that referenced it.
export function removeFrameFromClips(clips, frameName) {
  const next = {};
  for (const [clipName, clip] of Object.entries(clips)) {
    next[clipName] = { ...clip, frames: clip.frames.filter((f) => f !== frameName) };
  }
  return next;
}
