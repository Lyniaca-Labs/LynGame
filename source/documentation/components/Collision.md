# Collision

AABB/circle overlap detection, with optional physical push-apart resolution.
Group-based filtering (like physics layers), plus a `code` hook that runs
every frame two entities overlap.

## Schema

| field | type | default | description |
|---|---|---|---|
| `group` | string | `"default"` | What this entity IS, for group-filtering. |
| `collidesWith` | string | `""` | Comma-separated groups this entity interacts with, e.g. `"enemy,wall"`. |
| `resolve` | boolean | `false` | If true, overlaps are physically resolved (pushed apart). If false, detection-only (trigger). |
| `isStatic` | boolean | `false` | Infinite mass — never moved by resolution; the other side absorbs 100% of the push. |
| `mass` | number | `1` | Used for the push-apart ratio between two dynamic bodies. |
| `includeChildren` | boolean | `false` | Treat direct children's own `Collision` components as part of this rigid body — mass is summed across this entity + every direct child with a `Collision`, resolution uses THIS entity's `resolve`/`isStatic`, and the resulting push/bounce is applied to THIS entity's `Transform`/`Movement`, not the child's. |
| `shape` | select: `auto`\|`rect`\|`circle`\|`none` | `"auto"` | `"auto"` derives from this entity's `ShapeRenderer` (falls back to rect if absent/not circle). `"none"` = no hitbox of its own, for `includeChildren` mass/flags contribution without a shape. |
| `width` | number | `0` | Hitbox width (diameter for circles). `0` = derive from SpriteRenderer/ShapeRenderer/TextRenderer size. |
| `height` | number | `0` | Hitbox height. Ignored for circles. `0` = derive from renderer size. |
| `offsetX` | number | `0` | Horizontal offset of the hitbox from the entity's position. |
| `offsetY` | number | `0` | Vertical offset of the hitbox from the entity's position. |
| `onCollide` | code `(entity, other, engine)` | `null` | Runs every frame two entities overlap. |

## Group filtering

Two entities only get checked against each other if **at least one side**
"wants" the other: `A.collidesWith` includes `B.group`, OR `B.collidesWith`
includes `A.group`. `collidesWith` is comma-separated, trimmed, e.g.
`"enemy, wall"`.

## Detection vs resolution

- `resolve: false` on **both** sides → detection-only (a trigger/sensor):
  `onCollide` fires every overlapping frame, nothing gets physically pushed.
- `resolve: true` on either side → the pair is physically separated along
  the overlap's shortest axis, split by relative mass (`isStatic` = infinite
  mass, absorbs none of the push). Needs a `Movement` component on the
  entity being pushed to actually move (resolution writes to
  `Transform`/reads `Movement.bounce` if present).

## Runtime shape resolution

`shape: "auto"` checks this entity's `ShapeRenderer.shape` at collision-check
time — `"circle"` renderer → circle hitbox, anything else (including no
`ShapeRenderer` at all) → rect. `width`/`height` of `0` pull from whichever
renderer (`SpriteRenderer`/`ShapeRenderer`/`TextRenderer`) is present, via
the same `entity.getDimensions()` used by `Layout` and hit-testing.

## `onCollide(entity, other, engine)`

Runs **once per overlapping pair per frame**, for as long as they remain
overlapping (not edge-triggered — fires every frame of contact, not just on
first touch). `entity` is this component's own entity, `other` is the thing
it hit. Write `entity._touchedThisFrame` style flags yourself in the hook if
you need enter/exit edge detection — the engine doesn't track that for you.

## Static method (engine-internal)

`Collision.checkPair(entityA, entityB, engine)` — called once per unique
pair per frame by `GameEngine._update()`, not something you call yourself.

## Tick order note

Collision checks run **after** all `Movement`/script/other-component
`onTick`s for the frame (so it sees this frame's final pre-collision
positions), and **before** `Follow`/`Camera` (so those see post-collision
positions). See [ARCHITECTURE.md](../ARCHITECTURE.md#tick-order).

## See also

- [Movement.md](Movement.md) — `bounce`/`velocity` read during resolution
- [Interactable.md](Interactable.md) — for click/drag/hover instead of physical collision
