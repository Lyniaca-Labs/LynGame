import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";

export class Follow extends Component {
  // TODO: option for mouse following / separate component
  static schema = {
    targetId: { type: "entity", default: "", description: "Query path to the entity this one follows." },
    mode: {
      type: "select", default: "exponential", description: "Smoothing model.",
      options: [
        { value: "exponential", label: "Exponential" },
        { value: "spring", label: "Spring" },
        { value: "maxSpeed", label: "Max Speed" },
      ],
    },
    roundness: { type: "number", default: 0.85, description: "0 = instant snap, near 1 = very lazy/floaty. Used by exponential and maxSpeed modes." },
    stiffness: { type: "number", default: 120, description: "Spring mode only: how hard it pulls toward the target." },
    damping: { type: "number", default: 14, description: "Spring mode only: how quickly oscillation settles." },
    offsetX: { type: "number", default: 0, description: "Fixed X offset from the target's position." },
    offsetY: { type: "number", default: 0, description: "Fixed Y offset from the target's position." },
    axisLock: {
      type: "select", default: "both", description: "Restrict following to one axis.",
      options: [
        { value: "both", label: "Both" },
        { value: "x", label: "X only" },
        { value: "y", label: "Y only" },
      ],
    },
    deadzone: { type: "number", default: 0, description: "Radius within which no movement happens." },
    maxSpeed: { type: "number", default: 0, description: "Hard cap on movement speed, px/sec. 0 = uncapped." },
  };

  constructor(overrides = {}) {
    super(overrides);
    this._resolvedTarget = null;
    this._vx = 0; // spring mode velocity state
    this._vy = 0;
  }

  _resolveTarget(engine) {
    if (this._resolvedTarget && !this._resolvedTarget._destroyed) return this._resolvedTarget;
    if (!this.targetId) return null;
    const resolved = engine.query(this.targetId);
    this._resolvedTarget = resolved instanceof Object && "getWorldTransform" in resolved ? resolved : null;
    return this._resolvedTarget;
  }

  onTick(entity, engine, dt) {
    const target = this._resolveTarget(engine);
    const transform = entity.getComponent(Transform);
    if (!target || !transform) return;

    const targetTransform = target.getWorldTransform(engine);
    if (!targetTransform) return;

    let goalX = targetTransform.x + this.offsetX;
    let goalY = targetTransform.y + this.offsetY;

    if (this.axisLock === "x") goalY = transform.y;
    if (this.axisLock === "y") goalX = transform.x;

    const dx = goalX - transform.x;
    const dy = goalY - transform.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.deadzone) return;

    if (this.mode === "spring") {
      this._tickSpring(transform, goalX, goalY, dt);
    } else if (this.mode === "maxSpeed") {
      this._tickMaxSpeed(transform, goalX, goalY, dist, dt);
    } else {
      this._tickExponential(transform, goalX, goalY, dt);
    }
  }

  _tickExponential(transform, goalX, goalY, dt) {
    // roundness: 0 = instant snap, near 1 = very lazy. pow(roundness, dt) is
    // dt-independent (same shape regardless of frame rate).
    const t = 1 - Math.pow(this.roundness, dt);
    transform.x += (goalX - transform.x) * t;
    transform.y += (goalY - transform.y) * t;
  }

  _tickSpring(transform, goalX, goalY, dt) {
    // Semi-implicit Euler spring-damper, mass = 1. roundness is intentionally
    // unused here — stiffness/damping give more direct, predictable control
    // than deriving a damping ratio from a single 0-1 knob would.
    const ax = this.stiffness * (goalX - transform.x) - this.damping * this._vx;
    const ay = this.stiffness * (goalY - transform.y) - this.damping * this._vy;
    this._vx += ax * dt;
    this._vy += ay * dt;
    transform.x += this._vx * dt;
    transform.y += this._vy * dt;
  }

  _tickMaxSpeed(transform, goalX, goalY, dist, dt) {
    const rampDistance = Math.max(1, (this.maxSpeed || 200) * 0.5);
    const speedFrac = Math.min(1, (dist - this.deadzone) / rampDistance);
    // roundness shapes the deceleration curve: 0 = linear (snappy stop),
    // near 1 = eased (gentle, floaty stop).
    const exponent = 1 + this.roundness * 3;
    const speed = (this.maxSpeed || Infinity) * Math.pow(speedFrac, exponent);
    const step = Math.min(speed * dt, dist - this.deadzone);
    if (step <= 0) return;
    const nx = (goalX - transform.x) / dist;
    const ny = (goalY - transform.y) / dist;
    transform.x += nx * step;
    transform.y += ny * step;
  }
}
