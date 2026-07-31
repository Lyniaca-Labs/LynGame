# TextRenderer

Canvas text rendering with word-wrap, ellipsis truncation, stroke/outline,
multi-line alignment, letter-spacing, and optional Google Fonts loading.
Used for labels, card text, HUD numbers, and dialogue.

## Schema

| field | type | default | description |
|---|---|---|---|
| `text` | string | `""` | Text to render. Use `\n` for line breaks. |
| `fontFamily` | string | `"sans-serif"` | Font family name. Set `googleFont` to auto-load it. |
| `googleFont` | boolean | `false` | If true, fetches `fontFamily` from Google Fonts automatically. |
| `fontSize` | number | `16` | Font size in pixels. |
| `fontWeight` | string | `"400"` | `"400"`, `"700"`, `"bold"`, etc. |
| `fontStyle` | string | `"normal"` | `"normal"` \| `"italic"` \| `"oblique"`. |
| `color` | color | `"#fff"` | Fill color. |
| `strokeColor` | color | `""` | Outline color. Empty = no stroke. |
| `strokeWidth` | number | `0` | Outline width in pixels. |
| `align` | string | `"left"` | `"left"` \| `"center"` \| `"right"`. |
| `verticalAlign` | string | `"top"` | `"top"` \| `"middle"` \| `"bottom"`. |
| `lineHeight` | number | `1.2` | Multiplier of `fontSize`. |
| `letterSpacing` | number | `0` | Extra px spacing between letters. |
| `maxWidth` | number | `0` | Px before wrapping/ellipsis. `0` = no limit. |
| `maxHeight` | number | `0` | Px before lines are dropped/ellipsized. `0` = unlimited. |
| `wrap` | boolean | `true` | Wrap onto multiple lines within `maxWidth`. |
| `ellipsis` | boolean | `false` | Truncate with `"…"` on overflow. |
| `textTransform` | string | `"none"` | `"none"` \| `"uppercase"` \| `"lowercase"` \| `"capitalize"`. |

Note: despite the pipe-separated descriptions, `align`/`verticalAlign`/
`fontStyle`/`textTransform` are schema type `string` (free text), not
`select` — the Inspector won't restrict input to those literal values;
they're just what the render logic branches on. Typos silently fall
through to the default behavior (e.g. `align: "centre"` behaves like
`"left"`).

## Measurement API

- **`getWidth(ctx)`** → widest wrapped line's measured width, px.
- **`getHeight(ctx)`** → `lines.length * getLineHeight()`.
- **`getLineHeight()`** → `fontSize * lineHeight` (no `ctx` needed).
- **`getBounds(ctx)`** → `{width, height}`.
- **`invalidate()`** — forces re-wrap/re-measure on next use. Rarely
  needed manually; the internal cache key already covers every field that
  affects wrapping.

`ctx` here is always `engine.ctx` — a dedicated offscreen canvas 2D context
the engine keeps solely for text measurement (never rendered to screen).
This is exactly what `Entity.getDimensions()` calls, so a `TextRenderer`
entity's measured size flows into `Layout`, `Interactable.autoDimensions`,
and hit-testing automatically.

## Wrapping/ellipsis behavior

- `!maxWidth || !wrap`: no wrapping, each `\n`-split paragraph is one line
  (however long).
- Word-wrap greedily builds lines up to `maxWidth`, never splitting a
  single word even if it alone exceeds `maxWidth`.
- If `maxHeight` is set and wrapping produces more lines than fit, extra
  lines are dropped; if `ellipsis` is also on, the last **kept** line gets
  a binary-searched `"…"`-truncated version that fits `maxWidth`.
- If `ellipsis && maxWidth && !wrap` (wrapping off but ellipsis desired):
  every line is independently truncated to fit `maxWidth`.

## Google Fonts

Setting `googleFont: true` injects a `<link>` requesting all 9 numeric
weights (100–900) for `fontFamily` once per family (deduped across every
`TextRenderer` instance using that family), and calls
`document.fonts.load()` to force-fetch the specific weight. **Text renders
immediately with a fallback font before the real one finishes loading** —
there's no render-blocking or loading placeholder; it silently re-measures
and re-renders correctly once the font resolves (with a 2s safety timeout
in case loading hangs).

## Gotchas

- `letterSpacing` is applied via the native canvas `ctx.letterSpacing` API
  when available (for actual drawing), but wrap-width decisions use a
  separate manual JS approximation (`measureText(...).width + letterSpacing
  * (chars-1)`) — on wide, heavily letter-spaced text these two can very
  slightly diverge.
- Horizontal alignment is driven by `ctx.textAlign`, not by a manual
  box-width offset — `maxWidth` constrains *wrapping*, not where the text
  block is horizontally anchored within some box.

## See also

- [Layout.md](Layout.md) — reads `getWidth`/`getHeight` for sizing
- [Interactable.md](Interactable.md) — `autoDimensions` reads the same
