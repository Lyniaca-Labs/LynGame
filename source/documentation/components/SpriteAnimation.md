# SpriteAnimation

Steps a **sibling** `SpriteRenderer`'s `frame` field through a named
frame-sequence clip defined in that renderer's spritesheet asset metadata.
Renders nothing itself — it's a pure driver of `SpriteRenderer`. For
keyframe/property tweening (position, rotation, arbitrary numeric fields)
see [Animator.md](Animator.md) instead — different system, similarly-named
concept ("clip"), don't confuse the two.

## Schema

| field | type | default | description |
|---|---|---|---|
| `clip` | string | `""` | Name of a clip defined in the sibling `SpriteRenderer`'s spritesheet. |
| `playing` | boolean | `true` | Whether the clip is currently advancing. |
| `speed` | number | `1` | Playback speed multiplier. |

Setting `clip` directly (e.g. from the Inspector or a script) starts it
playing immediately since `playing` defaults to `true` — no method call
needed for the common "just loop this clip" case.

## Methods

- **`play(clipName, { loop, restart = false, onComplete = null } = {})`** →
  returns `this`. If this exact clip is already playing and `restart` isn't
  set, just updates `loop`/`onComplete` in place (does not reset/restart).
  Otherwise switches to `clipName` and restarts from frame 0.
  `loop` overrides the clip JSON's own `loop` value; omit it to use the
  clip's default.
- **`stop()`** → returns `this`. Sets `playing = false`. **Does not**
  preserve position for a resume — see gotcha below.
- **`isPlaying(clipName?)`** → `boolean`. No-arg checks if anything is
  playing; with a name, checks that specific clip.

## `onTick(entity, engine, dt)`

No-op if not playing or no clip set. Looks up the sibling `SpriteRenderer`
and its resolved spritesheet asset's `meta.clips[clip]`
(`{frames: string[], fps, loop}`). Advances an internal elapsed-time
counter by `dt * speed`, computes the current frame index from `fps`, wraps
or clamps depending on `loop` (explicit `play()` override > clip's own
`loop` > default `true`), and writes the resulting **frame name** into the
sibling `SpriteRenderer.frame`. On a non-looping clip reaching its last
frame, sets `playing = false` and fires `onComplete?.(entity, engine)`
exactly once.

## Spritesheet `clips` JSON (on the spritesheet asset, not the manifest)

```json
{
  "cellWidth": 32, "cellHeight": 32, "columns": 4,
  "frames": [{ "index": 0, "name": "idle_0" }, { "index": 1, "name": "idle_1" }],
  "clips": {
    "idle":   { "frames": ["idle_0", "idle_1", "idle_2", "idle_3"], "fps": 6, "loop": true },
    "bounce": { "frames": ["bounce_0", "bounce_1"], "fps": 8, "loop": true }
  }
}
```
See [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#spritesheet-json) for the
full spritesheet asset format.

## Gotchas

- **`stop()` + `play()` on the same clip name always restarts from frame 0**
  — it does not resume where it left off, because `stop()` clears the
  "already playing" fast-path condition that `play()` checks.
- Requires a sibling `SpriteRenderer` with `sprite` already pointing at a
  **spritesheet**-type asset (not a plain image) with a non-empty
  `clips[clip].frames` array — silently does nothing otherwise.
- "Clip" here means a spritesheet frame-sequence. `Animator`'s "clip" means
  a project-level keyframe track file. They are unrelated systems that
  happen to share vocabulary.

## See also

- [SpriteRenderer.md](SpriteRenderer.md) — the component this drives
- [Animator.md](Animator.md) — the *other* "clip" system (property tweening)
