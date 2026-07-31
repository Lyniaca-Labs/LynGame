# Movement

Velocity/force-based physics for an entity's `Transform`. Handles gravity,
drag, friction, and a max-speed clamp; you either set `velocity` directly or
drive it with `applyForce`/`accelerateInDirection`.

## Schema

| field | type | default | description |
|---|---|---|---|
| `maxSpeed` | number | `300` | Clamps total velocity magnitude, in px/sec. |
| `acceleration` | number | `800` | px/sec² applied by `accelerateInDirection()`. |
| `friction` | number | `600` | px/sec² of deceleration applied when no force is active this frame. |
| `gravity` | number | `0` | Constant px/sec² acceleration applied along `gravityDirection`. |
| `gravityDirection` | vector | `{x:0, y:1}` | Direction gravity pulls in. Auto-normalized (doesn't need to be pre-normalized in JSON). |
| `drag` | number | `0` | Fraction of velocity lost per second, 0–1 (air resistance). |
| `bounce` | number | `0` | Restitution 0–1. Reserved — read by `Collision`'s resolution step, not by `Movement` itself. |
| `mass` | number | `1` | Scales force → acceleration; `applyForce()`/gravity respect this. |
| `velocity` | vector | `{x:0, y:0}` | Current velocity in px/sec. Read/write directly, or via `setVelocity()`. |

## Methods

- `applyForce(x, y)` — accumulates into an internal per-frame force buffer, cleared after each `onTick`'s integration. Use for one-off impulses or continuous forces you re-apply every frame (e.g. from a script reading input).
- `accelerateInDirection(dirX, dirY)` — normalizes `(dirX, dirY)` and calls `applyForce` scaled by `acceleration * mass`. Typical "move toward this direction" input handler.
- `setVelocity(x, y)` — sets velocity directly, bypassing forces.
- `stop()` — zeroes velocity.

## `onTick` behavior (order matters)

1. If `gravity !== 0`, adds `gravityDirection * gravity * mass` into the force buffer (gravity is continuous, routed through the same force accumulator as `applyForce`).
2. **If any force was applied this frame** (via `applyForce`/`accelerateInDirection`/gravity): integrates `velocity += force/mass * dt`, then clears the force buffer. Friction is **skipped** this frame.
3. **Else** (no force at all this frame): applies friction — decelerates speed by `friction * dt`, clamped to not reverse direction.
4. Applies `drag` as a multiplicative decay: `velocity *= max(0, 1 - drag*dt)`.
5. Clamps speed to `maxSpeed`.
6. Integrates position: `transform.x/y += velocity * dt`.

**Key implication:** friction and gravity/force are mutually exclusive per
frame — as long as `gravity !== 0` (or you call `applyForce`/
`accelerateInDirection` every frame), friction never fires, because gravity
itself counts as "a force was active this frame." For gravity-driven motion
without friction fighting it, this is what you want. If you want friction to
still apply while gravity also pulls, you'd need to re-derive that behavior
manually (not supported out of the box).

## Gotchas

- `friction` decelerates when **no** force is present. This is why a
  gravity-affected entity (`gravity > 0`) never experiences friction — set
  `friction: 0` if you're relying on gravity/drag alone and don't want
  friction to interact unexpectedly if gravity is ever set back to 0.
  [`Emitter`](Emitter.md) always constructs particle `Movement` components
  with `friction: 0` for exactly this reason.
- `bounce` does nothing inside `Movement` itself — only `Collision`'s
  resolution step reads it.
- No component reads `mass` except `Movement` itself (`Collision` has its
  own separate `mass` field for push-apart ratios).

## See also

- [Collision.md](Collision.md) — physical resolution reads `Movement.velocity`/`bounce`
- [Emitter.md](Emitter.md) — spawns particles with a per-particle `Movement`
