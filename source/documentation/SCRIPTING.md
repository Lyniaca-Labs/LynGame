# Scripting

Two independent ways to run your own code: **attached scripts** (a
`.js` file per-entity, ticks every frame) and **`code` schema fields**
(inline JS strings on a component, compiled to a function, run on specific
events). There's also a visual/graph-based script authoring tool in the
editor that compiles down to the same plain-script mechanism — see
[EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md).

## Attached scripts

A plain `.js` file in the project's `scripts/` folder, exporting a
function named to match the file (case-sensitive):

```js
// scripts/DoorScript.js
export function DoorScript(entity, engine, dt) {
  // runs every frame this entity is alive, dt in seconds
}
```

Referenced by filename (no extension) in scene/prefab JSON's `"scripts"`
array:
```json
{ "id": "player", "components": {...}, "scripts": ["DoorScript", "InputScript"] }
```

At runtime, each is attached via `entity.attachScript(fn)` and called every
frame as `script(entity, engine, dt)`, in attach order, **before** any
component's own `onTick` for that entity (see
[ARCHITECTURE.md#tick-order](ARCHITECTURE.md#tick-order)). If a script
destroys its own entity or switches scenes, the engine checks
`entity._destroyed` right after the scripts pass and skips that entity's
component `onTick`s for the rest of the frame.

### The global script registry

Every script file (whether attached to an entity or not) also gets
auto-registered into `engine.scripts` by name at build time (walks the
whole `scripts/` folder). Call one from anywhere via:

```js
engine.callScript("SomeScriptName", ...args);
```
— this calls the exported function directly with whatever args you pass
(not the `(entity, engine, dt)` signature necessarily; `callScript` just
forwards args as-is). Useful for one-off invocation from a `code` hook
(e.g. `Interactable.onClick`) without needing the calling entity to have
that script attached.

## `code` schema fields

Several components have schema fields of type `"code"` — a raw JS string,
compiled once (cached) into a real `Function` via `new Function(...params,
code)`, then called with fixed positional args whenever that event fires.
This is the mechanism behind `Interactable.onClick`, `Collision.onCollide`,
`Emitter.onParticleSpawn`, etc.

### Compile pattern (implementation note, not something you write yourself)

Each component that has `code` fields duplicates a small
`compileCode(code, paramNames)` helper (no shared utility exists yet — see
[LIMITATIONS.md](LIMITATIONS.md)) that: returns `null` for empty/nullish
code, caches compiled functions by `paramNames.join(",") + "|" + code` so
identical code strings aren't recompiled, and wraps the `new Function()`
call in try/catch (logs and yields `null` on a syntax error, rather than
throwing at scene-load time).

### Parameter names by field (what you can reference inside the code string)

| Component | field | parameters (in order) |
|---|---|---|
| `Interactable` | `onClick`, `onHoverEnter`, `onHoverExit`, `onHold` | `entity, engine` |
| `Interactable` | `onDragStart`, `onDrag`, `onDragEnd` | `entity, engine, data` — `data` is `{x, y}` (start/end) or `{x, y, dx, dy}` (drag) |
| `Collision` | `onCollide` | `entity, other, engine` |
| `Emitter` | `onParticleSpawn`, `onParticleDeath` | `entity, particle, engine` — `entity` is the Emitter's own entity, `particle` is the spawned/expiring particle |

`entity` is always "the entity this component is attached to" (i.e. `this`
from the code's perspective) except where noted.

### Example

```json
"Interactable": {
  "onClick": "engine.query(\"confettiEmitter:Emitter\")?.trigger();"
}
```
```json
"Collision": {
  "onCollide": "if (other.id.startsWith('enemy')) engine.removeEntity(entity.id);"
}
```

The editor's Inspector shows an "In scope: entity, engine, ..." hint chip
row above the code editor for fields it recognizes — this is a UI aid
only; the real parameter list is whatever that component's own
`compileCode` call declares (table above), not the hint itself. An
unrecognized field name falls back to showing `entity, engine` as a hint
even if the actual compiled signature differs — trust this table, not the
editor UI, for fields not listed here.

## Casing

Script filenames on disk are the single source of truth for a script's
name/casing (needed because case-sensitive filesystems, e.g. most
non-Windows game hosts, would otherwise break a mismatched reference).
Referencing `"DoorScript"` when the file is `doorscript.js` fails the
**build** (not silently) — with a clear error naming the mismatch. Two
files differing only by case in the same `scripts/` folder is also a build
error (ambiguous on case-insensitive filesystems like Windows/macOS).

## Graph-authored scripts (`.lgscript`)

The editor also has a visual node-graph script authoring tool
(`scripts/foo.lgscript.json` = the graph source, compiled to
`foo.lgscript.js` at build time). These are referenced and invoked
identically to plain `.js` scripts (same `"scripts": ["foo"]` reference,
same `(entity, engine, dt)` signature) — from the engine's perspective
there is no difference between a hand-written script and a compiled graph
one. See [EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md) if you need the
graph-editor internals; for writing/reading game logic, treat every script
as "a `.js` file exporting a function," full stop.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md#tick-order) — exactly when scripts run relative to components
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md#scripts-folder) — file layout/naming
