export class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
    this.scripts = []; // array of functions to call on each tick, in order of attachment
    this.engine = null;

    this.state = {}; // for storing arbitrary state, e.g. for scripts to communicate with each other

    this.prefabName = null; // set by PrefabRegistry when spawned from a prefab

    this.parent = null; // parent Entity, or null for top-level entities
    this.children = []; // child Entities, e.g. a card's art/text/icons riding along with its bg

    // Set true the instant destroy()/removeEntity() runs. Engine tick loops
    // snapshot `entities` at the start of a frame, so a script that destroys
    // entities or switches scenes mid-frame (loadScene included) needs this
    // flag to stop the rest of that frame's passes from still ticking/rendering
    // entities that no longer belong to the current scene.
    this._destroyed = false;
  }

  /**
   * Parents `child` to this entity. The child's Transform x/y/rotation become
   * relative to this entity's world transform (see getWorldTransform) — e.g.
   * a card's icon entity can be positioned as a small offset from the card's
   * background entity, and will move/rotate together with it.
   */
  addChild(child) {
    if (!child || child === this) return this;
    if (child.parent === this) return this;
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    return this;
  }

  removeChild(child) {
    if (!child || child.parent !== this) return this;
    child.parent = null;
    this.children = this.children.filter((c) => c !== child);
    return this;
  }

  /**
   * Resolves this entity's Transform composed with every ancestor's Transform
   * (position + rotation), so a child entity renders/hit-tests at its correct
   * world position even though its own Transform only stores the offset
   * relative to its parent. Composition chains through grandparents,
   * great-grandparents, etc. — not just the immediate parent.
   *
   * Two escape hatches:
   * - An ancestor with no Transform component at all is transparently
   *   skipped (composition keeps walking up past it to whatever ancestor
   *   above IT has a Transform), rather than breaking the chain.
   * - If THIS entity's own Transform is marked `fixed`, it opts out of
   *   inheriting from its parent entirely and is used as-is — same meaning
   *   `fixed` already has for camera panning (screen-space/absolute),
   *   extended to also mean "absolute relative to its parent hierarchy".
   *
   * Returns a plain {x, y, rotation, fixed} object — same shape components
   * already read off a raw Transform — so renderers and Interactable don't
   * need to know entities can be nested.
   */
  getWorldTransform(engine) {
    const local = this.getComponent("Transform");
    if (!local) return null;
    if (!this.parent || local.fixed) return local;

    const parentWorld = this.parent._resolveAncestorTransform(engine);
    if (!parentWorld) return local;

    const rad = (parentWorld.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return {
      x: parentWorld.x + (local.x * cos - local.y * sin),
      y: parentWorld.y + (local.x * sin + local.y * cos),
      rotation: parentWorld.rotation + local.rotation,
      fixed: parentWorld.fixed,
    };
  }

  // Internal: like getWorldTransform, but if THIS entity has no Transform of
  // its own, transparently defers to ITS parent instead of stopping the
  // chain — the mechanism that lets a Transform-less "group" entity sit
  // between a child and its grandparent without breaking inheritance.
  _resolveAncestorTransform(engine) {
    if (this.getComponent("Transform")) return this.getWorldTransform(engine);
    return this.parent ? this.parent._resolveAncestorTransform(engine) : null;
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
    this._destroyed = true;
    for (const child of [...this.children]) {
      engine.removeEntity(child.id);
    }
    this.parent?.removeChild(this);
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