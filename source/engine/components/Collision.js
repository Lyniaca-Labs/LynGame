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
    includeChildren: {
      type: "boolean", default: false,
      description: "Treat direct children's own Collision components as part of this rigid body: resolution uses THIS entity's resolve/isStatic, mass is summed across this entity + every direct child that has a Collision component, and the resulting push/bounce is applied to this entity's Transform/Movement instead of the child's.",
    },
    shape: {
      type: "select", default: "auto",
      description: "Collision shape. \"auto\" derives from this entity's ShapeRenderer (falls back to rect if there isn't one, or it's not a circle). \"none\" means no hitbox of its own — for use with includeChildren, to contribute mass/resolve/isStatic to the group without a shape.",
      options: [
        { value: "auto", label: "Auto (from ShapeRenderer)" },
        { value: "rect", label: "Rectangle" },
        { value: "circle", label: "Circle" },
        { value: "none", label: "None (no hitbox)" },
      ],
    },
    width: { type: "number", default: 0, description: "Hitbox width (diameter, for circles). 0 = derive from SpriteRenderer/ShapeRenderer/TextRenderer size." },
    height: { type: "number", default: 0, description: "Hitbox height. Ignored for circles (width is the diameter). 0 = derive from renderer size." },
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

  _resolvedShape(entity) {
    if (this.shape !== "auto") return this.shape;
    return entity.getComponent("ShapeRenderer")?.shape === "circle" ? "circle" : "rect";
  }

  _resolvedWidth(entity) {
    if (this.width) return this.width;
    return entity.getDimensions().width;
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

  _circleWorld(entity, transform) {
    return {
      cx: transform.x + this.offsetX,
      cy: transform.y + this.offsetY,
      radius: this._resolvedWidth(entity) / 2,
    };
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

    const shapeA = a._resolvedShape(entityA);
    const shapeB = b._resolvedShape(entityB);
    if (shapeA === "none" || shapeB === "none") return; // no hitbox of its own

    // manifold.nx/ny always points in the direction entityA should move to
    // separate from entityB (entityB moves along the opposite vector).
    let manifold;
    if (shapeA === "circle" && shapeB === "circle") {
      manifold = Collision._circleCircle(a._circleWorld(entityA, ta), b._circleWorld(entityB, tb));
    } else if (shapeA === "circle") {
      manifold = Collision._circleRect(a._circleWorld(entityA, ta), b._boxWorld(entityB, tb));
    } else if (shapeB === "circle") {
      const m = Collision._circleRect(b._circleWorld(entityB, tb), a._boxWorld(entityA, ta));
      manifold = m && { nx: -m.nx, ny: -m.ny, depth: m.depth };
    } else {
      manifold = Collision._rectRect(a._boxWorld(entityA, ta), b._boxWorld(entityB, tb));
    }

    if (!manifold) return; // no overlap

    a.onCollide?.(entityA, entityB, engine);
    b.onCollide?.(entityB, entityA, engine);

    const bodyA = Collision._body(entityA, a);
    const bodyB = Collision._body(entityB, b);
    if (!bodyA.resolve && !bodyB.resolve) return;
    Collision._resolve(bodyA, bodyB, manifold);
  }

  // Resolves which entity/physics-values actually govern resolution for a
  // given collider: normally itself, but if its direct parent has
  // includeChildren set, resolution redirects to the parent — one level up
  // only, no recursive/grandchild absorption (see design doc).
  static _body(entity, collision) {
    const parentCollision = entity.parent?.getComponent("Collision");
    if (parentCollision?.includeChildren) {
      return {
        transformEntity: entity.parent,
        resolve: parentCollision.resolve,
        isStatic: parentCollision.isStatic,
        mass: Collision._compoundMass(entity.parent, parentCollision),
      };
    }
    // This entity IS a compound root hit via its own hitbox (not a child
    // delegating up) — still use the full compound mass, not just its own,
    // so the rigid body weighs the same regardless of which part got hit.
    if (collision.includeChildren) {
      return { transformEntity: entity, resolve: collision.resolve, isStatic: collision.isStatic, mass: Collision._compoundMass(entity, collision) };
    }
    return { transformEntity: entity, resolve: collision.resolve, isStatic: collision.isStatic, mass: collision.mass };
  }

  // Total rigid-body mass for a compound: the parent's own mass (always
  // counted, even with shape: "none") plus every direct child's mass that
  // itself carries a Collision component.
  static _compoundMass(parent, parentCollision) {
    let total = parentCollision.mass;
    for (const child of parent.children) {
      const childCollision = child.getComponent("Collision");
      if (childCollision) total += childCollision.mass;
    }
    return total;
  }

  // Axis-aligned box vs box: overlap on both axes, push apart along whichever
  // axis has the smaller penetration (standard AABB minimum-translation-vector).
  static _rectRect(boxA, boxB) {
    const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
    const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
    if (overlapX <= 0 || overlapY <= 0) return null;

    const acx = (boxA.left + boxA.right) / 2;
    const acy = (boxA.top + boxA.bottom) / 2;
    const bcx = (boxB.left + boxB.right) / 2;
    const bcy = (boxB.top + boxB.bottom) / 2;

    if (overlapX < overlapY) {
      return { nx: acx < bcx ? -1 : 1, ny: 0, depth: overlapX };
    }
    return { nx: 0, ny: acy < bcy ? -1 : 1, depth: overlapY };
  }

  // Circle vs circle: overlap when center distance < sum of radii. The
  // separating normal is simply the direction between the two centers —
  // this is what plain AABB math gets wrong for circles (it separates along
  // whichever world axis has less box overlap, not along the actual line
  // between the two centers, so diagonally-touching circles either fail to
  // separate or get shoved in the wrong direction).
  static _circleCircle(circleA, circleB) {
    const dx = circleA.cx - circleB.cx;
    const dy = circleA.cy - circleB.cy;
    const dist = Math.hypot(dx, dy);
    const radiusSum = circleA.radius + circleB.radius;
    if (dist >= radiusSum) return null;

    if (dist === 0) {
      // Exactly coincident centers — no meaningful direction, pick one.
      return { nx: 1, ny: 0, depth: radiusSum };
    }
    return { nx: dx / dist, ny: dy / dist, depth: radiusSum - dist };
  }

  // Circle vs axis-aligned box: find the closest point on the box to the
  // circle's center, then treat the distance from that point to the center
  // as the effective gap. If the center is INSIDE the box (closest point
  // distance is 0, so there's no direction to push along), fall back to
  // pushing out through whichever box edge is nearest — same idea as
  // _rectRect's axis-of-minimum-penetration.
  static _circleRect(circle, box) {
    const closestX = Math.min(Math.max(circle.cx, box.left), box.right);
    const closestY = Math.min(Math.max(circle.cy, box.top), box.bottom);
    const dx = circle.cx - closestX;
    const dy = circle.cy - closestY;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      if (dist >= circle.radius) return null;
      return { nx: dx / dist, ny: dy / dist, depth: circle.radius - dist };
    }

    const overlapLeft = circle.cx - box.left;
    const overlapRight = box.right - circle.cx;
    const overlapTop = circle.cy - box.top;
    const overlapBottom = box.bottom - circle.cy;
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft) return { nx: -1, ny: 0, depth: overlapLeft + circle.radius };
    if (minOverlap === overlapRight) return { nx: 1, ny: 0, depth: overlapRight + circle.radius };
    if (minOverlap === overlapTop) return { nx: 0, ny: -1, depth: overlapTop + circle.radius };
    return { nx: 0, ny: 1, depth: overlapBottom + circle.radius };
  }

  static _resolve(bodyA, bodyB, manifold) {
    // Two colliders that both redirect to the same compound parent (e.g.
    // two wheels on the same car overlapping each other) can't meaningfully
    // resolve against themselves.
    if (bodyA.transformEntity === bodyB.transformEntity) return;

    // A body is only moved by resolution if it opted in (resolve: true)
    // AND isn't pinned (isStatic: false). Either flag alone is enough to
    // keep it fully immovable — including its velocity (see _applyBounce
    // below), not just its position, so it can't drift on a later frame.
    const movableA = bodyA.resolve && !bodyA.isStatic;
    const movableB = bodyB.resolve && !bodyB.isStatic;
    const invMassA = movableA ? 1 / bodyA.mass : 0;
    const invMassB = movableB ? 1 / bodyB.mass : 0;
    const totalInvMass = invMassA + invMassB;
    if (totalInvMass === 0) return; // neither side can move

    const shareA = invMassA / totalInvMass;
    const shareB = invMassB / totalInvMass;

    const transformA = bodyA.transformEntity.getComponent("Transform");
    const transformB = bodyB.transformEntity.getComponent("Transform");
    if (!transformA || !transformB) return;

    const { nx, ny, depth } = manifold;
    transformA.x += nx * depth * shareA;
    transformA.y += ny * depth * shareA;
    transformB.x -= nx * depth * shareB;
    transformB.y -= ny * depth * shareB;

    if (movableA) Collision._applyBounce(bodyA.transformEntity, nx, ny);
    if (movableB) Collision._applyBounce(bodyB.transformEntity, -nx, -ny);
  }

  // After separation along normal (nx, ny) — already pointing away from the
  // other entity — reflect velocity across that normal if it was still
  // heading into the other entity, scaled by Movement's existing bounce.
  // Full vector reflection (not just one axis) since circle-collision
  // normals aren't generally axis-aligned: v' = v - (1+bounce)*(v·n)*n.
  static _applyBounce(entity, nx, ny) {
    const movement = entity.getComponent("Movement");
    if (!movement) return;
    const vx = movement.velocity.x;
    const vy = movement.velocity.y;
    const vDotN = vx * nx + vy * ny;
    if (vDotN >= 0) return; // already separating along the normal
    const scale = (1 + movement.bounce) * vDotN;
    movement.velocity.x = vx - scale * nx;
    movement.velocity.y = vy - scale * ny;
  }
}
