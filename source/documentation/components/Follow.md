# Follow

Smoothly moves this entity's `Transform` toward another entity's world
position every frame. Three interchangeable smoothing models. Not for
cameras — see [Camera.md](Camera.md), which has its own (instant, no
smoothing) follow logic; `Follow` is for regular entities (a UI label
tracking a moving card, a shadow trailing a player, a health bar over an
enemy).

## Schema

| field | type | default | description |
|---|---|---|---|
| `targetId` | entity (query path) | `""` | Query path to the entity this one follows. |
| `mode` | select: `exponential`\|`spring`\|`maxSpeed` | `"exponential"` | Smoothing model. |
| `roundness` | number | `0.85` | `0` = instant snap, near `1` = very lazy/floaty. Used by `exponential` and `maxSpeed` modes. |
| `stiffness` | number | `120` | Spring mode only: how hard it pulls toward the target. |
| `damping` | number | `14` | Spring mode only: how quickly oscillation settles. |
| `offsetX` | number | `0` | Fixed X offset from the target's position. |
| `offsetY` | number | `0` | Fixed Y offset from the target's position. |
| `axisLock` | select: `both`\|`x`\|`y` | `"both"` | Restrict following to one axis. |
| `deadzone` | number | `0` | Radius within which no movement happens. |
| `maxSpeed` | number | `0` | Hard cap on movement speed, px/sec (`maxSpeed` mode + as a clamp elsewhere). `0` = uncapped. |

`targetId` uses the engine's query syntax (see [ENTITY_API.md](../ENTITY_API.md#query-syntax)), e.g. `"player"` or `"hand.card_3"`. Resolved once and cached; re-resolved automatically if the cached target gets destroyed.

## Modes

- **`exponential`** (default): `transform += (goal - transform) * (1 - roundness^dt)` — frame-rate-independent ease toward the goal. Simple, cheap, no overshoot.
- **`spring`**: semi-implicit Euler spring-damper (mass = 1) using `stiffness`/`damping` directly — can overshoot and oscillate, tune `damping` up to reduce that. `roundness` is unused in this mode.
- **`maxSpeed`**: ramps speed up over a distance based on `maxSpeed`, with `roundness` shaping the deceleration curve near the target (`0` = linear/snappy stop, near `1` = eased/floaty stop).

## Behavior notes

- Reads the target's `getWorldTransform(engine)`, so following a nested/parented entity resolves correctly through its ancestors.
- `axisLock` freezes the other axis at its **current** value each frame (not the target's) — so locking to `"x"` still lets you manually move this entity's `y` elsewhere without Follow fighting you.
- `deadzone`: if the remaining distance to the goal is `<= deadzone`, the whole tick is skipped (including axis-locked snapping) — nothing moves at all that frame.

## See also

- [Camera.md](Camera.md) — similar "target" concept but instant/no smoothing, viewport-centering semantics
- [Transform.md](Transform.md)
