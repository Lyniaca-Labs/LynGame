import { Component } from "../types/Component.js";

const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

function ease(name, t) {
  return EASINGS[name]?.(t) ?? t;
}

// Finds the two keyframes surrounding normalized time `t` on a track and
// returns the eased, interpolated value between them.
function sampleTrack(track, t, zeroValue) {
  if (!track.keyframes || track.keyframes.length === 0) return undefined;

  let keyframes = [...track.keyframes].sort((a, b) => a.time - b.time);
  if (keyframes[0].time > 0 && zeroValue !== undefined) {
    keyframes = [{ time: 0, value: zeroValue }, ...keyframes];
  }
  if (keyframes.length === 1) return keyframes[0].value;

  if (t <= keyframes[0].time) return keyframes[0].value;
  if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const from = keyframes[i];
    const to = keyframes[i + 1];
    if (t >= from.time && t <= to.time) {
      const span = to.time - from.time;
      const localT = span > 0 ? (t - from.time) / span : 1;
      const easingName = to.easing || track.easing || "linear";
      const eased = ease(easingName, localT);
      return from.value + (to.value - from.value) * eased;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

/**
 * Two animation APIs in one component:
 *
 * 1. Imperative single-property tweens via `animate()` — unchanged from
 *    before, useful for quick one-off code-driven motion.
 *
 * 2. Data-driven keyframe clips — reusable, named project assets (edited in
 *    the Animations panel, like CSS @keyframes) and triggered from scripts:
 *
 *   entity.getComponent("Animator").play("hover");
 *   entity.getComponent("Animator").stopClip("hover");
 *
 * Clip data itself lives in the project's `animations/` folder and is
 * resolved by name against the global `engine.animations` registry — the
 * `clips` field below is just a curated list of names for the Inspector to
 * show per entity (documentation of intent, same relationship `entity.scripts`
 * has to `engine.callScript`); `play()` isn't restricted to it. A clip has
 * one or more tracks, each targeting a property on any component on this
 * entity, so a single clip can drive e.g. Transform.y and
 * SpriteRenderer.opacity together.
 */
export class Animator extends Component {
  static schema = {
    clips: {
      type: "animationRefs",
      default: [],
      description:
        "Animation clip names this entity's Animator can play. Play with entity.getComponent('Animator').play('clipName').",
    },
  };

  constructor(overrides = {}) {
    super(overrides);
    this._entity = null;
    this._engine = null;
    this._tweens = []; // { target, prop, from, to, duration, elapsed, easing, onComplete }
    this._activeClips = []; // { name, clip, elapsed, resolvedTracks, loop, onComplete }
  }

  onSpawn(entity, engine) {
    this._entity = entity;
    this._engine = engine;
  }

  // --- Imperative single-property tween API ---

  /**
   * Animates `target[prop]` from its current value to `to` over `duration`
   * seconds. `target` is typically another component instance on the same
   * entity (e.g. its Transform), so pass `entity.getComponent("Transform")`.
   * Re-triggering on the same target+prop cancels the previous tween and
   * starts fresh from the current value.
   */
  animate(target, prop, to, { duration = 0.2, easing = "linear", onComplete = null } = {}) {
    if (!target || !(prop in target)) return this;
    this._tweens = this._tweens.filter((t) => !(t.target === target && t.prop === prop));
    this._tweens.push({ target, prop, from: target[prop], to, duration: Math.max(duration, 0.0001), elapsed: 0, easing, onComplete });
    return this;
  }

  // Cancels in-flight tweens. Omit `prop` to stop everything running on `target`.
  stop(target, prop) {
    this._tweens = this._tweens.filter((t) => !(t.target === target && (prop === undefined || t.prop === prop)));
  }

  isAnimating(target, prop) {
    return this._tweens.some((t) => t.target === target && (prop === undefined || t.prop === prop));
  }

  // --- Data-driven keyframe clip API ---

  /**
   * Plays a named clip from the project's global animation registry
   * (`engine.animations`, populated from the `animations/` folder at build
   * time — not restricted to this entity's own `clips` list). Each track's
   * `target` component name is resolved against this entity right now, so
   * tracks pointing at a component the entity doesn't have are skipped.
   * Re-playing the same clip name restarts it cleanly.
   */
  play(clipName, { loop, restart = false, onComplete = null } = {}) {
    const clip = this._engine?.animations?.[clipName];
    if (!clip || !this._entity) return this;

    const existing = this._activeClips.find((c) => c.name === clipName);
    if (existing && !restart) {
      if (loop !== undefined) existing.loop = loop;
      existing.onComplete = onComplete;
      return this;
    }

    const resolvedTracks = Object.values(clip.tracks ?? {})
      .filter((track) => track.property)
      .map((track) => ({ track, target: this._entity.getComponent(track.target) }))
      .filter(({ target, track }) => target && track.property in target)
      .map(({ track, target }) => ({ track, target, initialValue: target[track.property] }));

    this._activeClips = this._activeClips.filter((c) => c.name !== clipName);
    this._activeClips.push({
      name: clipName,
      clip,
      elapsed: 0,
      resolvedTracks,
      loop: loop ?? clip.loop ?? false,
      onComplete,
    });
    return this;
  }

  stopClip(clipName) {
    this._activeClips = this._activeClips.filter((c) => c.name !== clipName);
  }

  isPlayingClip(clipName) {
    return this._activeClips.some((c) => c.name === clipName);
  }

  onTick(entity, engine, dt) {
    if (this._tweens.length) {
      const finished = [];
      for (const tween of this._tweens) {
        tween.elapsed += dt;
        const t = Math.min(tween.elapsed / tween.duration, 1);
        const eased = ease(tween.easing, t);
        tween.target[tween.prop] = tween.from + (tween.to - tween.from) * eased;
        if (t >= 1) finished.push(tween);
      }
      if (finished.length) {
        this._tweens = this._tweens.filter((t) => !finished.includes(t));
        for (const tween of finished) tween.onComplete?.(entity, engine);
      }
    }

    if (this._activeClips.length) {
      const finished = [];
      for (const active of this._activeClips) {
        active.elapsed += dt;
        const duration = Math.max(active.clip.duration ?? 0.0001, 0.0001);
        let t = active.elapsed / duration;

        if (active.loop) {
          t = t % 1;
        } else if (t >= 1) {
          t = 1;
          finished.push(active);
        }

        for (const { track, target, initialValue } of active.resolvedTracks) {
          const additive = track.mode === "additive";
          const sampled = sampleTrack(track, t, additive ? 0 : initialValue);
          if (sampled !== undefined) target[track.property] = additive ? initialValue + sampled : sampled;
        }
      }
      if (finished.length) {
        this._activeClips = this._activeClips.filter((c) => !finished.includes(c));
        for (const active of finished) active.onComplete?.(entity, engine);
      }
    }
  }
}
