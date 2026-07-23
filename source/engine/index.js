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
    this.paused = false;
    this.state = {};

    this.devMode = options.devMode ?? true;

    this.prefabs = new PrefabRegistry(this);
    this.assets = new AssetLoader();

    this.startTime = Date.now();
    this._pausedElapsed = 0;
    this._pauseStartedAt = null;

    this.input = new Input(gameContainer);
    this.perf = new PerformanceMonitor(this, options.perf);

    window.addEventListener("resize", this._handleResize.bind(this));

    for (const [name, componentClass] of Object.entries(DEFAULT_COMPONENTS)) {
      this.registerComponent(name, componentClass);
    }

    this.newLayer("main", 0);

    this._handleResize();

    // expose global hooks the parent editor can call cross-document via
    // postMessage forwarding (see the message listeners below) or,
    // when same-origin, directly.
    window.pauseGame = () => this.pause();
    window.unPauseGame = () => this.unpause();
    window.getEntityPreview = (id, opts) => this.getEntityPreview(id, opts);


    window.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      window.parent.postMessage(
        { type: "EDITOR_KEYDOWN", key: e.key, ctrl: true, shift: e.shiftKey, alt: e.altKey },
        "*"
      );
    });

    window.addEventListener("message", (event) => {
      if (event.data?.type === "PAUSE") this.pause();
      if (event.data?.type === "UNPAUSE") this.unpause();

      if (event.data?.type === "GET_ENTITY_PREVIEW") {
        const { requestId, id, options } = event.data;
        const dataUrl = this.getEntityPreview(id, options);
        window.parent.postMessage(
          { type: "ENTITY_PREVIEW_RESULT", requestId, dataUrl },
          "*"
        );
      }
    });
  }

  get time() {
    const pausedElapsed =
      this._pausedElapsed + (this.paused ? Date.now() - this._pauseStartedAt : 0);
    return Date.now() - this.startTime - pausedElapsed;
  }

  // --- scenes ---

  loadScene(name) {
    if (!this.scenes || !this.scenes[name]) {
      console.error(`Scene "${name}" not found`);
      return;
    }
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

  // --- previews ---

  /**
   * Renders a single entity in isolation to an offscreen canvas and
   * returns a PNG data URL — handy for inspector thumbnails, prefab
   * icons, etc. This never touches the live "main" layer, so it's safe
   * to call anytime: mid-frame, while paused, whatever.
   *
   * Exposed as window.getEntityPreview(id, options) so the parent editor
   * can call it via postMessage/RPC without needing a dedicated bridge.
   *
   * @param {string} id - entity id
   * @param {object} [options]
   * @param {number} [options.width=128]
   * @param {number} [options.height=128]
   * @param {string|null} [options.background=null] - fill color, or null for transparent
   * @returns {string|null} data URL, or null if the entity/transform isn't found
   */
  getEntityPreview(id, options = {}) {
    const { width = 128, height = 128, background = null } = options;

    const entity = this.getEntity(id);
    if (!entity) return null;

    const transform = entity.getComponent(Transform);
    if (!transform) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    let renderWidth = 0;
    let renderHeight = 0;

    for (const component of entity.components.values()) {
      const isSprite = component.constructor.name === "SpriteRenderer";
      const isShape = component.constructor.name === "ShapeRenderer";

      if (!isSprite && !isShape) continue;

      renderWidth = Math.max(renderWidth, component.width ?? 0);
      renderHeight = Math.max(renderHeight, component.height ?? 0);
    }

    if (!renderWidth || !renderHeight) {
      renderWidth = 32;
      renderHeight = 32;
    }

    const scale = Math.min(
      width / renderWidth,
      height / renderHeight
    );

    const previewTransform = Object.assign(
      Object.create(Object.getPrototypeOf(transform)),
      transform,
      {
        x: width / 2,
        y: height / 2,
      }
    );

    for (const component of entity.components.values()) {
      if (!component.render) continue;

      const previewComponent = Object.assign(
        Object.create(Object.getPrototypeOf(component)),
        component
      );

      // Resize only the preview copy
      if (previewComponent.width) {
        previewComponent.width *= scale;
      }

      if (previewComponent.height) {
        previewComponent.height *= scale;
      }

      previewComponent.render(
        ctx,
        previewTransform,
        entity,
        this
      );
    }

    return canvas.toDataURL("image/png");
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

  pause() {
    if (this.paused) return;
    this.paused = true;
    this._pauseStartedAt = Date.now();
  }

  unpause() {
    if (!this.paused) return;
    this.paused = false;
    this._pausedElapsed += Date.now() - this._pauseStartedAt;
    this._pauseStartedAt = null;
    this._lastTime = performance.now();
  }

  togglePause() {
    if (this.paused) this.unpause();
    else this.pause();
  }

  _loop(time) {
    if (!this.running) return;

    const dt = Math.min((time - this._lastTime) / 1000, 1 / 30);
    this._lastTime = time;

    if (this.paused) {
      this._render();
      this.input._endFrame();
      requestAnimationFrame((t) => this._loop(t));
      return;
    }

    this.perf.beginFrame(dt);
    this._update(dt);
    this.perf.markUpdate();
    this._render();
    this.perf.markRender();
    this.perf.endFrame(this.entities.length);
    this.input._endFrame();

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    for (const entity of this.entities) {
      for (const script of entity.scripts) {
        script(entity, this, dt);
      }
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
      if (!transform) continue;

      for (const component of entity.components.values()) {
        component.render?.(gameLayer.ctx, transform, entity, this);
      }
    }
  }
}


