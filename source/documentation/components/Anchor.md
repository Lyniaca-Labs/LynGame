# Anchor

Pins an entity to a corner/edge of the viewport with a pixel offset,
independent of camera panning or resolution — the mechanism for HUD-style
screen-space UI (score counters, buttons, pile labels).

## Schema

| field | type | default | description |
|---|---|---|---|
| `anchor` | select | `"top-left"` | Which corner/edge of the viewport this entity sticks to. One of: `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`. |
| `offsetX` | number | `0` | Pixels to the right of the anchor point. |
| `offsetY` | number | `0` | Pixels below the anchor point. |

## Usage

Add both `Anchor` and `Transform` to the same entity. `Anchor` drives the
`Transform` every frame; other components (`TextRenderer`, `ShapeRenderer`,
`Interactable`, ...) just read the `Transform` as normal — you don't need
to do anything special in a renderer to make it "anchor-aware."

## `onTick(entity, engine)`

Every frame: looks up the viewport size (`engine.getViewportSize()`),
computes `transform.x = viewportWidth * anchorFactor.x + offsetX` and
`transform.y = viewportHeight * anchorFactor.y + offsetY` (anchor factor is
`0`/`0.5`/`1` per axis depending on which of the 9 anchor points is chosen),
and **unconditionally forces `transform.fixed = true`** every tick — an
Anchor-driven entity can never have `Transform.fixed` be `false`, even if
something else tries to set it.

## Gotchas

- No-op if the entity has no `Transform` component at all (silently skips).
- If you also parent children to an anchored entity, those children's local
  `x`/`y` are relative to the anchor point, not the raw viewport corner —
  useful for grouping a whole HUD panel under one anchored root.

## See also

- [Transform.md](Transform.md) — `fixed` semantics
- [Layout.md](Layout.md) — combine with Anchor to auto-arrange a HUD panel's children
