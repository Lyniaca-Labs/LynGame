# engine.input — Input

Polled input state (keyboard + mouse). `source/engine/modules/Input.js`.
For click/hover/drag on a specific entity, prefer
[Interactable](../components/Interactable.md) — use `engine.input` directly
for global input (e.g. WASD movement, a shortcut key, drag-panning a
camera rig).

## Query methods (what scripts should use)

- `isKeyDown(code)` → `boolean` — held right now. `code` is a
  `KeyboardEvent.code` string, e.g. `"KeyA"`, `"Space"`, `"ArrowLeft"`.
- `wasKeyPressed(code)` → `boolean` — true for exactly the one frame the
  key went down.
- `wasKeyReleased(code)` → `boolean` — true for exactly one frame on release.
- `isMouseDown(button = 0)` → `boolean` (`0`=left, `1`=middle, `2`=right).
- `wasMousePressed(button = 0)` / `wasMouseReleased(button = 0)` → one-frame equivalents.
- `pointer` (getter) → fresh `{ x, y, down, justPressed, justReleased }`
  each access, hardcoded to the **left** mouse button — shorthand for the
  common "primary pointer" case.

## Raw state (also directly readable)

- `mouse: { x, y, dx, dy }` — position relative to the game container;
  `dx`/`dy` reset to `0` every frame.
- `wheelDelta` — last frame's wheel `deltaY`, reset to `0` every frame.
- `keys` / `keysPressed` / `keysReleased` — `Set`s of currently-held / just-pressed / just-released key codes.
- `mouseButtons` / `mouseButtonsPressed` / `mouseButtonsReleased` — same shape for mouse buttons.

## Internal-only (do not call from game scripts)

- `drainPointerEvents()` — drains the raw pointer-event queue. Called once
  per frame by the engine's own update loop to feed `Interactable` hit
  testing. Calling it yourself would steal events from `Interactable`.
- `_endFrame()` — resets the one-frame press/release sets and deltas.
  Driven by the main loop.

## Example

```js
// simple WASD movement in an onTick script
export function PlayerControl(entity, engine, dt) {
  const move = entity.getComponent("Movement");
  if (engine.input.isKeyDown("KeyD")) move.accelerateInDirection(1, 0);
  if (engine.input.isKeyDown("KeyA")) move.accelerateInDirection(-1, 0);
  if (engine.input.wasKeyPressed("Space")) { /* jump */ }
}
```

## Gotchas

- All keyboard/mouse tracking is **paused-gated** — while `engine.paused`
  is true, no key/mouse state updates at all (except `contextmenu`
  suppression, which isn't gated).
- `mouseup` is bound on `window`, not the game container, so a release
  outside the canvas still registers — but `mousedown`/`mousemove` are
  container-scoped.

## See also

- [Interactable.md](../components/Interactable.md) — per-entity click/hover/drag built on top of this
