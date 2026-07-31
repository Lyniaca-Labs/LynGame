# engine.assets — AssetLoader

Async manifest-driven asset cache. `source/engine/modules/AssetLoader.js`.

## Loading

```js
await engine.assets.load(manifest, baseUrl = "./assets");
```

- `manifest`: `{ [key]: { relativePath: string, type: string, size?: number } }`. This is generated automatically from your project's `assets/` folder at build time — you don't hand-write it (see [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#asset-manifest)).
- Loads every non-`"texture"` entry in parallel, **then** all `"texture"` entries sequentially (textures can reference other already-loaded assets by key, e.g. `LGTexture.asset(assets, "tree", size)`, so images/audio/spritesheets must finish first).
- Await it once at startup (the compiled `main.js`'s `init()` does this before registering scenes) — after that, every `.get()` call is synchronous.

## Supported `type` values and what `.get(key)` returns

| `type` | `.get(key)` returns |
|---|---|
| `"image"` | `HTMLImageElement` |
| `"spritesheet"` | `{ image: HTMLImageElement, meta: <parsed .spritesheet.json> }` |
| `"audio"` | `HTMLAudioElement` |
| `"texture"` | Whatever the asset's `buildTexture()` module function returns — an `HTMLCanvasElement` (see [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#texture-module)) |
| anything else / unrecognized | the raw `fetch()` `Response` object |

## Methods

- **`get(key)`** → the cached asset (shape per table above), or `null` (and a `console.error`) if not found/not loaded yet.
- **`has(key)`** → `boolean`.

## Gotchas

- You must know an asset's `type` to use its return value correctly — a
  spritesheet is `{image, meta}`, not a bare `Image`; code that assumes
  otherwise breaks silently (wrong-looking render, not a thrown error).
- Spritesheet metadata comes from a **sidecar file**: `foo.png` expects
  `foo.spritesheet.json` next to it.
- Texture modules are always built at a hardcoded `size: 256` regardless of
  the manifest's `size` field (which is otherwise unused by the loader).

## See also

- [SpriteRenderer.md](../components/SpriteRenderer.md)
- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#asset-manifest)
- [textures.md](textures.md) — `LGTexture`, the procedural texture toolkit
