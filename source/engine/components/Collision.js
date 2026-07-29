import { Component } from "../types/Component.js";

// Same duplicated-per-file pattern Interactable.js uses — no shared compile
// utility exists yet in this codebase, and introducing one is out of scope here.
const _compiledCodeCache = new Map();
function compileCode(code, paramNames = ["entity", "other", "engine"]) {
  if (code == null || typeof code === "function") return code ?? null;
  if (typeof code !== "string") return null;

  const cacheKey = paramNames.join(",") + "|" + code;
  const cached = _compiledCodeCache.get(cacheKey);
  if (cached) return cached;

  let fn;
  try {
    fn = new Function(...paramNames, code);
  } catch (err) {
    console.error("Collision: failed to compile onCollide code:", code, err);
    fn = null;
  }
  _compiledCodeCache.set(cacheKey, fn);
  return fn;
}

export class Collision extends Component {
  static schema = {
    group: { type: "string", default: "default", description: "What this entity IS, for group-filtering." },
    collidesWith: { type: "string", default: "", description: "Comma-separated groups this entity interacts with, e.g. \"enemy,wall\"." },
    resolve: { type: "boolean", default: false, description: "If true, overlaps are physically resolved (pushed apart). If false, detection-only (trigger)." },
    isStatic: { type: "boolean", default: false, description: "Infinite mass — never moved by resolution; the other side absorbs 100% of the push." },
    mass: { type: "number", default: 1, description: "Used for the push-apart ratio between two dynamic bodies." },
    width: { type: "number", default: 0, description: "Hitbox width. 0 = derive from SpriteRenderer/ShapeRenderer/TextRenderer size." },
    height: { type: "number", default: 0, description: "Hitbox height. 0 = derive from renderer size." },
    offsetX: { type: "number", default: 0, description: "Horizontal offset of the hitbox from the entity's position." },
    offsetY: { type: "number", default: 0, description: "Vertical offset of the hitbox from the entity's position." },
    onCollide: { type: "code", default: null, description: "Runs on every frame two entities overlap. Signature: (entity, other, engine)." },
  };

  constructor(overrides = {}) {
    super(overrides);
    this.onCollide = compileCode(overrides.onCollide);
  }

  _wantsGroup(otherGroup) {
    return this.collidesWith
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean)
      .includes(otherGroup);
  }

  _boxWorld(entity, transform) {
    let width = this.width;
    let height = this.height;
    if (!width || !height) {
      const dims = entity.getDimensions();
      width = width || dims.width;
      height = height || dims.height;
    }
    const cx = transform.x + this.offsetX;
    const cy = transform.y + this.offsetY;
    return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
  }

  /**
   * Detects and (optionally) resolves overlap between two entities that both
   * carry a Collision component. Called once per unique pair per frame by
   * GameEngine._update (see index.js) — not from onTick, since pairwise
   * checks need to happen against every OTHER entity, not once per entity.
   */
  static checkPair(entityA, entityB, engine) {
    const a = entityA.getComponent("Collision");
    const b = entityB.getComponent("Collision");
    if (!a || !b) return;
    if (!a._wantsGroup(b.group) && !b._wantsGroup(a.group)) return;

    const ta = entityA.getWorldTransform(engine);
    const tb = entityB.getWorldTransform(engine);
    if (!ta || !tb) return;

    const boxA = a._boxWorld(entityA, ta);
    const boxB = b._boxWorld(entityB, tb);

    const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
    const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
    if (overlapX <= 0 || overlapY <= 0) return; // no overlap

    a.onCollide?.(entityA, entityB, engine);
    b.onCollide?.(entityB, entityA, engine);

    if (!a.resolve && !b.resolve) return;
    Collision._resolve(entityA, entityB, ta, tb, a, b, overlapX, overlapY);
  }

  static _resolve(entityA, entityB, ta, tb, a, b, overlapX, overlapY) {
    const invMassA = a.isStatic ? 0 : 1 / a.mass;
    const invMassB = b.isStatic ? 0 : 1 / b.mass;
    const totalInvMass = invMassA + invMassB;
    if (totalInvMass === 0) return; // both static — nothing can move

    const shareA = invMassA / totalInvMass;
    const shareB = invMassB / totalInvMass;

    const transformA = entityA.getComponent("Transform");
    const transformB = entityB.getComponent("Transform");
    if (!transformA || !transformB) return;

    // Push apart along the axis of minimum penetration (standard AABB MTV).
    if (overlapX < overlapY) {
      const dir = ta.x < tb.x ? -1 : 1; // A moves this direction relative to B
      transformA.x += dir * overlapX * shareA;
      transformB.x -= dir * overlapX * shareB;
      Collision._applyBounce(entityA, "x", dir);
      Collision._applyBounce(entityB, "x", -dir);
    } else {
      const dir = ta.y < tb.y ? -1 : 1;
      transformA.y += dir * overlapY * shareA;
      transformB.y -= dir * overlapY * shareB;
      Collision._applyBounce(entityA, "y", dir);
      Collision._applyBounce(entityB, "y", -dir);
    }
  }

  // After a push in `axis` direction `pushDir` (the direction this entity was
  // moved to separate), reflect velocity if it was still heading INTO the
  // other entity (opposite of pushDir), scaled by Movement's existing bounce.
  static _applyBounce(entity, axis, pushDir) {
    const movement = entity.getComponent("Movement");
    if (!movement) return;
    const v = movement.velocity[axis];
    if (Math.sign(v) !== 0 && Math.sign(v) !== Math.sign(pushDir)) {
      movement.velocity[axis] = -v * movement.bounce;
    }
  }
}
