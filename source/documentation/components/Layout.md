# Layout

Automatically arranges an entity's **direct children** every tick —
flexbox-style (`flow`, wraps along one axis) or grid-style (fixed
rows/columns, content-sized tracks). Writes into each child's own
`Transform.x/y` (as their center point). Good fit for a hand of cards, a
row of buttons, an inventory grid — though for hand-fanning specifically,
[GUI.layoutHand](../modules/gui.md) gives a curved/rotated arrangement
`Layout` doesn't (Layout is axis-aligned only).

## Schema

| field | type | default | description |
|---|---|---|---|
| `mode` | select: `flow`\|`grid` | `"flow"` | `flow` wraps children flexbox-style. `grid` places them into a fixed row/column grid with content-sized tracks. |
| `direction` | select: `row`\|`column` | `"row"` | Main axis (flow) or row-major vs column-major fill order (grid). |
| `wrap` | boolean | `true` | Flow only: wrap onto a new line instead of one endless line. |
| `width` | number | `0` | Container box width, px. `0` = unbounded. Flow+row: triggers wraps. |
| `height` | number | `0` | Container box height, px. `0` = unbounded. Flow+column: triggers wraps. |
| `gapX` | number | `0` | Horizontal spacing between items, px. |
| `gapY` | number | `0` | Vertical spacing between items, px (between wrapped lines in flow; row gap in grid). |
| `maxCols` | number | `0` | Flow: caps items per row before wrapping. Grid: fixed column count. `0` = unbounded/auto. |
| `maxRows` | number | `0` | Flow: caps items per column. Grid: fixed row count. `0` = unbounded/auto. |
| `justify` | select: `start`\|`center`\|`end`\|`space-between`\|`space-around` | `"start"` | Main-axis distribution (flow). Horizontal in-cell alignment (grid; `space-*` behave as `start` there). |
| `align` | select: `start`\|`center`\|`end` | `"start"` | Cross-axis alignment within a line (flow). Vertical in-cell alignment (grid). |
| `paddingX` | number | `0` | Inset from the Layout entity's own position, horizontal. |
| `paddingY` | number | `0` | Inset from the Layout entity's own position, vertical. |

All size/gap/padding units are pixels, in the Layout entity's **local
space** (children positioned starting at `(paddingX, paddingY)` — the
Layout entity's own world position is composed in separately via
`getWorldTransform`, not re-applied here).

## `onTick(entity)`

Filters `entity.children` to those with a `Transform` (children without one
are never positioned). Dispatches to grid or flow layout. Each child's size
comes from `child.getDimensions()` — **note:** if a child has both a
`ShapeRenderer`/`SpriteRenderer` AND a `TextRenderer`, the text's measured
size **overwrites** (not maxes with) the shape/sprite size for layout
purposes.

## Flow mode

Packs children into lines along the main axis, breaking to a new line when
adding the next item would exceed `width`/`height` (if `wrap` is on and a
bound is set) or `maxCols`/`maxRows` is hit. A line always keeps at least
one item even if it alone exceeds the bound (never splits/drops a child).
`justify` distributes slack along the main axis (`space-between`/
`space-around` insert gaps between/around items); `align` positions each
item within its line's cross-axis size.

## Grid mode

`cols`/`rows` derived from `maxCols`/`maxRows` (if both `0`, everything
goes in one row; if only one is set, the other is computed via `ceil`).
**Fixed grid with both set: children beyond `rows*cols` capacity are
silently dropped from layout** (not placed anywhere). Row-major
(`direction: "row"`) fills left-to-right then wraps down; column-major
fills top-to-bottom then wraps right. Columns/rows are content-sized (each
track as wide/tall as its largest occupant). `justify` drives horizontal
in-cell alignment, `align` drives vertical — swapped from flow mode's
main/cross-axis pairing.

## Gotchas

- Runs every tick unconditionally — cheap for small child counts, but it's
  not "only re-run when the child set changes." For a card hand that only
  changes on draw/discard, `engine.gui.layoutHand()` (an imperative one-shot
  call) may be a better fit than a live `Layout` component — see
  [modules/gui.md](../modules/gui.md).
- Grid mode's silent-drop-on-overflow is easy to miss — if children aren't
  appearing, check whether `maxCols * maxRows` is smaller than your child
  count.

## See also

- [modules/gui.md](../modules/gui.md) — `layoutHand`/`layoutRow`/`layoutStack`, the fanned-hand alternative
- [Anchor.md](Anchor.md) — combine to build a screen-anchored HUD panel
