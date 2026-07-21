import { Layer } from "./types/Layer.js";
import { Entity } from "./types/Entity.js";
import { Input } from "./modules/Input.js";
import { DEFAULT_COMPONENTS } from "./types/DefaultComponents.js";
import { Transform } from "./components/Transform.js";
import { SpriteRenderer } from "./components/SpriteRenderer.js";

export class GameEngine {
  constructor(gameContainer) {
    this.gameContainer = gameContainer;
    this.layers = [];
    this.entities = [];
    this.components = {};
    this.scenes = {};
    this.currentScene = null;
    this.running = false;

    this.startTime = Date.now();

    this.input = new Input(gameContainer);

    window.addEventListener("resize", this._handleResize.bind(this));

    for (const [name, componentClass] of Object.entries(DEFAULT_COMPONENTS)) {
      this.registerComponent(name, componentClass);
    }

    // default layer every game gets out of the box
    this.newLayer("game", 0);

    this._handleResize();
  }

  get time() {
    return Date.now() - this.startTime;
  }

  // --- scenes ---

  loadScene(name) {
    if (!this.scenes || !this.scenes[name]) {
      console.error(`Scene "${name}" not found`);
      return;
    }

    // tear down current entities properly (fires onDestroy)
    for (const entity of [...this.entities]) {
      this.removeEntity(entity.id);
    }

    this.currentScene = name;
    this.scenes[name](this);
  }

  registerScene(name, initFn) {
    if (!this.scenes) this.scenes = {};
    this.scenes[name] = initFn;
  }

  // --- layers ---

  newLayer(name, zIndex) {
    const layer = new Layer(name, this.gameContainer.clientWidth, this.gameContainer.clientHeight);
    layer.canvas.style.position = "absolute";
    layer.canvas.style.top = "0";
    layer.canvas.style.left = "0";
    layer.canvas.style.zIndex = zIndex;
    this.gameContainer.appendChild(layer.canvas);
    this.layers.push(layer);
    return layer;
  }

  getLayer(name) {
    return this.layers.find((l) => l.name === name);
  }

  _handleResize() {
    const width = this.gameContainer.clientWidth;
    const height = this.gameContainer.clientHeight;
    for (const layer of this.layers) {
      layer.canvas.width = width;
      layer.canvas.height = height;
    }
  }

  // --- components ---

  registerComponent(name, componentClass) {
    this.components[name] = componentClass;
  }

  // --- entities ---

  createEntity(id) {
    const entity = new Entity(id);
    entity.engine = this;
    this.entities.push(entity);
    return entity;
  }

  removeEntity(id) {
    const entity = this.getEntity(id);
    if (!entity) return;
    entity.destroy(this);
    this.entities = this.entities.filter((e) => e.id !== id);
  }

  getEntity(id) {
    return this.entities.find((e) => e.id === id);
  }

  // --- lifecycle ---

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  stop() {
    this.running = false;
  }

  _loop(time) {
    if (!this.running) return;

    const dt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    this._update(dt);
    this._render();

    // clear one-frame input state — must run AFTER update+render read it
    this.input._endFrame();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    for (const entity of this.entities) {
      for (const component of entity.components.values()) {
        component.onTick?.(entity, this, dt);
      }
      for (const script of entity.scripts) {
        script(entity, this, dt);
      }
    }
  }

  _render() {
    const gameLayer = this.getLayer("game");
    if (!gameLayer) return;
    gameLayer.clear();

    for (const entity of this.entities) {
      const transform = entity.getComponent(Transform);
      if (!transform) continue;

      for (const component of entity.components.values()) {
        component.render?.(gameLayer.ctx, transform);
      }
    }
  }
}