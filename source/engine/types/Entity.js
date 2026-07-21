export class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
    this.scripts = [];
    this.engine = null;
  }

  addComponent(ComponentClass, data = {}) {
    const instance = new ComponentClass(data);
    this.components.set(ComponentClass, instance);
    if (this.engine) instance.onSpawn?.(this, this.engine);
    return this;
  }

  removeComponent(componentRef) {
    const ComponentClass = this._resolveClass(componentRef);
    if (!ComponentClass) return;
    const instance = this.components.get(ComponentClass);
    if (instance && this.engine) instance.onDestroy?.(this, this.engine);
    this.components.delete(ComponentClass);
  }

  getComponent(componentRef) {
    if (typeof componentRef === "string") {
      for (const [ComponentClass, instance] of this.components) {
        if (ComponentClass.name === componentRef) return instance;
      }
      return undefined;
    }
    return this.components.get(componentRef);
  }

  hasComponent(componentRef) {
    return this.getComponent(componentRef) !== undefined;
  }

  attachScript(fn) {
    this.scripts.push(fn);
    return this;
  }

  // Called by GameEngine.removeEntity — runs onDestroy for every component
  destroy(engine) {
    for (const instance of this.components.values()) {
      instance.onDestroy?.(this, engine);
    }
  }

  _resolveClass(componentRef) {
    if (typeof componentRef !== "string") return componentRef;
    for (const ComponentClass of this.components.keys()) {
      if (ComponentClass.name === componentRef) return ComponentClass;
    }
    return null;
  }
}