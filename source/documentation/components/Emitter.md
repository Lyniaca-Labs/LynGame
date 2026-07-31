# Emitter

Particle system. Spawns plain entities (or sprites, or full prefab
instances) with randomized velocity/lifetime/color/size drawn from a
weighted list of "particle type" archetypes, ages and fades/shrinks/spins
them, and cleans them up on expiry. Reuses `Movement` for physics rather
than reinventing integration — a particle is just a normal entity the
Emitter manages the lifecycle of.

## Schema

| field | type | default | description |
|---|---|---|---|
| `enabled` | boolean | `true` | Spawning on/off. Flipping false→true re-arms a one-shot burst. |
| `mode` | select: `continuous`\|`burst` | `"continuous"` | Continuous spawns at a steady rate. Burst fires a batch at once (optionally repeating every `burstInterval`). |
| `rate` | number | `30` | Particles/sec (continuous mode). |
| `burstCount` | number | `24` | Particles per burst (burst mode). |
| `burstInterval` | number | `0` | Seconds between bursts (burst mode). `0` = fire once, then wait for re-trigger (toggle `enabled` or call `trigger()`). |
| `maxParticles` | number | `200` | Cap on this emitter's simultaneously-live particles; spawning pauses at the cap (doesn't queue up / burst-catch-up later). |
| `angle` | number | `-90` | Base emission direction, degrees. `0` = right/+x, `90` = down/+y, `-90` = up. |
| `spread` | number | `25` | Random ± degrees around `angle` per particle. |
| `speedMin` / `speedMax` | number | `60` / `180` | Initial speed range, px/sec. Per-type `speed` overrides. |
| `lifetimeMin` / `lifetimeMax` | number | `0.6` / `1.4` | Lifetime range, seconds. Per-type `lifetime` overrides. |
| `spawnRadius` | number | `0` | Particles spawn at a random point within this radius of the emitter (uniform over the disk) instead of exactly at its origin. |
| `gravity` | number | `0` | Default px/sec² downward accel. Per-type `gravity` overrides. |
| `drag` | number | `0` | Default 0–1 velocity decay/sec. Per-type `drag` overrides. |
| `fadeOut` | boolean | `true` | Fade opacity to 0 over lifetime. Per-type `fadeOut` overrides. |
| `particleTypes` | json (array) | see below | Weighted list of particle archetypes. See [Particle type object](#particle-type-object). |
| `onParticleSpawn` | code `(entity, particle, engine)` | `null` | Runs each time a particle spawns. `entity` = this Emitter's own entity, `particle` = the new entity. |
| `onParticleDeath` | code `(entity, particle, engine)` | `null` | Runs just before a particle is removed on expiry. |

`particleTypes` uses schema type `"json"` — a raw JSON array edited via a
CodeMirror JSON editor in the Inspector (see
[PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#schema-field-types) for how
that field type works; it's the mechanism this component introduced since
no array-of-objects field type existed before).

## Particle type object

Every entry in `particleTypes` is randomly picked with probability
proportional to its `weight` (default `1` if omitted). Fields:

| field | meaning |
|---|---|
| `weight` | Relative selection probability. |
| `shape` | `"circle"` or `"rect"` — renders via `ShapeRenderer` (ignored if `sprite`/`prefab` set). |
| `color` | Hex string, or an array of hex strings (one picked at random per particle). |
| `sprite` | Asset key — if set, renders via `SpriteRenderer` instead of a shape. |
| `frame` | Spritesheet frame name, used with `sprite`. |
| `prefab` | Name of a registered prefab — if set, `engine.prefabs.instantiate(prefab)` is spawned as the particle instead of a bare entity (see [Gotchas](#gotchas)). |
| `size` | Number, or `[min, max]` — px, randomized. |
| `speed` | Number, or `[min, max]` — px/sec, overrides emitter `speedMin`/`speedMax`. |
| `angle` | Number, or `[min, max]` — degrees, overrides `emitter.angle ± spread`. |
| `lifetime` | Number, or `[min, max]` — seconds, overrides `lifetimeMin`/`lifetimeMax`. |
| `gravity`, `drag` | Overrides the emitter-level defaults for this type. |
| `spin` | Number, or `[min, max]` — deg/sec rotation applied continuously. |
| `fadeOut` | Overrides the emitter-level default for this type. |
| `shrink` | boolean — scales size to 0 over lifetime (independent of `fadeOut`). |
| `zIndex` | Draw order for this type's particles. |

Any field accepting "number or `[min, max]`" resolves via a shared
`resolveRange` helper: a plain number is used as-is; a 2-element array is
uniformly randomized between the two; omitted falls back to the
emitter-level default range.

## Methods

- **`start()`** / **`stop()`** — shorthand for `enabled = true`/`false`.
- **`trigger(count = burstCount)`** — immediately spawns `count` particles,
  regardless of `mode`/`enabled`/timers. The ergonomic way to fire a
  one-off effect from a script/click handler:
  `engine.query("myEmitter:Emitter")?.trigger();`
- **`liveCount`** (getter) — current number of this emitter's live
  particles. Handy for a debug readout or gating logic.

## Burst semantics

- `burstInterval: 0` fires exactly once per "enable edge" (`enabled` going
  `false → true`, including the implicit first tick after spawn) — it does
  **not** repeat on its own. Re-arm it by toggling `enabled` off then on,
  or just call `trigger()` any time regardless of mode/state.
- `burstInterval > 0` repeats automatically forever while `enabled`.

## Particle lifecycle

Spawned particles get: a `Transform` at the emitter's world position (+
random offset if `spawnRadius > 0`), a renderer (`ShapeRenderer`/
`SpriteRenderer`, or none if `prefab` supplies its own), an `Opacity`
(added if not already present), and a `Movement` (velocity/gravity/drag set
directly if the entity already has one — e.g. from a prefab — otherwise
one is added with `friction: 0`). The Emitter tracks `{entity, age,
lifetime, fadeOut, shrink, spin}` per particle internally and, every tick,
ages them, applies fade/shrink/spin, and calls `engine.removeEntity()` on
expiry (firing `onParticleDeath` first). On the Emitter's own entity being
destroyed, all its still-live particles are removed too.

## Gotchas

- **Prefab particles and `Opacity` don't cascade to children** (see
  [Opacity.md](Opacity.md#gotchas)) — if a `prefab` particle type has
  nested children (e.g. a multi-shape composite), only the root fades;
  children stay fully opaque. Set `fadeOut: false` on prefab-type entries
  to avoid the half-faded look, or design the prefab's children to fade
  themselves.
- Particles are spawned as independent top-level entities, **not** children
  of the Emitter's entity — moving the Emitter doesn't drag already-spawned
  particles along with it (only future spawn positions are affected).
- `Math.random()` is used directly for all randomization — there's no
  seeded-RNG convention anywhere else in the engine to match, so this is
  the de facto standard if you need randomness elsewhere too.

## Example

See `source/projects/test/scenes/particles.json` for a full working
showcase (fountain, smoke, click-triggered confetti burst, and a
repeating burst mixing shapes with a real prefab as a particle type), and
[USE_CASES.md](../USE_CASES.md#particle-effect-on-card-play) for a
card-game-specific recipe.

## See also

- [Movement.md](Movement.md) — the physics particles actually use
- [ShapeRenderer.md](ShapeRenderer.md), [SpriteRenderer.md](SpriteRenderer.md), [Opacity.md](Opacity.md)
- [modules/prefabs.md](../modules/prefabs.md) — prefab-as-particle-type
