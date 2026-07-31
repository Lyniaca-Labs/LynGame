# engine.gui — layout helpers

Plain, imperative arrangement functions — **not** components or systems.
`source/engine/modules/GUI.js`, exposed as `engine.gui`. Call them from a
script whenever the arranged set of entities *changes* (card drawn,
discarded, reordered) — they just write `Transform` fields once; nothing
re-invokes them automatically per frame (contrast with the live, every-tick
[Layout](../components/Layout.md) component).

This is the most directly card-game-relevant module in the engine.

## `layoutHand(entities, options = {})`

Fanned arc — classic hand-of-cards look: evenly spread horizontally,
rotated toward the edges, lifted along a shallow arc.

| option | default | meaning |
|---|---|---|
| `centerX` | `0` | World/screen X of the hand's midpoint. |
| `centerY` | `0` | World/screen Y of the hand's midpoint. |
| `spacing` | `60` | Horizontal distance between card centers. |
| `maxAngle` | `20` | Degrees the outermost cards rotate toward. |
| `arcHeight` | `18` | Px the outer cards lift along the arc. |
| `baseZIndex` | `0` | zIndex of card index 0; each subsequent card gets `+1` — **draw order follows array order**, so pass a reordered array to change which card overlaps which. |

```js
const hand = ["card_1", "card_2", "card_3"].map(id => engine.getEntity(id));
engine.gui.layoutHand(hand, { centerX: 400, centerY: 500, spacing: 70 });
```

Entities without a `Transform` are silently skipped. No-op on an empty array.

## `layoutRow(entities, options = {})`

Simple evenly-spaced row or column, no rotation/arc — deck/discard piles,
button bars, score readouts.

| option | default | meaning |
|---|---|---|
| `centerX` / `centerY` | `0` | Row/column midpoint. |
| `spacing` | `60` | Distance between item centers. |
| `direction` | `"horizontal"` | `"horizontal"` or `"vertical"`. |
| `baseZIndex` | `0` | Same draw-order semantics as `layoutHand`. |

## `layoutStack(entities, options = {})`

Stacks entities directly on top of each other with a tiny per-card pixel
offset, so a pile still visually reads as a stack — for deck/discard piles.

| option | default | meaning |
|---|---|---|
| `x` / `y` | `0` | Stack position. |
| `offsetPerCard` | `1.5` | Px shift per card (both axes). |
| `baseZIndex` | `0` | |

Explicitly resets `transform.rotation = 0` on every entity it touches.

## When to use this vs the `Layout` component

- **`engine.gui.*`**: one-shot, you control exactly when it re-runs (call it
  again after the hand changes). Cheaper, and gives the curved/rotated
  fanned-hand look `Layout` can't produce (Layout is axis-aligned grid/flow
  only).
- **`Layout` component**: live, re-arranges every tick automatically, but
  only does flexbox/grid-style axis-aligned placement.

## See also

- [Layout.md](../components/Layout.md)
- [USE_CASES.md](../USE_CASES.md#hand-of-cards) — full hand-of-cards recipe
