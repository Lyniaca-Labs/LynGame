export class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
    this.scripts = [];
    this.engine = null;

    this.state = {}; // for storing arbitrary state, e.g. for scripts to communicate with each other

    this.prefabName = null; // set by PrefabRegistry when spawned from a prefab
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

  getComponentList() {
    return Array.from(this.components.keys());
  }

  hasComponent(componentRef) {
    return this.getComponent(componentRef) !== undefined;
  }

  attachScript(fn) {
    this.scripts.push(fn);
    return this;
  }

  destroy(engine) {
    for (const instance of this.components.values()) {
      instance.onDestroy?.(this, engine);
    }
    // for (const child of Object.values(this.children)) {
    //   engine.removeEntity(child.id);
    // }
    // this.parent?.removeChild(this);
  }

  _resolveClass(componentRef) {
    if (typeof componentRef !== "string") return componentRef;
    for (const ComponentClass of this.components.keys()) {
      if (ComponentClass.name === componentRef) return ComponentClass;
    }
    return null;
  }
  
  // returns the max of sprite or shape renderer width and height
  getDimensions() {
    let width = 0;
    let height = 0;
    const spriteRenderer = this.getComponent("SpriteRenderer");
    if (spriteRenderer) {
      width = Math.max(width, spriteRenderer.width);
      height = Math.max(height, spriteRenderer.height);
    }
    const shapeRenderer = this.getComponent("ShapeRenderer");
    if (shapeRenderer) {
      width = Math.max(width, shapeRenderer.width);
      height = Math.max(height, shapeRenderer.height);
    }
    const textRenderer = this.getComponent("TextRenderer");
    if (textRenderer) {
      width = textRenderer.getWidth(this.engine.ctx);
      height = textRenderer.getHeight(this.engine.ctx);
    }
    return { width, height };
  }
}