export class PrefabRegistry {
  constructor(engine) {
    this.engine = engine;
    this.prefabs = {};
  }

  register(name, buildFn) {
    this.prefabs[name] = buildFn;
  }

  /**
   * Create a new instance of a prefab.
   * @param {string} name - registered prefab name
   * @param {object} args - passed through to the build function (spawn position, etc.)
   * @param {string} [id] - optional explicit id; auto-generated as `${name}_N` if omitted
   */
  instantiate(name, args = {}, id = null) {
    const buildFn = this.prefabs[name];
    if (!buildFn) {
      console.error(`Prefab "${name}" not registered`);
      return null;
    }

    const entity = buildFn(this.engine, args, id);
    if (!entity) return null;

    return entity;
  }

  /** All live entities spawned from a given prefab. */
  getInstances(name) {
    return this.engine.entities.filter((e) => e.prefabName === name);
  }
}