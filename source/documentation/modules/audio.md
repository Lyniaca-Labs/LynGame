# engine.audio — AudioModule

Sound-effect/music playback layer over `engine.assets`'s cached `<audio>`
elements. `source/engine/modules/Audio.js`.

## Why it exists

Replaying the same cached `HTMLAudioElement` directly would restart it
instead of layering multiple overlapping instances (e.g. several cards
played in quick succession all wanting the same SFX). `engine.audio.play()`
clones the cached element per call so overlapping sounds play as
independent voices.

## Methods

- **`play(key, { volume = 1, loop = false, playbackRate = 1, onEnded } = {})`** →
  returns the playing instance (`HTMLAudioElement`, or a small wrapper object
  for the decoded-buffer path — same API either way), or `null` if `key`
  isn't a loaded asset (no error thrown — check the return value if you need
  to know it worked). `key` is an `engine.assets` manifest key for an
  `"audio"`-type asset. `volume` is multiplied by `masterVolume` and clamped
  `[0,1]`. `onEnded` fires when playback finishes on its own — not on a
  manual `.pause()`/`stopAll()` — handy for chaining the next track in a
  playlist. Autoplay-policy rejections are swallowed silently (sound just
  doesn't play). Keep the returned reference if you need to stop a looping
  sound early (`instance.pause()`) or fade/ramp its volume live
  (`instance.setVolume(0..1)`, `instance.getVolume()` — both work the same
  on either instance shape); discard it for one-shot SFX (it self-removes
  from internal tracking on the `"ended"` event).
- **`stopAll()`** — pauses and rewinds every currently-playing instance.
  Called automatically by `engine.loadScene()` so old scene's audio never
  bleeds into a new one — you don't need to call this yourself on scene
  transitions.
- **`setMasterVolume(volume)`** — clamps to `[0,1]`, stored as
  `engine.audio.masterVolume`. Only affects instances started **after** the
  call, and any later `instance.setVolume()` call on an already-playing one
  (each multiplies its own `volume` argument by the current `masterVolume`
  at call time) — it does not retroactively rescale a volume that was set
  and then left alone.

There is **no** per-instance/per-key `stop()` — to stop one specific sound,
call `.pause()` on the instance `play()` returned to you.

## Example

```js
// one-shot SFX
engine.audio.play("card_flip", { volume: 0.8 });

// looping music, stoppable later
const music = engine.audio.play("bgm", { loop: true, volume: 0.4 });
// ...later:
music?.setVolume(0.1); // live fade/ramp — no need to restart the track
music?.pause();

// non-looping playlist track that chains to the next one when it finishes
engine.audio.play("bgm_track_1", { onEnded: () => playNextTrack() });
```

## See also

- [assets.md](assets.md) — how `"audio"`-type assets get loaded
