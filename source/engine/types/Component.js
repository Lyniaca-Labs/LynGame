export class Component {
  constructor() { }

  // Override any of these in a subclass as needed — all optional no-ops by default
  onSpawn(entity, engine) { }
  onTick(entity, engine, dt) { }
  onDestroy(entity, engine) { }
}

export const DEFAULT_COMPONENTS = {};