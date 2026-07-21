export class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
    this.script = null;
  }

  addComponent(ComponentClass, data = {}) {
    const instance = new ComponentClass(data);
    this.components.set(ComponentClass, instance);
    return this;
  }

  getComponent(ComponentClass) {
    return this.components.get(ComponentClass);
  }

  hasComponent(ComponentClass) {
    return this.components.has(ComponentClass);
  }

  attachScript(fn) {
    this.script = fn;
    return this;
  }
}