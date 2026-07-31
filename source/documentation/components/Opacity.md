# Opacity

A single transparency multiplier for an entity, applied to everything it
renders (all components with a `render()` method on that entity).

## Schema

| field | type | default | description |
|---|---|---|---|
| `value` | number | `1` | `0` = fully transparent, `1` = fully opaque. |

## Behavior

`Opacity` renders nothing itself. `GameEngine._render()` special-cases it:
if an entity has an `Opacity` component with `value !== 1`, it wraps that
entity's whole render step in `ctx.save()` / `ctx.globalAlpha = value` /
`ctx.restore()` — so it affects every renderer on the entity uniformly
(`SpriteRenderer` + `TextRenderer` on the same entity both fade together).

## Gotchas

- **Does not cascade to child entities.** Fading a parent entity's `Opacity`
  does not fade its children — each child renders independently with its
  own `Opacity` (or none = fully opaque) in `GameEngine._render()`'s flat
  per-entity loop. If you fade a prefab instance that has children (e.g. a
  card with separate art/text/icon children), you need `Opacity` on each
  child too, or accept that only the parent shape fades. `Emitter`'s
  prefab-particle support hits exactly this — see
  [Emitter.md](Emitter.md#gotchas).
- `value !== 1` is the check used to decide whether to even bother with
  `ctx.save()`/`globalAlpha` — so `value: 1` (the default) costs nothing
  extra at render time.

## See also

- [Emitter.md](Emitter.md) — fades particles out over their lifetime using this
