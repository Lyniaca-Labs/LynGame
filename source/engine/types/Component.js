export class Component {
  static schema = {};

  constructor(overrides = {}) {
    const schema = this.constructor.schema;
    for (const [key, def] of Object.entries(schema)) {
      this[key] = key in overrides ? overrides[key] : structuredClone(def.default);
    }
  }

  onSpawn(entity, engine) { }
  onTick(entity, engine, dt) { }
  onDestroy(entity, engine) { }
}