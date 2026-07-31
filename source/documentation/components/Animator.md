# Animator

Two bundled APIs: (A) imperative one-off property tweens (`animate()`), and
(B) named keyframe clips defined in the project's `animations/` folder and
resolved through the global `engine.animations` registry (`play()`). Use
this for a card flip, a UI element sliding in, a health bar draining, a
hover bump — anything that's "animate this numeric property over time,"
as opposed to [SpriteAnimation](SpriteAnimation.md) (frame-sequence
playback) or [Follow](Follow.md) (continuous target-tracking).

## Schema

| field | type | default | description |
|---|---|---|---|
| `clips` | animationRefs (string[]) | `[]` | Animation clip names this entity's Animator *can* play — curated list for the Inspector UI only (see gotcha below). |

## Imperative tween API

- **`animate(target, prop, to, { duration = 0.2, easing = "linear", onComplete = null } = {})`** → returns `this`. Animates `target[prop]` from its current value to `to` over `duration` seconds. `target` is any object with the property on it — typically another component instance, e.g. `entity.getComponent("Transform")`. No-op if `!target || !(prop in target)`. Re-calling on the same `(target, prop)` pair replaces the existing tween, restarting cleanly from the *current* live value (not the old tween's original start).
- **`stop(target, prop?)`** — removes matching tweens. Omit `prop` to stop everything on that target.
- **`isAnimating(target, prop?)`** → `boolean`.

```js
// example script/onClick body
const t = entity.getComponent("Transform");
entity.getComponent("Animator").animate(t, "y", t.y - 20, { duration: 0.15, easing: "easeOut", onComplete: (e, eng) => { /* bounce back */ } });
```

## Keyframe clip API

- **`play(clipName, { loop, restart = false, onComplete = null } = {})`** →
  returns `this`. Looks up `engine.animations[clipName]`; silent no-op if
  missing. If already playing this clip and `restart` isn't set, just
  updates `loop`/`onComplete` in place. Otherwise resolves each track's
  target component + captures the property's **current value as the
  animation's baseline** (used both as the implicit t=0 keyframe and as the
  base for `additive` mode — see below), then starts playing from t=0.
  Tracks pointing at a component this entity doesn't have are silently
  skipped.
- **`stopClip(clipName)`**, **`isPlayingClip(clipName)`** — same shape as the tween equivalents.

## Easing names

`linear`, `easeIn`, `easeOut`, `easeInOut` — used by both the tween API and
per-keyframe/per-track `easing` in clip JSON. Unrecognized names fall back
to linear.

## Animation clip JSON format

Stored in the project's `animations/` folder, one file per clip, referenced
by filename (no extension) as the clip name in `engine.animations`. See
[PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#animation-clip-json) for the
full authoritative schema; summary:

```json
{
  "duration": 2,
  "loop": true,
  "tracks": {
    "anyKey": {
      "target": "Transform",
      "property": "x",
      "keyframes": [{ "time": 0.5, "value": 100, "easing": "linear" }],
      "easing": "linear",
      "mode": "additive"
    }
  }
}
```

- `keyframes[].time` is a **0–1 fraction of `duration`**, not raw seconds.
- Keyframes don't need to start at `time: 0` or be pre-sorted — the engine
  sorts them and synthesizes an implicit `t=0` keyframe from the property's
  pre-play value (absolute mode) or `0` (additive mode) if the first real
  keyframe isn't already at `time: 0`.
- `mode: "additive"` is the only special mode: the sampled value is
  **added to** the property's pre-play baseline every frame, instead of
  replacing it — use this for a "bump relative to wherever it currently is"
  effect that composes with other things moving the same property.
  Anything else (including omitted `mode`) is absolute — the sampled value
  is written directly.
- Per-keyframe `easing` wins over the track-level `easing`, which wins over
  `"linear"`.

## Gotchas

- `clips` (the schema field) is **not** an allowlist — `play()` will happily
  play any name found in `engine.animations`, regardless of whether it's
  listed in this entity's `clips`. It exists purely to curate what shows up
  for this entity in the editor UI.
- Two unrelated systems both use the word "clip": `Animator` clips are
  project-level keyframe tracks; `SpriteAnimation` clips are spritesheet
  frame-sequences. See [SpriteAnimation.md](SpriteAnimation.md).

## See also

- [SpriteAnimation.md](SpriteAnimation.md) — the other "clip" system
- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#animation-clip-json) — full clip JSON schema
