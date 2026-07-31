# engine.prefabs — PrefabRegistry

Named, reusable entity templates. `source/engine/modules/PrefabRegistry.js`,
instantiated as `engine.prefabs`.

## How prefabs get here

You **author** prefabs as JSON files in the project's `prefabs/` folder (see
[PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#prefab-json) for the full
schema — components, scripts, nested children, ghost-override paths). The
build step compiles each one into a JS "build function" and calls
`engine.prefabs.register(name, buildFn)` for you automatically — you don't
call `register()` by hand in normal project work.

## Methods

- **`register(name, buildFn)`** — `buildFn: (engine, args, id) => Entity`.
  Stores it under `name`. (Compiler-generated; rarely called directly.)
- **`instantiate(name, args = {}, id = null)`** → the live `Entity`,
  synchronously ready to use (add more components, set velocity, whatever)
  immediately after the call. Logs an error and returns `null` if `name`
  isn't registered. `args` is the overrides object your prefab JSON's
  top-level `components`/`children` accept (same shape as a scene entity's
  `"overrides"` field).
- **`getInstances(name)`** → `Entity[]` — every currently-live entity whose
  `entity.prefabName === name` (set automatically by the generated build
  code). Useful for "find all cards on the board," "count live enemies,"
  etc.

## Example

```js
const card = engine.prefabs.instantiate("Card", { Transform: { x: 100, y: 200 } });
card.getComponent("Interactable").onClick = /* ... */;

const allCards = engine.prefabs.getInstances("Card");
```

## See also

- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md#prefab-json) — full prefab JSON schema, including nested children and ghost overrides
- [Emitter.md](../components/Emitter.md) — spawns prefab instances as particles via this same API
