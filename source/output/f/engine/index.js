import { Layer } from "./types/Layer.js";
import { Entity } from "./types/Entity.js";
import { DEFAULT_COMPONENTS } from "./types/Component.js";
import { Transform } from "./components/Transform.js";
import { SpriteRenderer } from "./components/SpriteRenderer.js";

export class GameEngine {
  constructor(gameContainer) {
    this.gameContainer = gameContainer;
    this.layers = [];
    this.entities = [];
    this.components = {};
    this.running = false;

    window.addEventListener("resize", this._handleResize.bind(this));

    for (const [name, componentClass] of Object.entries(DEFAULT_COMPONENTS)) {
      this.registerComponent(name, componentClass);
    }

    // default layer every game gets out of the box
    this.newLayer("game", 0);

    this._handleResize();
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
    this.entities.push(entity);
    return entity;
  }

  removeEntity(id) {
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

    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    for (const entity of this.entities) {
      if (typeof entity.script === "function") {
        entity.script(entity, this, dt);
      }
    }
  }

  _render() {
    const gameLayer = this.getLayer("game");
    if (!gameLayer) return;
    gameLayer.clear();

    for (const entity of this.entities) {
      const transform = entity.getComponent(Transform);
      const sprite = entity.getComponent(SpriteRenderer);
      if (!transform || !sprite) continue;

      gameLayer.ctx.save();
      gameLayer.ctx.translate(transform.x, transform.y);
      gameLayer.ctx.rotate((transform.rotation * Math.PI) / 180);
      gameLayer.ctx.fillStyle = sprite.color;
      gameLayer.ctx.fillRect(0, 0, sprite.width, sprite.height);
      gameLayer.ctx.restore();
    }
  }
}
