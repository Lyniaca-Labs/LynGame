import { Component } from "../types/Component.js";

const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

/**
 * Lightweight numeric tweening, driven off this entity's own onTick — no
 * engine changes or manual dt bookkeeping required in scripts. Meant to be
 * called *conditionally* from event code (Interactable's onHoverEnter/
 * onHold/onDragStart/etc, or any script), e.g. lifting a card on hover and
 * dropping it back on hover-exit:
 *
 *   onHoverEnter: entity.getComponent("Animator").animate(
 *     entity.getComponent("Transform"), "y", -20, { duration: 0.15, easing: "easeOut" }
 *   );
 *   onHoverExit: entity.getComponent("Animator").animate(
 *     entity.getComponent("Transform"), "y", 0, { duration: 0.15, easing: "easeIn" }
 *   );
 *
 * Re-triggering an animate() on the same target+prop cancels the previous
 * tween and starts fresh from the current value, so rapid hover in/out
 * doesn't queue up or fight itself.
 */
export class Animator extends Component {
  static schema = {};

  constructor(overrides = {}) {
    super(overrides);
    this._tweens = []; // { target, prop, from, to, duration, elapsed, easing, onComplete }
  }

  /**
   * Animates `target[prop]` from its current value to `to` over `duration`
   * seconds. `target` is typically another component instance on the same
   * entity (e.g. its Transform), so pass `entity.getComponent("Transform")`.
   */
  animate(target, prop, to, { duration = 0.2, easing = "linear", onComplete = null } = {}) {
    if (!target || !(prop in target)) return this;
    this._tweens = this._tweens.filter((t) => !(t.target === target && t.prop === prop));
    this._tweens.push({
      target,
      prop,
      from: target[prop],
      to,
      duration: Math.max(duration, 0.0001),
      elapsed: 0,
      easing,
      onComplete,
    });
    return this;
  }

  // Cancels in-flight tweens. Omit `prop` to stop everything running on `target`.
  stop(target, prop) {
    this._tweens = this._tweens.filter((t) => !(t.target === target && (prop === undefined || t.prop === prop)));
  }

  isAnimating(target, prop) {
    return this._tweens.some((t) => t.target === target && (prop === undefined || t.prop === prop));
  }

  onTick(entity, engine, dt) {
    if (!this._tweens.length) return;

    const finished = [];
    for (const tween of this._tweens) {
      tween.elapsed += dt;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      const eased = EASINGS[tween.easing]?.(t) ?? t;
      tween.target[tween.prop] = tween.from + (tween.to - tween.from) * eased;
      if (t >= 1) finished.push(tween);
    }

    if (finished.length) {
      this._tweens = this._tweens.filter((t) => !finished.includes(t));
      for (const tween of finished) tween.onComplete?.(entity, engine);
    }
  }
}
