import { Layer } from "./types/Layer.js";
import { Entity } from "./types/Entity.js";
import { Input } from "./modules/Input.js";
import { PerformanceMonitor } from "./modules/PerformanceMonitor.js";
import { DEFAULT_COMPONENTS } from "./types/DefaultComponents.js";
import { Transform } from "./components/Transform.js";
import { SpriteRenderer } from "./components/SpriteRenderer.js";
import { PrefabRegistry } from "./modules/PrefabRegistry.js";
import AssetLoader from "./modules/AssetLoader.js";
import { Scene } from "./types/Scene.js";
import * as GUI from "./modules/GUI.js";
export { LGTexture } from "./modules/TextureEngine.js";
export * as GUI from "./modules/GUI.js";

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

    this.scripts = {};
    this.animations = {};
    this.state = {}; // for storing arbitrary state, e.g. scripts, player data, etc...

    this.camera = null; // optional Camera component, if one is added to an entity. If one is available, it will be used

    this.devMode = options.devMode ?? true;

    this.prefabs = new PrefabRegistry(this);
    this.assets = new AssetLoader();
    this.gui = GUI; // { layoutHand, layoutRow, layoutStack } — scripts call engine.gui.layoutHand(...) etc.

    this.startTime = Date.now();
    this._pausedElapsed = 0;
    this._pauseStartedAt = null;

    this.ctx = document.createElement("canvas").getContext("2d"); // for measuring text sizes, etc. offscreen, never visible, never rendered

    this._cachedViewportSize = null;

    this.input = new Input(gameContainer, this);
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

    // Editor "click to select" support: when the parent editor turns this
    // on, a raw click anywhere in the game view hit-tests every entity
    // (independent of Interactable/onClick — most entities don't have one)
    // and reports the topmost hit back, so clicking something in the actual
    // running game can select its counterpart in the editor's Explorer.
    // Off by default so a standalone build never pays for the listener.
    this._editorPicking = false;
    this.gameContainer.addEventListener("pointerdown", (e) => {
      if (!this._editorPicking) return;
      const rect = this.gameContainer.getBoundingClientRect();
      const entity = this.pickEntityAt(e.clientX - rect.left, e.clientY - rect.top);
      if (entity) {
        window.parent.postMessage({ type: "ENTITY_PICKED", id: entity.id }, "*");
      }
    });

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

      if (event.data?.type === "EDITOR_ENABLE_PICKING") {
        this._editorPicking = !!event.data.enabled;
      }
    });
  }

  registerScript(name, script) {
    this.scripts[name] = script;
  }
  callScript(name, ...args) {
    const script = this.scripts[name];
    if (!script) return console.error(`Script "${name}" not found`);
    return script(...args);
  }

  registerAnimation(name, data) {
    this.animations[name] = data;
  }

  get time() {
    const pausedElapsed =
      this._pausedElapsed + (this.paused ? Date.now() - this._pauseStartedAt : 0);
    return Date.now() - this.startTime - pausedElapsed;
  }

  // --- scenes ---

  setCamera(entityId) {
    if (!entityId) {
      this.camera = null;
      return;
    }
    const entity = this.getEntity(entityId);
    if (!entity) return console.error(`Entity "${entityId}" not found`);
    const camera = entity.getComponent("Camera");
    if (!camera) return console.error(`Entity "${entityId}" has no Camera component`);
    this.camera = camera;
  }


  registerScene(name, load, cameraId = null) {
    this.scenes[name] = new Scene(name, load, cameraId);
  }

  loadScene(name) {
    const scene = this.scenes[name];
    if (!scene) {
      console.error(`Scene "${name}" not found`);
      return;
    }

    // Bulk teardown instead of calling removeEntity() per-entity (which
    // re-filters `this.entities` on every call, O(n^2) for n live entities —
    // the more a scene had spawned before switching, the laggier the switch
    // got). We're replacing the whole array anyway, so just flag everything
    // destroyed and fire onDestroy once each.
    const oldEntities = this.entities;
    this.entities = [];
    for (const entity of oldEntities) entity._destroyed = true;
    for (const entity of oldEntities) {
      for (const instance of entity.components.values()) {
        instance.onDestroy?.(entity, this);
      }
    }

    this.camera = null;
    this.currentScene = name;
    scene.load(this);

    // 1. scene's load fn may have called this.setCamera(...) explicitly — leave it alone
    // 2. otherwise, use the scene's own declared cameraId
    // 3. otherwise, auto-detect the first entity with a Camera component
    if (!this.camera && scene.cameraId) {
      this.setCamera(scene.cameraId);
    }

    if (!this.camera) {
      for (const entity of this.entities) {
        const camera = entity.getComponent("Camera");
        if (camera) {
          this.camera = camera;
          break;
        }
      }
    }
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

  getViewportSize() {
    if (!this._cachedViewportSize) {
      this._cachedViewportSize = {
        width: this.gameContainer.clientWidth,
        height: this.gameContainer.clientHeight,
      };
    }
    return this._cachedViewportSize;
  }

  // --- editor picking ---

  /**
   * Hit-tests every entity's bounding box (Transform + SpriteRenderer/
   * ShapeRenderer/TextRenderer dimensions, same source Interactable uses)
   * against a screen-space point and returns the topmost match — highest
   * Transform.zIndex first, same order things are drawn in _render(), so
   * "topmost" here means "what you'd actually see at that pixel".
   * Screen->world conversion matches Interactable._screenToWorld exactly
   * (camera offset applied unless the transform is `fixed`).
   *
   * @returns {Entity|null}
   */
  pickEntityAt(screenX, screenY) {
    const camera = this.camera;

    const drawOrder = [...this.entities].sort((a, b) => {
      const za = a.getComponent(Transform)?.zIndex ?? 0;
      const zb = b.getComponent(Transform)?.zIndex ?? 0;
      return za - zb;
    });

    for (let i = drawOrder.length - 1; i >= 0; i--) {
      const entity = drawOrder[i];
      if (entity._destroyed) continue;

      const transform = entity.getWorldTransform(this);
      if (!transform) continue;

      const { width, height } = entity.getDimensions();
      if (!width || !height) continue;

      const offsetX = !transform.fixed && camera ? camera.x : 0;
      const offsetY = !transform.fixed && camera ? camera.y : 0;
      const worldX = screenX + offsetX;
      const worldY = screenY + offsetY;

      const left = transform.x - width / 2;
      const right = transform.x + width / 2;
      const top = transform.y - height / 2;
      const bottom = transform.y + height / 2;

      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return entity;
      }
    }

    return null;
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
    this._cachedViewportSize = null;

    // Snapshot the list once per frame. A script can call loadScene()/
    // removeEntity() mid-loop, which reassigns `this.entities` to a brand
    // new array — without this snapshot, the for-of below would keep
    // iterating whatever `this.entities` currently points to (the NEW
    // scene's entities), running the OLD scene's still-in-progress script
    // pass against them (e.g. an old-scene spawner script would spawn into
    // the new scene). We iterate this frozen `entities` list instead, and
    // skip anything flagged `_destroyed` along the way.
    const entities = [...this.entities];

    // 1. Scripts + every component EXCEPT Camera/Interactable run first.
    //    This is where Movement lives, so gravity/velocity resolve transform.y
    //    for this frame before anything reads it for camera-follow or hit-testing.
    //    (Camera and Interactable are excluded here and ticked explicitly below,
    //    in the order they actually depend on each other.)
    for (const entity of entities) {
      if (entity._destroyed) continue;
      const camera = entity.getComponent("Camera");
      const interactable = entity.getComponent("Interactable");

      for (const script of entity.scripts) script(entity, this, dt);
      if (entity._destroyed) continue; // a script above may have switched scenes / destroyed this entity
      for (const component of entity.components.values()) {
        if (component === camera || component === interactable) continue;
        component.onTick?.(entity, this, dt);
      }
    }

    // 2. Camera follows this frame's FINAL transform (post-Movement).
    for (const entity of entities) {
      if (entity._destroyed) continue;
      entity.getComponent("Camera")?.onTick?.(entity, this, dt);
    }

    // 3. Pointer events hit-test against this frame's final transform + camera.
    //    Edge-triggered only: press-start, drag-start/drag/drag-end, click.
    const events = this.input.drainPointerEvents();
    for (const event of events) {
      for (const entity of entities) {
        if (entity._destroyed) continue;
        entity.getComponent("Interactable")?.handlePointerEvent?.(entity, this, event);
      }
    }

    // 4. Interactable's own onTick: hover + hold. Both are continuous/time-based
    //    (hover can change with no new events if the box moves under a still
    //    cursor; hold accumulates by dt regardless of events), so they need a
    //    per-frame pass against the same final transform + camera as above.
    for (const entity of entities) {
      if (entity._destroyed) continue;
      entity.getComponent("Interactable")?.onTick?.(entity, this, dt);
    }
  }


  _render() {
    const gameLayer = this.getLayer("main");
    if (!gameLayer) return;
    gameLayer.clear();

    // Stable sort by Transform.zIndex so cards/UI painted later (higher
    // zIndex) land on top — e.g. hand fanning, or bumping a dragged card's
    // zIndex so it draws above the rest of the hand while held.
    const drawOrder = [...this.entities].sort((a, b) => {
      const za = a.getComponent(Transform)?.zIndex ?? 0;
      const zb = b.getComponent(Transform)?.zIndex ?? 0;
      return za - zb;
    });

    for (const entity of drawOrder) {
      if (entity._destroyed) continue;
      const transform = entity.getWorldTransform(this);
      if (!transform) continue;

      for (const component of entity.components.values()) {
        component.render?.(gameLayer.ctx, transform, entity, this);
      }
    }
  }
}


