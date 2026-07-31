# SpriteRenderer

Draws an image asset (plain image or one cell of a spritesheet) centered on
the entity's `Transform`. The standard way to render card art.

## Schema

| field | type | default | description |
|---|---|---|---|
| `sprite` | string (asset key) | `""` | The key of the sprite image to render. Can also be a spritesheet asset — see `frame`. |
| `frame` | string | `""` | Frame name to draw when `sprite` is a spritesheet asset. Ignored for plain image assets; empty selects the sheet's first frame. |
| `width` | number | `32` | Render width in pixels. The sprite is centered on the entity's Transform. |
| `height` | number | `32` | Render height in pixels. |

## Behavior

- `sprite` is a key looked up via `engine.assets.get(sprite)` (see
  [modules/assets.md](../modules/assets.md)). Resolution is cached on first
  render (`this._resolved`), so assets must already be loaded
  (`await engine.assets.load(manifest)`) before the entity renders — if not
  found yet, keeps retrying every frame until it resolves.
- **Plain image asset** (`type: "image"` in the manifest): `engine.assets.get()`
  returns an `HTMLImageElement` directly — the whole image is drawn scaled
  into `width × height`.
- **Spritesheet asset** (`type: "spritesheet"`): `engine.assets.get()`
  returns `{image, meta}`. Looks up `frameDef = meta.frames.find(f => f.name === frame) ?? meta.frames[0]`, computes its cell position from `meta.columns`/`cellWidth`/`cellHeight`, and blits just that cell, scaled into `width × height`.
- If the sprite key can't be resolved at all, draws a black placeholder
  rect instead of nothing (so a bad asset key is visually obvious).
- `sprite === ""` renders nothing (silent no-op) — useful for a
  "no art yet" placeholder entity that other components (Interactable,
  Transform) still exist on.

## Driving frames

- Manually: set `.frame` directly (e.g. from a click handler) — see
  `spritesheet_demo` scene's `switchBlob` entity for the pattern.
- Automatically: add a sibling [SpriteAnimation](SpriteAnimation.md)
  component, which advances `.frame` for you by playing a named clip out of
  the spritesheet's own `clips` metadata.

## Gotchas

- `SpriteAnimation` requires a **sibling** `SpriteRenderer` with `sprite`
  already set to a spritesheet asset — it does nothing on its own.
- The spritesheet metadata is a **separate sidecar JSON file** next to the
  image (`foo.png` → `foo.spritesheet.json`), not embedded in the manifest.
  See [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#spritesheet-json).

## See also

- [SpriteAnimation.md](SpriteAnimation.md) — frame-sequence playback
- [modules/assets.md](../modules/assets.md) — asset loading/manifest
