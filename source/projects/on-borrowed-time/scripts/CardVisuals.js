// CardVisuals
// Shared visual helpers for any entity instantiated from the Card prefab
// (hand cards, AI-played-card visuals, shop offers, card directory) or the
// PathOption prefab (perk tiles) — both share the same child-name layout
// for the fields this touches. Real payload is animateCardScale/
// setCardScaleInstant (plain named exports); the matching no-op export
// below just lets this file live in scripts/ and be imported by name (see
// PROJECT_STRUCTURE.md#scripts-folder).

// Every child (across both prefabs) whose size/position should grow or
// shrink along with the card — cardArt/border art, icon, title/name,
// description (+ its backing box), and the level/price badge.
const SCALE_CHILDREN = ["cardArt", "icon", "name", "title", "descBg", "desc", "badge", "badgeText", "levelIcon"];

// Snapshots every field scaleFields touches at its true 1x size, the first
// time this entity is ever scaled — cached on entity.state so every later
// call, no matter how often or how fast it re-fires, always computes an
// ABSOLUTE target (base * targetScale) instead of multiplying off whatever
// the component's live value happens to be right now (unreliable as a
// multiplication base — animate() re-triggers by tweening from the
// component's *current*, possibly still mid-tween, not-yet-arrived value).
//
// Captured as the RAW live values, with no division — by construction, the
// very first call for any entity is guaranteed to see them still at their
// true prefab-default 1x size, since nothing has ever applied a scale to
// them before this point. Dividing by entity.state.cardScale here used to
// be flat-out wrong: both callers below set entity.state.cardScale to the
// NEW target *before* calling scaleFields (so baseMetrics ran), so on that
// very first call this would divide by the target being requested, not by
// "1" — base ended up as (trueValue / targetScale), and scaleFields then
// multiplied it straight back to trueValue regardless of what targetScale
// was, i.e. the FIRST scale request on any entity silently did nothing.
// Only really showed once something depended on that first call actually
// landing at a very different size (e.g. shrinking a played card straight
// to PILE_SCALE with no prior hover) — it would stay at full size instead.
function baseMetrics(ent) {
  if (ent.state.cardBaseMetrics) return ent.state.cardBaseMetrics;
  const base = { children: {} };

  const rootShape = ent.getComponent("ShapeRenderer");
  if (rootShape) base.rootShape = { width: rootShape.width, height: rootShape.height };
  const rootSprite = ent.getComponent("SpriteRenderer");
  if (rootSprite) base.rootSprite = { width: rootSprite.width, height: rootSprite.height };
  const interactable = ent.getComponent("Interactable");
  if (interactable && interactable.width && interactable.height) {
    base.interactable = { width: interactable.width, height: interactable.height };
  }

  for (const name of SCALE_CHILDREN) {
    const child = ent.getChild(name);
    if (!child) continue;
    const entry = {};
    const t = child.getComponent("Transform");
    if (t) entry.t = { x: t.x, y: t.y };
    const sr = child.getComponent("ShapeRenderer");
    if (sr) entry.sr = { width: sr.width, height: sr.height };
    const spr = child.getComponent("SpriteRenderer");
    if (spr) entry.spr = { width: spr.width, height: spr.height };
    const tr = child.getComponent("TextRenderer");
    if (tr) entry.tr = { fontSize: tr.fontSize, maxWidth: tr.maxWidth, maxHeight: tr.maxHeight };
    base.children[name] = entry;
  }

  ent.state.cardBaseMetrics = base;
  return base;
}

// Walks every field that scales with a card (root art, its hit area, and
// every named child's offset/renderer size/font size) and hands each one's
// ABSOLUTE target value (base * targetScale) to `apply(component, field,
// newValue)` — animateCardScale animates each via the entity's Animator,
// setCardScaleInstant just assigns directly.
function scaleFields(ent, targetScale, apply) {
  const base = baseMetrics(ent);

  const rootShape = ent.getComponent("ShapeRenderer");
  if (rootShape && base.rootShape) {
    apply(rootShape, "width", base.rootShape.width * targetScale);
    apply(rootShape, "height", base.rootShape.height * targetScale);
  }
  const rootSprite = ent.getComponent("SpriteRenderer");
  if (rootSprite && base.rootSprite) {
    apply(rootSprite, "width", base.rootSprite.width * targetScale);
    apply(rootSprite, "height", base.rootSprite.height * targetScale);
  }
  // Interactable._getBoxWorld() only falls back to the renderer's own
  // dimensions when width/height are left at 0 (see Interactable.js) — the
  // Card prefab does that, so its hit area already tracks the grow/shrink
  // automatically. PathOption sets explicit width/height instead, so those
  // need to be scaled too or the hitbox would stay put while the art grows.
  const interactable = ent.getComponent("Interactable");
  if (interactable && base.interactable) {
    apply(interactable, "width", base.interactable.width * targetScale);
    apply(interactable, "height", base.interactable.height * targetScale);
  }

  for (const name of SCALE_CHILDREN) {
    const child = ent.getChild(name);
    const entry = base.children[name];
    if (!child || !entry) continue;
    const t = child.getComponent("Transform");
    if (t && entry.t) {
      apply(t, "x", entry.t.x * targetScale);
      apply(t, "y", entry.t.y * targetScale);
    }
    const sr = child.getComponent("ShapeRenderer");
    if (sr && entry.sr) {
      apply(sr, "width", entry.sr.width * targetScale);
      apply(sr, "height", entry.sr.height * targetScale);
    }
    const spr = child.getComponent("SpriteRenderer");
    if (spr && entry.spr) {
      apply(spr, "width", entry.spr.width * targetScale);
      apply(spr, "height", entry.spr.height * targetScale);
    }
    const tr = child.getComponent("TextRenderer");
    if (tr && entry.tr) {
      apply(tr, "fontSize", Math.max(6, entry.tr.fontSize * targetScale));
      if (entry.tr.maxWidth) apply(tr, "maxWidth", entry.tr.maxWidth * targetScale);
      if (entry.tr.maxHeight) apply(tr, "maxHeight", entry.tr.maxHeight * targetScale);
    }
  }
}

// Grows or shrinks a card (and its text) around its own center, to an
// absolute scale relative to its true 1x size (see baseMetrics above) — so
// repeated/rapid hover in/out cycles land exactly on target every time
// instead of drifting. Animated via the entity's own Animator, same as
// every other card tween in this project.
export function animateCardScale(ent, targetScale, duration = 0.15) {
  const anim = ent.getComponent("Animator");
  if (!anim) return;
  if ((ent.state.cardScale || 1) === targetScale) return;
  ent.state.cardScale = targetScale;
  const opts = { duration, easing: "easeOut" };
  scaleFields(ent, targetScale, (comp, field, val) => anim.animate(comp, field, val, opts));
}

// Same math as animateCardScale but applied immediately with no tween — for
// setting a freshly-spawned card's resting size (e.g. the card directory's
// shrunk-to-fit grid) without a visible snap/animation on scene load.
export function setCardScaleInstant(ent, targetScale) {
  if ((ent.state.cardScale || 1) === targetScale) return;
  ent.state.cardScale = targetScale;
  scaleFields(ent, targetScale, (comp, field, val) => { comp[field] = val; });
}

// Every child has a FIXED zIndex in the Card prefab (500-505) meant only to
// keep a card's own parts above its own background — fine when card
// instances don't overlap, but once two cards' bounds DO overlap (the play
// pile, or a hovered/enlarged card overhanging its neighbor), those shared
// absolute values interleave between different cards' parts instead of each
// card layering as one coherent unit. setCardZIndex rebases one instance's
// children onto that instance's own root zIndex so the whole card — root
// and children together — moves as a unit in draw order.
export const CARD_CHILD_Z_OFFSETS = { cardArt: -1, descBg: 0, icon: 1, name: 2, desc: 3, badge: 4, badgeText: 5, levelIcon: 4 };

export function setCardZIndex(ent, baseZIndex) {
  const t = ent.getComponent("Transform");
  if (t) t.zIndex = baseZIndex;
  for (const [name, offset] of Object.entries(CARD_CHILD_Z_OFFSETS)) {
    const child = ent.getChild(name);
    const ct = child && child.getComponent("Transform");
    if (ct) ct.zIndex = baseZIndex + offset;
  }
}

export function CardVisuals() {}
