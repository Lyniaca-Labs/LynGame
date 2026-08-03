// ButtonHover
// Generic hover-grow feedback for plain rect+text menu/nav buttons (menu,
// tutorial, card directory, gameover) — the card/perk/shop-offer tiles
// already get their own richer hover treatment via CardVisuals.js's
// animateCardScale; this is the same "grow slightly, ease out" idea trimmed
// down for a button with no nested children to scale. Consumed by
// ButtonHoverEnter.js/ButtonHoverExit.js (own files, same reason
// HandCardHoverEnter.js/Exit.js are separate from BattleController.js —
// engine.callScript resolves a script by matching the *file's* name, not
// any export inside it, so the actual onHoverEnter/onHoverExit targets each
// need their own file).

export const HOVER_SCALE = 1.045;
const DURATION = 0.12;

export function animateButtonHover(entity, scale) {
  const anim = entity.getComponent("Animator");
  const sr = entity.getComponent("ShapeRenderer");
  const tr = entity.getComponent("TextRenderer");
  if (!anim) return;

  // Base size cached on first hover — not read from JSON up front so this
  // stays correct even if a button's rest size is itself being animated
  // elsewhere (none currently are, but costs nothing to be safe).
  if (entity.state.buttonBaseWidth == null && sr) entity.state.buttonBaseWidth = sr.width;
  if (entity.state.buttonBaseHeight == null && sr) entity.state.buttonBaseHeight = sr.height;
  if (entity.state.buttonBaseFontSize == null && tr) entity.state.buttonBaseFontSize = tr.fontSize;

  const opts = { duration: DURATION, easing: "easeOut" };
  if (sr && entity.state.buttonBaseWidth != null) anim.animate(sr, "width", entity.state.buttonBaseWidth * scale, opts);
  if (sr && entity.state.buttonBaseHeight != null) anim.animate(sr, "height", entity.state.buttonBaseHeight * scale, opts);
  if (tr && entity.state.buttonBaseFontSize != null) anim.animate(tr, "fontSize", entity.state.buttonBaseFontSize * scale, opts);
}

// Matching no-op export — lets this file live in scripts/ and be imported
// by name like every other script/helper file (see SoundEffects.js).
export function ButtonHover() {}
