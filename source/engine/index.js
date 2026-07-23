import { Layer } from "./types/Layer.js";
import { Entity } from "./types/Entity.js";
import { Input } from "./modules/Input.js";
import { PerformanceMonitor } from "./modules/PerformanceMonitor.js";
import { DEFAULT_COMPONENTS } from "./types/DefaultComponents.js";
import { Transform } from "./components/Transform.js";
import { SpriteRenderer } from "./components/SpriteRenderer.js";
import { PrefabRegistry } from "./modules/PrefabRegistry.js";
import AssetLoader from "./modules/AssetLoader.js";

export class GameEngine {
  constructor(gameContainer, options = {}) {
    this.gameContainer = gameContainer;
    this.layers = [];
    this.entities = [];
    this.components = {};
    this.scenes = {};
    this.currentScene = null;
    this.running = false;
    this.state = {}; // globally accessible state

    this.devMode = options.devMode ?? true;

    this.prefabs = new PrefabRegistry(this);
    this.assets = new AssetLoader();

    this.startTime = Date.now();

    this.input = new Input(gameContainer);
    this.perf = new PerformanceMonitor(this, options.perf);

    window.addEventListener("resize", this._handleResize.bind(this));

    for (const [name, componentClass] of Object.entries(DEFAULT_COMPONENTS)) {
      this.registerComponent(name, componentClass);
    }

    // default layer every game gets out of the box
    this.newLayer("main", 0);

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
      // TODO: pass image smoothing setting from engine config
      layer.ctx.imageSmoothingEnabled = false;
    }
  }

  // --- components ---

  registerComponent(name, componentClass) {
    this.components[name] = componentClass;
  }

  // --- entities ---


  createEntity(id) {
    const finalId = id ?? this._generateId("entity");
    if (this.getEntity(finalId)) {
      console.error(`Entity id "${finalId}" already exists`);
      return null;
    }
    const entity = new Entity(finalId);
    entity.engine = this;
    this.entities.push(entity);
    return entity;
  }

  _generateId(prefix) {
    this._idCounters ??= {};
    this._idCounters[prefix] = (this._idCounters[prefix] ?? 0) + 1;
    return `${prefix}_${this._idCounters[prefix]}`;
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

    const dt = Math.min((time - this._lastTime) / 1000, 1 / 30);
    this._lastTime = time;

    this.perf.beginFrame(dt);

    this._update(dt);
    this.perf.markUpdate();

    this._render();
    this.perf.markRender();

    this.perf.endFrame(this.entities.length);

    // clear one-frame input state — must run AFTER update+render read it
    this.input._endFrame();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    for (const entity of this.entities) {
      // scripts decide intent (input, AI, forces) FIRST
      for (const script of entity.scripts) {
        script(entity, this, dt);
      }
      // components integrate that intent into physics/state SECOND
      for (const component of entity.components.values()) {
        component.onTick?.(entity, this, dt);
      }
    }
  }

  _render() {
    const gameLayer = this.getLayer("main");
    if (!gameLayer) return;
    gameLayer.clear();

    for (const entity of this.entities) {
      const transform = entity.getComponent(Transform);
      if (!transform) {
        // if (this.devMode) console.warn(`Entity id "${entity.id}" is missing Transform component, cannot render`);
        continue;
      }

      // all rendering based components
      for (const component of entity.components.values()) {
        component.render?.(gameLayer.ctx, transform, entity, this);
      }
    }
  }
}