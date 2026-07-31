# Transform

Position, rotation, draw order. The one component almost every visible or
spatial entity has — most other components (renderers, `Movement`,
`Collision`, `Follow`, `Camera`, `Interactable`) read or write it.

## Schema

| field | type | default | description |
|---|---|---|---|
| `x` | number | `0` | X position. Relative to the parent entity, if this entity has one. |
| `y` | number | `0` | Y position. Relative to the parent entity, if this entity has one. |
| `rotation` | number | `0` | Rotation in degrees. Relative to the parent entity, if this entity has one. |
| `fixed` | boolean | `false` | If true, this entity ignores camera panning (screen-space UI). Also makes it opt out of inheriting a parent's world transform (see below). |
| `zIndex` | number | `0` | Draw order within the layer. Higher values draw on top of lower ones (ties keep spawn order). |

## Local space vs world space

`x`/`y`/`rotation` are **local** — relative to the entity's parent (see
`Entity.addChild`). Renderers and hit-testing never read the raw `Transform`
directly on a parented entity; they read `entity.getWorldTransform(engine)`
(see [ENTITY_API.md](../ENTITY_API.md)), which composes local transforms up
through every ancestor. A top-level entity's world transform is just its
local transform.

`fixed: true` has two effects at once:
1. Camera panning is skipped (used for screen-space HUD/UI).
2. The entity's own transform is used as-is instead of being composed with
   its parent's world transform — i.e. `fixed` also means "absolute, ignore
   parent nesting."

## Methods

- `getRawPosition()` → `{x, y}` — local position, no camera/parent math.
- `getPosition(engine)` → `{x, y}` — local position + camera offset (does
  **not** account for parent nesting — for a parented entity's true screen
  position use `entity.getWorldTransform(engine)` instead).

## Draw order

`zIndex` is read by `GameEngine._render()`, which stable-sorts **all**
entities (not just siblings) by `Transform.zIndex` before drawing. Same
value → original spawn order. There's no per-layer zIndex scoping — it's a
single global draw order across the whole scene.

## Gotchas

- Setting `x`/`y` on a parented entity moves it relative to its parent, not
  in world coordinates. If you need a world-space position for a child, use
  `getWorldTransform()` to read it, but you still have to write the local
  offset back.
- `fixed` entities render in raw screen-pixel coordinates (0,0 = top-left of
  the game viewport) — see [Anchor.md](Anchor.md) for a component that
  computes those coordinates for you.

## See also

- [ENTITY_API.md](../ENTITY_API.md) — `getWorldTransform`, `addChild`
- [Anchor.md](Anchor.md) — screen-corner-relative positioning built on `fixed`
- [Layout.md](Layout.md) — auto-arranges children's `Transform.x/y`
