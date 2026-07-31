# Modules index

Engine-level services attached to the `GameEngine` instance (`engine.*`),
distinct from components (which attach to entities). Source in
`source/engine/modules/*.js`. See [../ENGINE_API.md](../ENGINE_API.md) for
everything else on `engine` that isn't one of these modules (entity/scene
management, camera, query, etc).

**Only open the file(s) for the module(s) you're actually working with.**

| Module | Exposed as | One-line purpose |
|---|---|---|
| [assets.md](assets.md) | `engine.assets` | Async asset loading/cache — images, spritesheets, audio, procedural textures. |
| [audio.md](audio.md) | `engine.audio` | SFX/music playback with automatic voice-layering for overlapping sounds. |
| [gui.md](gui.md) | `engine.gui` | One-shot layout helpers: `layoutHand`/`layoutRow`/`layoutStack` — the card-game-relevant one. |
| [input.md](input.md) | `engine.input` | Polled keyboard/mouse state. |
| [prefabs.md](prefabs.md) | `engine.prefabs` | Named, reusable entity templates — `instantiate(name, args)`. |
| [textures.md](textures.md) | `LGTexture` (engine export) | Procedural canvas-texture generation/filtering toolkit. |
| [performance.md](performance.md) | `engine.perf` | Built-in FPS/frame-time profiler + optional debug overlay. |
