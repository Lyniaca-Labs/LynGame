import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";
import { Movement } from "./Movement.js";
import { ShapeRenderer } from "./ShapeRenderer.js";
import { SpriteRenderer } from "./SpriteRenderer.js";
import { Opacity } from "./Opacity.js";

// Same duplicated-per-file pattern Collision.js/Interactable.js use — no
// shared compile utility exists yet in this codebase.
const _compiledCodeCache = new Map();
function compileCode(code, paramNames = ["entity", "particle", "engine"]) {
  if (code == null || typeof code === "function") return code ?? null;
  if (typeof code !== "string") return null;

  const cacheKey = paramNames.join(",") + "|" + code;
  const cached = _compiledCodeCache.get(cacheKey);
  if (cached) return cached;

  let fn;
  try {
    fn = new Function(...paramNames, code);
  } catch (err) {
    console.error("Emitter: failed to compile code:", code, err);
    fn = null;
  }
  _compiledCodeCache.set(cacheKey, fn);
  return fn;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Resolves a schema value that may be a fixed number, a [min, max] range to
// randomize between, or omitted entirely (falls back to the emitter-level
// [fallbackMin, fallbackMax] range).
function resolveRange(value, fallbackMin, fallbackMax) {
  if (Array.isArray(value) && value.length === 2) return lerp(value[0], value[1], Math.random());
  if (typeof value === "number") return value;
  return lerp(fallbackMin, fallbackMax, Math.random());
}

function pickColor(type) {
  const c = type?.color;
  if (Array.isArray(c) && c.length > 0) return c[Math.floor(Math.random() * c.length)];
  if (typeof c === "string" && c) return c;
  return "#ffffff";
}

// Used only when particleTypes is empty — keeps a bare Emitter useful with
// zero configuration instead of silently emitting nothing.
const FALLBACK_PARTICLE_TYPES = [{ weight: 1, shape: "circle", color: "#ffffff", size: [3, 3] }];

export class Emitter extends Component {
  static schema = {
    enabled: { type: "boolean", default: true, description: "Whether the emitter is currently spawning. Flipping false->true re-arms a one-shot burst." },
    mode: {
      type: "select", default: "continuous", description: "Continuous spawns at a steady rate. Burst fires a batch at once (optionally repeating every burstInterval seconds).",
      options: [
        { value: "continuous", label: "Continuous" },
        { value: "burst", label: "Burst" },
      ],
    },
    rate: { type: "number", default: 30, description: "Particles spawned per second (continuous mode)." },
    burstCount: { type: "number", default: 24, description: "Particles spawned per burst (burst mode)." },
    burstInterval: { type: "number", default: 0, description: "Seconds between bursts (burst mode). 0 = fire once and stop until re-triggered." },
    maxParticles: { type: "number", default: 200, description: "Cap on this emitter's simultaneously-live particles; spawning pauses once hit." },

    angle: { type: "number", default: -90, description: "Base emission direction in degrees (0 = right/+x, 90 = down/+y, -90 = up)." },
    spread: { type: "number", default: 25, description: "Random +/- degrees around angle each particle's direction is chosen within." },
    speedMin: { type: "number", default: 60, description: "Minimum initial speed, px/sec. Overridden per-type by particleTypes[].speed." },
    speedMax: { type: "number", default: 180, description: "Maximum initial speed, px/sec." },
    lifetimeMin: { type: "number", default: 0.6, description: "Minimum particle lifetime, seconds. Overridden per-type by particleTypes[].lifetime." },
    lifetimeMax: { type: "number", default: 1.4, description: "Maximum particle lifetime, seconds." },
    spawnRadius: { type: "number", default: 0, description: "Particles spawn at a random point within this radius of the emitter instead of exactly at its origin." },

    gravity: { type: "number", default: 0, description: "Default px/sec² downward accel for particles. Overridden per-type by particleTypes[].gravity." },
    drag: { type: "number", default: 0, description: "Default 0-1 fraction of velocity lost per second (air resistance). Overridden per-type by particleTypes[].drag." },
    fadeOut: { type: "boolean", default: true, description: "Whether particles fade opacity to 0 over their lifetime. Overridden per-type by particleTypes[].fadeOut." },

    particleTypes: {
      type: "json",
      default: [
        { weight: 1, shape: "circle", color: ["#ffd166", "#f4a261"], size: [3, 7], spin: [-90, 90] },
        { weight: 1, shape: "circle", color: "#ef476f", size: [2, 5] },
        { weight: 0.6, shape: "rect", color: "#06d6a0", size: [3, 6], spin: [180, 360] },
      ],
      description:
        "Array of particle archetypes to randomly pick between (relative `weight`, default 1). Each entry: " +
        "{ weight, shape: \"circle\"|\"rect\", color: \"#hex\" or [\"#hex\", ...] (random pick), sprite (asset key, " +
        "renders via SpriteRenderer instead of a shape), frame, prefab (name of a registered prefab to instantiate " +
        "instead of a bare shape/sprite entity), size: number or [min,max], speed: number or [min,max] (px/sec, " +
        "overrides emitter speedMin/Max), angle: number or [min,max] (degrees, overrides emitter angle+/-spread), " +
        "lifetime: number or [min,max] (seconds), gravity, drag, spin: number or [min,max] (deg/sec rotation), " +
        "fadeOut (bool), shrink (bool, scales size to 0 over lifetime), zIndex }.",
    },

    onParticleSpawn: { type: "code", default: null, description: "Runs each time a particle is spawned. Signature: (entity, particle, engine) — entity is this Emitter's own entity." },
    onParticleDeath: { type: "code", default: null, description: "Runs each time a particle expires (just before it's removed). Signature: (entity, particle, engine)." },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns all scalar/select/json fields from schema
    this.onParticleSpawn = compileCode(overrides.onParticleSpawn);
    this.onParticleDeath = compileCode(overrides.onParticleDeath);

    this._particles = []; // { entity, age, lifetime, fadeOut, shrink, spin, baseWidth, baseHeight }
    this._spawnAccumulator = 0;
    this._burstTimer = 0;
    this._burstFired = false; // one-shot (burstInterval === 0) bursts fire exactly once per enable-edge
    this._wasEnabled = false;
  }

  onSpawn(entity, engine) {
    this._entity = entity;
    this._engine = engine;
  }

  onTick(entity, engine, dt) {
    this._ageParticles(entity, engine, dt);

    const justEnabled = this.enabled && !this._wasEnabled;
    this._wasEnabled = this.enabled;
    if (justEnabled && this.mode === "burst") {
      this._burstTimer = 0;
      this._burstFired = false;
    }
    if (!this.enabled) return;

    if (this.mode === "burst") {
      if (this._burstFired && this.burstInterval <= 0) return;
      this._burstTimer -= dt;
      if (this._burstTimer <= 0) {
        this._fireBurst(entity, engine);
        this._burstFired = true;
        this._burstTimer = this.burstInterval > 0 ? this.burstInterval : Infinity;
      }
    } else {
      this._spawnAccumulator += dt * Math.max(0, this.rate);
      while (this._spawnAccumulator >= 1) {
        this._spawnAccumulator -= 1;
        if (this._particles.length >= this.maxParticles) break;
        this._spawnParticle(entity, engine);
      }
    }
  }

  onDestroy(entity, engine) {
    for (const p of this._particles) engine.removeEntity(p.entity.id);
    this._particles.length = 0;
  }

  // --- public API for scripts ---

  get liveCount() {
    return this._particles.length;
  }

  start() {
    this.enabled = true;
  }

  stop() {
    this.enabled = false;
  }

  // Fires an immediate burst of `count` particles (default burstCount),
  // regardless of mode/enabled — handy for one-off script-triggered effects
  // like a card-play sparkle. Requires onSpawn to have run (i.e. the Emitter
  // is on a live entity).
  trigger(count = this.burstCount) {
    if (!this._entity || !this._engine) return;
    for (let i = 0; i < count; i++) {
      if (this._particles.length >= this.maxParticles) break;
      this._spawnParticle(this._entity, this._engine);
    }
  }

  // --- internals ---

  _fireBurst(entity, engine) {
    for (let i = 0; i < this.burstCount; i++) {
      if (this._particles.length >= this.maxParticles) break;
      this._spawnParticle(entity, engine);
    }
  }

  _pickType() {
    const types = Array.isArray(this.particleTypes) && this.particleTypes.length > 0 ? this.particleTypes : FALLBACK_PARTICLE_TYPES;
    const total = types.reduce((sum, t) => sum + Math.max(0, t?.weight ?? 1), 0);
    if (total <= 0) return types[0];
    let r = Math.random() * total;
    for (const t of types) {
      r -= Math.max(0, t?.weight ?? 1);
      if (r <= 0) return t;
    }
    return types[types.length - 1];
  }

  _ageParticles(entity, engine, dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      if (p.entity._destroyed) {
        this._particles.splice(i, 1);
        continue;
      }

      p.age += dt;
      if (p.age >= p.lifetime) {
        this.onParticleDeath?.(entity, p.entity, engine);
        engine.removeEntity(p.entity.id);
        this._particles.splice(i, 1);
        continue;
      }

      const t = p.age / p.lifetime;
      if (p.fadeOut) {
        const opacity = p.entity.getComponent(Opacity);
        if (opacity) opacity.value = 1 - t;
      }
      if (p.shrink) {
        const scale = Math.max(0, 1 - t);
        const renderer = p.entity.getComponent(ShapeRenderer) ?? p.entity.getComponent(SpriteRenderer);
        if (renderer) {
          renderer.width = p.baseWidth * scale;
          renderer.height = p.baseHeight * scale;
        }
      }
      if (p.spin) {
        const transform = p.entity.getComponent(Transform);
        if (transform) transform.rotation += p.spin * dt;
      }
    }
  }

  _spawnParticle(entity, engine) {
    const origin = entity.getWorldTransform(engine);
    if (!origin) return;

    const type = this._pickType();

    let ox = 0, oy = 0;
    if (this.spawnRadius > 0) {
      const r = this.spawnRadius * Math.sqrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      ox = Math.cos(theta) * r;
      oy = Math.sin(theta) * r;
    }

    const angleDeg = resolveRange(type.angle, this.angle - this.spread, this.angle + this.spread);
    const speed = resolveRange(type.speed, this.speedMin, this.speedMax);
    const rad = (angleDeg * Math.PI) / 180;
    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;

    const lifetime = Math.max(0.05, resolveRange(type.lifetime, this.lifetimeMin, this.lifetimeMax));
    const size = Math.max(0, resolveRange(type.size, 4, 4));
    const gravity = typeof type.gravity === "number" ? type.gravity : this.gravity;
    const drag = typeof type.drag === "number" ? type.drag : this.drag;
    const fadeOut = typeof type.fadeOut === "boolean" ? type.fadeOut : this.fadeOut;
    const shrink = !!type.shrink;
    const spin = resolveRange(type.spin, 0, 0);
    const zIndex = typeof type.zIndex === "number" ? type.zIndex : 0;

    let particle;
    if (type.prefab) {
      particle = engine.prefabs.instantiate(type.prefab);
      if (!particle) return;
      const t = particle.getComponent(Transform);
      if (t) {
        t.x = origin.x + ox;
        t.y = origin.y + oy;
        t.zIndex = zIndex;
        t.fixed = origin.fixed;
      } else {
        particle.addComponent(Transform, { x: origin.x + ox, y: origin.y + oy, zIndex, fixed: origin.fixed });
      }
    } else {
      particle = engine.createEntity();
      particle.addComponent(Transform, { x: origin.x + ox, y: origin.y + oy, zIndex, fixed: origin.fixed });
      if (type.sprite) {
        particle.addComponent(SpriteRenderer, { sprite: type.sprite, frame: type.frame ?? "", width: size, height: size });
      } else {
        particle.addComponent(ShapeRenderer, { shape: type.shape === "rect" ? "rect" : "circle", width: size, height: size, color: pickColor(type) });
      }
    }

    if (!particle.hasComponent(Opacity)) particle.addComponent(Opacity, { value: 1 });

    const movement = particle.getComponent(Movement);
    if (movement) {
      movement.velocity.x = vx;
      movement.velocity.y = vy;
      movement.gravity = gravity;
      movement.gravityDirection = { x: 0, y: 1 };
      movement.drag = drag;
      movement.friction = 0;
    } else {
      particle.addComponent(Movement, {
        velocity: { x: vx, y: vy },
        gravity,
        gravityDirection: { x: 0, y: 1 },
        drag,
        friction: 0,
        maxSpeed: 1e6,
        mass: 1,
      });
    }

    this._particles.push({ entity: particle, age: 0, lifetime, fadeOut, shrink, spin, baseWidth: size, baseHeight: size });
    this.onParticleSpawn?.(entity, particle, engine);
  }
}
