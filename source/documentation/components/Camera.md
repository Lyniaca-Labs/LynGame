# Camera

Centers the viewport on a target entity (or itself). One active camera at a
time — `GameEngine.camera` holds the live `Camera` component instance, read
by every renderer/hit-test to convert world → screen coordinates.

## Schema

| field | type | default | description |
|---|---|---|---|
| `zoom` | number | `1` | **Not implemented.** Declared and assigned, but nothing in the engine reads it — no renderer scales by it. Setting it has no visible effect today. |
| `offset` | vector | `{x:0, y:0}` | Pixel offset from the followed entity's position. |
| `bounds` | object | `null` | **Not implemented.** Declared and assigned, but nothing clamps camera position against it. Also unrenderable in the editor Inspector (schema type `"object"` has no UI widget) — must be hand-edited in scene JSON if you want to store data here for your own script to read, but the engine itself does nothing with it. |
| `target` | entity (id/query path) | `null` | Entity this camera follows. Set via `follow()`/`followEntity()` at runtime, or as a string id/query path in scene JSON (resolved once, then cached as a live Entity reference). Defaults to the entity the `Camera` component is itself attached to. |

## Methods

- `follow(entity)` / `followEntity(entity)` — identical; sets `target` directly to an `Entity` instance.
- `unfollow()` — clears `target`; camera falls back to following its own entity.
- `calculatePosition(entity, engine, dt)` — the positioning logic itself (see below), also callable directly if you need to compute where the camera *would* center without applying it.

## `onTick(entity, engine, dt)`

1. If `target` is still a string (unresolved query path from scene JSON), resolves it via `engine.query()` and caches the result.
2. Computes and stores `this.x`/`this.y` (not schema fields — the live output every renderer reads) via `calculatePosition`.

## Centering math

`source = target ?? entity` (the entity this Camera is attached to, if no
explicit target). Reads `source.getWorldTransform(engine)` (so following a
nested/parented entity resolves correctly). Result:
```
x = target.worldX + offset.x - viewportWidth / 2
y = target.worldY + offset.y - viewportHeight / 2
```
i.e. the viewport is centered on the target position plus a pixel offset.
**No smoothing** — camera position snaps instantly to the target every
frame (`dt` is accepted but unused). For a smoothed camera, follow a
separate `Follow`-driven "camera rig" entity instead of the player directly.

## Activation

A scene's camera is chosen by (in order): an explicit `engine.setCamera(id)`
call inside the scene's load function; else the scene's registered
`cameraId` (see [ENGINE_API.md](../ENGINE_API.md#scenes)); else the first
entity found with a `Camera` component. Only one camera is ever active
engine-wide.

## Gotchas

- `zoom` and `bounds` are aspirational/reserved fields — don't rely on them
  doing anything today. See [LIMITATIONS.md](../LIMITATIONS.md).
- No smoothing built in — pair with [Follow.md](Follow.md) on a separate rig
  entity if you want eased camera movement.

## See also

- [Follow.md](Follow.md) — smoothed target-following for non-camera entities
- [LIMITATIONS.md](../LIMITATIONS.md) — unimplemented-field details
