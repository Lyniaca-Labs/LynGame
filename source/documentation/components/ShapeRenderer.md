# ShapeRenderer

Draws a filled rectangle or circle centered on the entity's `Transform`. The
cheapest visible thing you can put on an entity — placeholders, particles,
debug boxes, flat-color UI panels.

## Schema

| field | type | default | description |
|---|---|---|---|
| `shape` | select: `rect`\|`circle` | `"rect"` | Shape to draw. |
| `width` | number | `32` | Width in pixels (diameter, for circles). |
| `height` | number | `32` | Height in pixels. Ignored for circles (width is used as the diameter). |
| `color` | color (hex string) | `"#fff"` | Fill color. |

## `render(ctx, transform, entity, engine)`

Translates to the entity's world position (subtracting camera offset unless
`transform.fixed`), rotates by `transform.rotation` (degrees), fills a rect
centered at the origin (`-width/2, -height/2, width, height`) or a circle of
radius `width/2`.

## Gotchas

- No stroke/outline option — solid fill only. Layer a second, larger,
  differently-colored `ShapeRenderer`-bearing child entity behind it if you
  want a border look.
- `Collision`'s `shape: "auto"` reads `ShapeRenderer.shape` to decide
  rect-vs-circle hitbox — keep them in sync if you rely on that.
- `Entity.getDimensions()` (used by `Layout`, `Interactable.autoDimensions`,
  hit-testing) reads `width`/`height` from here (maxed against
  `SpriteRenderer` if both are present, but **overridden** by `TextRenderer`
  if that's also present — see [Layout.md](Layout.md)).

## See also

- [SpriteRenderer.md](SpriteRenderer.md) — image-based rendering
- [Emitter.md](Emitter.md) — spawns particles using this component by default
