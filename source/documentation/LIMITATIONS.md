# Known limitations & gotchas

Non-obvious behavior and unimplemented-but-present fields. Read this before
assuming something is broken — it might just be a documented gap.

## Unimplemented schema fields

- **`Camera.zoom`** — declared, assigned, read nowhere else. No renderer
  scales by it. Setting it currently has zero visual effect.
- **`Camera.bounds`** — declared, assigned, never read/clamped against.
  Also has no Inspector UI at all (schema type `"object"` — see
  [Schema field types](PROJECT_STRUCTURE.md#schema-field-types)). Editable
  only by hand-editing scene JSON, and doing so today changes nothing at
  runtime.

## Rendering

- **`Opacity` does not cascade to child entities.** Each entity renders
  independently in a flat loop; fading a parent's `Opacity` leaves its
  children fully opaque. Most relevant for `Emitter`'s prefab-as-particle
  feature (see [Emitter gotchas](components/Emitter.md#gotchas)) and any
  multi-entity prefab (art + text + icon children) you try to fade as a
  unit — fade each child separately, or set `fadeOut: false` and accept no
  fade for that case.
- **Multi-layer rendering is structurally present but functionally
  incomplete.** `engine.newLayer(name, zIndex)`/`getLayer(name)` create
  real, correctly z-ordered, resize-aware `<canvas>` elements — but
  `GameEngine._render()` is hardcoded to only ever draw entities into the
  `"main"` layer. An extra layer you create gets nothing drawn to it
  automatically; you'd have to grab its `.ctx` and draw manually from a
  script.
- **Only one active camera, engine-wide.** No split-screen/multi-viewport
  support — `engine.camera` is a single slot.

## Physics / collision

- **`Collision.onCollide` is not edge-triggered** — it fires every frame
  two entities remain overlapping, not just once on first contact. Track
  your own "already handled" flag (e.g. on `entity.state`) if you need
  enter/exit semantics.
- **`Movement.friction` and gravity/force don't combine within the same
  frame** — friction only applies on a frame where zero force (including
  gravity) was active. A gravity-affected entity never experiences
  friction as long as gravity stays nonzero. See
  [Movement gotchas](components/Movement.md#gotchas).
- **`Movement.bounce`** does nothing inside `Movement` itself — only read
  by `Collision`'s resolution step.

## Layout

- **`Layout` grid mode silently drops overflow.** If both `maxCols` and
  `maxRows` are set and `children.length > maxCols * maxRows`, the extra
  children are never placed anywhere (not an error, not a warning).

## Animation / sprites

- **Two unrelated systems both use the word "clip."** `Animator` clips are
  project-level keyframe tracks (`animations/*.json`, property tweening).
  `SpriteAnimation` clips are spritesheet frame-sequences (defined inside
  a `.spritesheet.json`'s `clips` object, frame-stepping). They share no
  code and aren't interchangeable — don't assume `Animator.play("idle")`
  and `SpriteAnimation.play("idle")` do anything related just because the
  clip name matches.
- **`SpriteAnimation.stop()` + `play()` on the same clip always restarts**
  from frame 0 — it does not resume where playback left off, because
  `stop()` clears the "already playing" fast-path `play()` checks.
- **Google Fonts load asynchronously with no render-blocking.** Text using
  `googleFont: true` renders with a fallback font for the first frame(s)
  until the real font resolves — there's no loading placeholder.

## Randomness

- **No seeded-RNG convention exists anywhere in the engine.** `Emitter` is
  the only component using randomness, via plain `Math.random()`. If you
  need reproducible/seeded randomness (e.g. deterministic replays, a
  shuffle a client and server must agree on), you'll need to bring your
  own RNG — there's no engine-provided seeded generator to match
  (`LGTexture` has its own internal `mulberry32` seeded PRNG, but it's
  private to texture generation, not exposed for general use).

## Scripting

- **No shared `compileCode` utility.** `Interactable`, `Collision`, and
  `Emitter` each duplicate their own small compile-and-cache helper for
  `code`-type schema fields, with independently-declared default parameter
  name lists. Functionally fine (documented per-component in
  [SCRIPTING.md](SCRIPTING.md#parameter-names-by-field-what-you-can-reference-inside-the-code-string)),
  but if you add a `code` field to a new component, don't assume there's a
  central place to import a compiler from — copy the pattern.
- The editor Inspector's "in scope" hint chips for `code` fields
  (`SCOPE_BY_FIELD` in `source/client/src/layout/sections/Inspector.tsx`)
  are a UI convenience, not the source of truth for what's actually
  callable — they can lag behind a component's real compiled parameter
  list if a field is added without also updating that map.

## Time

- **`engine.time`** is milliseconds since the engine started, minus total
  paused duration — **not** "time since scene load" or "time since this
  entity/component was created." Anything needing elapsed-since-X must
  accumulate its own counter from `dt` each tick (see `Emitter`,
  `Animator`, `SpriteAnimation` for the pattern).
- `dt` (passed to every `onTick`) is in **seconds**, clamped to a max of
  `1/30` per frame (protects against huge steps on tab-refocus/lag
  spikes) — not raw uncapped delta time.

## Assets

- Procedural textures (`type: "texture"` manifest entries) are always
  built at a hardcoded `size: 256`, regardless of the manifest's `size`
  field (which the loader ignores for this purpose).

## Windows / OneDrive

- If your project lives inside a cloud-synced folder (OneDrive, Dropbox,
  etc.) on Windows, rebuilding/deleting a project can intermittently throw
  `EBUSY: resource busy or locked` on the output directory — the sync
  client (or a stale local preview server still holding a file handle
  open, e.g. from `npx serve`/`http.server`) can transiently block a
  recursive delete. The build (`buildProject`) and delete-project endpoint
  now retry automatically (`fs.rmSync(..., {maxRetries: 10, retryDelay:
  300})` — up to ~3s of retries) which resolves the transient case. If it
  still happens, check for and close any lingering process serving files
  out of `source/output/<project>/` before rebuilding, or wait for
  OneDrive's sync icon to settle.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md), [ENGINE_API.md](ENGINE_API.md)
- Individual component docs' own "Gotchas" sections have the same
  information in context — this file is the consolidated list.
