# engine.perf — PerformanceMonitor

Built-in profiler. `source/engine/modules/PerformanceMonitor.js`.

## Reading stats from game code

`engine.perf.stats` is a plain, publicly-readable object, updated once per
frame:

```js
{ fps, frameMs, updateMs, renderMs, minFrameMs, maxFrameMs, entityCount }
```

Nothing stops a script from reading `engine.perf.stats.fps` to build its
own in-game FPS counter/debug UI entity — it's not editor-only, just also
happens to be what backs the built-in overlay.

## Built-in debug overlay

Backtick (`` ` ``, configurable via `options.toggleKey` at engine
construction) toggles a DOM overlay (top-left of the game container)
showing FPS/frame/update/render time and entity count. This is a debug tool
for you as the developer, not gameplay UI.

- `toggle()` — flips overlay visibility programmatically.
- `destroy()` — removes the overlay and its keydown listener (host/editor cleanup).

## Frame instrumentation methods

`beginFrame(dt)`, `markUpdate()`, `markRender()`, `endFrame(entityCount)` —
called by the engine's own main loop each frame in that exact order. You
generally never call these yourself; they're what populate `stats`.

## See also

- Nothing else references this module elsewhere — it's self-contained.
