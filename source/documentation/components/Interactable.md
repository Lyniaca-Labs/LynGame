# Interactable

Mouse/pointer interaction: click, hover, hold, and drag, with `code` hooks
for each. This is how a card gets picked up, hovered for a tooltip, or
clicked to play — the primary input component for card-game-style UI.

## Schema

| field | type | default | description |
|---|---|---|---|
| `width` | number | `0` | Width of the hit area, in pixels. `0` combined with `autoDimensions` derives from the renderer. |
| `height` | number | `0` | Height of the hit area, in pixels. |
| `offsetX` | number | `0` | Horizontal offset of the hit area. |
| `offsetY` | number | `0` | Vertical offset of the hit area. |
| `cursor` | select: `pointer`\|`grab`\|`default`\|`text`\|`not-allowed` | `"pointer"` | CSS cursor shown while hovering this entity. |
| `holdThreshold` | number | `0.4` | Seconds pressed before `onHold` fires. |
| `dragThreshold` | number | `25` | Pixels of movement before a press becomes a drag (below this, a press+release counts as a click instead). |
| `autoDimensions` | boolean | (seen `true` in examples) | Derive `width`/`height` from the entity's renderer (`SpriteRenderer`/`ShapeRenderer`/`TextRenderer`) via `getDimensions()` instead of the explicit fields. |
| `onClick` | code `(entity, engine)` | `null` | Press + release without exceeding `dragThreshold`. |
| `onHoverEnter` | code `(entity, engine)` | `null` | Pointer enters the hit area. |
| `onHoverExit` | code `(entity, engine)` | `null` | Pointer leaves the hit area. |
| `onHold` | code `(entity, engine)` | `null` | Pressed continuously past `holdThreshold`, without exceeding `dragThreshold`. |
| `onDragStart` | code `(entity, engine, data)` | `null` | Movement exceeds `dragThreshold` while pressed. `data = {x, y}` (world coords). |
| `onDrag` | code `(entity, engine, data)` | `null` | Fires every pointer-move while dragging. `data = {x, y, dx, dy}` (world coords + this-move delta). |
| `onDragEnd` | code `(entity, engine, data)` | `null` | Release while dragging. `data = {x, y}`. |

## Event model

Two passes per frame, both driven by `GameEngine._update()` (see
[ARCHITECTURE.md](../ARCHITECTURE.md#tick-order)):

1. **Edge-triggered pointer events** (`handlePointerEvent`): press-start,
   drag-start/drag/drag-end, click — driven by the input module's drained
   event queue, so these fire exactly once per actual DOM event, not once
   per frame.
2. **Continuous per-frame** (`onTick`): hover enter/exit (can change even
   with no new pointer event, if the entity itself moves under a still
   cursor) and hold (time-based, accumulates by `dt`).

All hit-testing converts screen→world coordinates accounting for camera
offset (unless `Transform.fixed`) and composes through parent transforms
(uses `getWorldTransform`), so nested/parented interactable entities hit-test
correctly.

## Click vs drag vs hold — mutually exclusive per press

A single press resolves to exactly one of these:
- Released before `dragThreshold` px of movement and before `holdThreshold`
  seconds → **click**.
- Movement exceeds `dragThreshold` first → **drag** (`onDragStart` fires
  once, `onDrag` on each subsequent move, `onDragEnd` on release). No click
  fires for a press that became a drag.
- Held past `holdThreshold` without exceeding `dragThreshold` → **hold**.

## Gotchas

- `code` fields have **different scope variables per field** — `onDrag*`
  hooks get a third `data` param the others don't. See
  [SCRIPTING.md](../SCRIPTING.md#code-hook-fields) for the full table.
- `width`/`height` of `0` only produce a real hit area if `autoDimensions`
  is on (or a renderer exists to derive from) — a bare `Interactable` with
  no renderer and explicit `0` size has no clickable area at all.

## See also

- [Collision.md](Collision.md) — physical overlap instead of pointer interaction
- [SCRIPTING.md](../SCRIPTING.md) — the `code` field / `compileCode` convention
