import { Component } from "../types/Component.js";

// Module-level cache: compiled functions are shared across every Interactable
// instance that uses the same source string (e.g. many entities stamped from
// the same prefab JSON), so identical code only gets parsed/compiled once.
const _compiledCodeCache = new Map();

function compileCode(code, paramNames = ["entity", "engine", "data"]) {
  if (code == null || typeof code === "function") return code ?? null;
  if (typeof code !== "string") return null;

  const cacheKey = paramNames.join(",") + "|" + code;
  const cached = _compiledCodeCache.get(cacheKey);
  if (cached) return cached;

  let fn;
  try {
    fn = new Function(...paramNames, code);
  } catch (err) {
    console.error("Interactable: failed to compile code string:", code, err);
    fn = null;
  }

  _compiledCodeCache.set(cacheKey, fn);
  return fn;
}

export class Interactable extends Component {
  static schema = {
    width: { type: "number", default: 0, description: "Width of the hit area, in pixels." },
    height: { type: "number", default: 0, description: "Height of the hit area, in pixels." },
    offsetX: { type: "number", default: 0, description: "Horizontal offset of the hit area." },
    offsetY: { type: "number", default: 0, description: "Vertical offset of the hit area." },

    cursor: {
      type: "select",
      default: "pointer",
      description: "CSS cursor shown while hovering this entity.",
      options: [
        { value: "pointer", label: "Pointer" },
        { value: "grab", label: "Grab" },
        { value: "default", label: "Default" },
        { value: "text", label: "Text" },
        { value: "not-allowed", label: "Not allowed" },
      ],
    },

    holdThreshold: { type: "number", default: 0.4, description: "Seconds pressed before onHold fires." },
    dragThreshold: { type: "number", default: 25, description: "Pixels of movement before a press becomes a drag." },

    onClick: { type: "code", default: null },
    onHoverEnter: { type: "code", default: null },
    onHoverExit: { type: "code", default: null },
    onHold: { type: "code", default: null },
    onDragStart: { type: "code", default: null },
    onDrag: { type: "code", default: null },
    onDragEnd: { type: "code", default: null },
  };

  constructor(overrides = {}) {
    super(overrides);

    this.onClick = compileCode(overrides.onClick);
    this.onHoverEnter = compileCode(overrides.onHoverEnter);
    this.onHoverExit = compileCode(overrides.onHoverExit);
    this.onHold = compileCode(overrides.onHold);
    this.onDragStart = compileCode(overrides.onDragStart);
    this.onDrag = compileCode(overrides.onDrag);
    this.onDragEnd = compileCode(overrides.onDragEnd);

    // internal interaction state
    this._hovered = false;
    this._pressed = false;
    this._dragging = false;
    this._holdFired = false;
    this._holdTimer = 0;
    this._pressStartX = 0;
    this._pressStartY = 0;
  }

  _getBoxWorld(entity, transform) {
    let width = this.width;
    let height = this.height;
    if (!width || !height) {
      const dims = entity.getDimensions();
      width = width || dims.width;
      height = height || dims.height;
    }

    const cx = transform.x + this.offsetX;
    const cy = transform.y + this.offsetY;

    return {
      left: cx - width / 2,
      right: cx + width / 2,
      top: cy - height / 2,
      bottom: cy + height / 2,
    };
  }

  // Converts an explicit screen-space (x, y) to world space using the current
  // camera. Takes x/y as params (rather than reading engine.input.pointer
  // directly) so both the event-driven path (handlePointerEvent) and the
  // continuous path (onTick's hover/hold checks) share one conversion,
  // fed from wherever each one gets its coordinates.
  //
  // ASSUMPTION: engine.input.pointer -> { x, y, ... } in screen/canvas space,
  // and drained events look like { type: "down"|"up"|"move", x, y } in the
  // same screen space. Adjust here if either shape differs.
  _screenToWorld(engine, transform, screenX, screenY) {
    const camera = engine.camera;
    const offsetX = !transform.fixed && camera ? camera.x : 0;
    const offsetY = !transform.fixed && camera ? camera.y : 0;
    return { x: screenX + offsetX, y: screenY + offsetY };
  }

  _isInside(world, box) {
    return world.x >= box.left && world.x <= box.right && world.y >= box.top && world.y <= box.bottom;
  }

  // Edge-triggered: called once per drained pointer event (down/up/move),
  // after Movement + Camera have both resolved for this frame (see engine
  // _update ordering). Owns press-start, drag-start/drag/drag-end, and click.
  handlePointerEvent(entity, engine, event) {
    const transform = entity.getComponent("Transform");
    if (!transform) return;

    const world = this._screenToWorld(engine, transform, event.x, event.y);
    const box = this._getBoxWorld(entity, transform);
    const inside = this._isInside(world, box);

    if (event.type === "down") {
      if (!inside) return;
      this._pressed = true;
      this._dragging = false;
      this._holdFired = false;
      this._holdTimer = 0;
      // store screen-space press point for threshold checks
      this._pressStartScreenX = event.x;
      this._pressStartScreenY = event.y;
      this._pressStartX = world.x;
      this._pressStartY = world.y;
      return;
    }

    if (event.type === "move") {
      if (!this._pressed) return;
      // camera-invariant: raw pointer movement only
      const dx = event.x - this._pressStartScreenX;
      const dy = event.y - this._pressStartScreenY;

      if (!this._dragging && Math.hypot(dx, dy) > this.dragThreshold) {
        this._dragging = true;
        this.onDragStart?.(entity, engine, { x: world.x, y: world.y });
      }
      if (this._dragging) {
        // still report world-space dx/dy to the callback if you want drag deltas
        // in world units, just compute them from world coords separately
        const worldDx = world.x - this._pressStartX;
        const worldDy = world.y - this._pressStartY;
        this.onDrag?.(entity, engine, { x: world.x, y: world.y, dx: worldDx, dy: worldDy });
      }
      return;
    }

    if (event.type === "up") {
      if (!this._pressed) return;

      if (this._dragging) {
        this.onDragEnd?.(entity, engine, { x: world.x, y: world.y });
      } else if (!this._holdFired) {
        // No `inside` recheck here (same reasoning as before): a clean
        // press+release without exceeding dragThreshold counts as a click
        // even if the box has since moved — e.g. an entity falling under
        // gravity between press and release.
        this.onClick?.(entity, engine);
      }
      this._pressed = false;
      this._dragging = false;
      this._holdFired = false;
      this._holdTimer = 0;
    }
  }

  // Continuous, per-frame: hover (can change even with no new pointer events,
  // if the box itself moves under a still cursor) and hold (accumulates by
  // dt, not by input events).
  onTick(entity, engine, dt) {
    const transform = entity.getComponent("Transform");
    if (!transform || !engine.input?.pointer) return;

    const world = this._screenToWorld(engine, transform, engine.input.pointer.x, engine.input.pointer.y);
    const box = this._getBoxWorld(entity, transform);
    const inside = this._isInside(world, box);

    if (inside && !this._hovered) {
      this._hovered = true;
      this.onHoverEnter?.(entity, engine);
      if (this.cursor) engine.gameContainer.style.cursor = this.cursor;
    } else if (!inside && this._hovered) {
      this._hovered = false;
      this.onHoverExit?.(entity, engine);
      if (this.cursor) engine.gameContainer.style.cursor = "";
    }

    if (this._pressed && !this._dragging && this.onHold) {
      this._holdTimer += dt;
      if (!this._holdFired && this._holdTimer >= this.holdThreshold) {
        this._holdFired = true;
        this.onHold(entity, engine);
      }
    }
  }

  onDestroy(entity, engine) {
    if (this._hovered && this.cursor) {
      engine.gameContainer.style.cursor = "";
    }
  }
}