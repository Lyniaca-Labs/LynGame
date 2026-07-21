import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";

export class Movement extends Component {
  constructor({
    maxSpeed = 300,          // px/sec — clamps total velocity magnitude
    acceleration = 800,      // px/sec^2 — used by accelerateInDirection()
    friction = 600,          // px/sec^2 — deceleration applied when no force this frame
    gravity = 0,             // px/sec^2 — constant accel along gravityDirection
    gravityDirection = { x: 0, y: 1 }, // does not need to be pre-normalized
    drag = 0,                // 0-1 — fraction of velocity lost per second (air resistance)
    bounce = 0,              // 0-1 — restitution, reserved for a collision system to use
    mass = 1,                // scales force -> acceleration (applyForce respects this)
    velocity = { x: 0, y: 0 }, // initial velocity
  } = {}) {
    super();
    this.maxSpeed = maxSpeed;
    this.acceleration = acceleration;
    this.friction = friction;
    this.gravity = gravity;
    this.gravityDirection = this._normalize(gravityDirection.x, gravityDirection.y);
    this.drag = drag;
    this.bounce = bounce;
    this.mass = mass;

    this.velocity = { x: velocity.x, y: velocity.y };
    this._force = { x: 0, y: 0 }; // accumulated this frame, cleared after integration
  }

  // --- driving API, call from scripts/other components, not from Input directly ---

  applyForce(x, y) {
    this._force.x += x;
    this._force.y += y;
  }

  accelerateInDirection(dirX, dirY) {
    const [nx, ny] = this._normalizeArr(dirX, dirY);
    if (nx === 0 && ny === 0) return;
    this.applyForce(nx * this.acceleration * this.mass, ny * this.acceleration * this.mass);
  }

  setVelocity(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
  }

  stop() {
    this.velocity.x = 0;
    this.velocity.y = 0;
  }

  // --- lifecycle ---

  onTick(entity, engine, dt) {
    const transform = entity.getComponent(Transform);
    if (!transform) return;

    // gravity is a continuous force, not a one-off impulse — route it through
    // _force so it's integrated on the same branch that skips friction
    if (this.gravity !== 0) {
      this._force.x += this.gravityDirection.x * this.gravity * this.mass;
      this._force.y += this.gravityDirection.y * this.gravity * this.mass;
    }

    if (this._force.x !== 0 || this._force.y !== 0) {
      this.velocity.x += (this._force.x / this.mass) * dt;
      this.velocity.y += (this._force.y / this.mass) * dt;
      this._force.x = 0;
      this._force.y = 0;
    } else {
      this._applyFriction(dt);
    }

    if (this.drag > 0) {
      const dragFactor = Math.max(0, 1 - this.drag * dt);
      this.velocity.x *= dragFactor;
      this.velocity.y *= dragFactor;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
    }

    transform.x += this.velocity.x * dt;
    transform.y += this.velocity.y * dt;
  }

  // --- internal helpers ---

  _applyFriction(dt) {
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed === 0) return;

    const drop = this.friction * dt;
    if (drop >= speed) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }

    const scale = (speed - drop) / speed;
    this.velocity.x *= scale;
    this.velocity.y *= scale;
  }

  _normalizeArr(x, y) {
    const len = Math.hypot(x, y);
    return len === 0 ? [0, 0] : [x / len, y / len];
  }

  _normalize(x, y) {
    const [nx, ny] = this._normalizeArr(x, y);
    return { x: nx, y: ny };
  }
}