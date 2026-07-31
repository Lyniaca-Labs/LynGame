# LGTexture — procedural canvas textures

`source/engine/modules/TextureEngine.js`, exported from the engine's index
as `export { LGTexture } from "./modules/TextureEngine.js";`. A stateless
bag of functions (not a class you instantiate) that generate/filter/
composite `HTMLCanvasElement`s. Primarily driven by the editor's texture
node-graph tool (which emits `*.texture.js` modules calling these), but
every function is a plain export callable directly from any runtime script
too.

## Normal usage path (no direct `LGTexture` calls needed)

1. Author a texture via the editor's node graph tool → it emits
   `assets/<name>.texture.js` exporting `buildTexture({size, assets})`
   (see [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#texture-module)).
2. It's referenced in the asset manifest with `type: "texture"`.
3. At runtime: `engine.assets.get("<name>")` returns the resulting
   `HTMLCanvasElement`, just like any other asset — feed it to a
   `SpriteRenderer` the same way you'd use a plain image key.

## Direct runtime usage (for ad-hoc/dynamic textures)

```js
import { LGTexture } from "../engine/index.js"; // or however your script imports it
const canvas = LGTexture.tint(baseCanvas, 64, "#ff0000", 0.5);
```

### Generators (produce a new `size × size` canvas)

`canvas(size)`, `empty(size)`, `color(size, cssColor)`,
`gradient(size, direction, from, to)` (`direction`: `vertical`/`diagonal`/horizontal),
`radialGradient(size, from, to)`, `channels(cssColor)` → `[r,g,b]`,
`pixels(size, (x,y) => [r,g,b])`, `checker(size, tile, colorA, colorB)`,
`noise(size, seed, scale, colorA, colorB)` (deterministic hash-based),
`random(size, seed, colorA, colorB)` (seeded PRNG per-pixel),
`stripes(size, width, direction, colorA, colorB)`,
`asset(assets, key, size)` (draws an already-loaded asset scaled into a new canvas — `assets` is typically `engine.assets.cache` or the `assets` param a `buildTexture()` module receives).

### Filters/compositing (take a canvas, return a new one)

`adjust(input, size, mode, amount)` — `mode` ∈ `invert`, `brightness`,
`contrast`, `saturation`, `grayscale`, `posterize`, `threshold`, `opacity`.
`hueRotate(input, size, degrees)`, `tint(input, size, color, amount)`,
`pixelate(input, size, blockSize)`, `blur(input, size, radius)`,
`antialias(input, size, strength)`, `rotate(input, size, degrees)`,
`flip(input, size, "horizontal"|"vertical")`, `offset(input, size, dx, dy)`
(wraps), `tile(input, size, repeat)`, `blend(a, b, amount, size, mode)`
(`mode` ∈ `multiply`, `screen`, `overlay`, `add`, default source-over),
`mask(input, maskTex, size)` (uses `maskTex` luminance as `input`'s alpha).

## Gotchas

- Textures loaded via the asset manifest are always built at a hardcoded
  `size: 256` — the manifest's `size` field isn't used for this.
- `LGTexture` has no "instance" concept — every function is pure, taking
  and returning plain canvases.

## See also

- [assets.md](assets.md) — `type: "texture"` loading
- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#texture-module) — the generated module format
