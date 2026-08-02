// BattleController
// Attached to the "controller" entity in scenes/main.json. Owns the whole
// battle state machine (engine.state.battle) — live shot-clock draining,
// turn switching, AI decisions, hand drawing/discarding, HUD, and juice.
// Also exports playCard/drawHand/etc for PlayHandCard.js (the per-card
// click handler) to call into.

import { CARD_DEFS, AI_POOL, formatDescription, levelScale, borderFrameForTier, levelIconFrame, cardIconOverride, MAX_CARD_LEVEL } from "./CardDatabase.js";
import { ensureRun, addCurrency } from "./RunState.js";
import { recordRunEnd } from "./MetaState.js";
import { resolveEffects, MAX_TIME_REDUCTION_FLOOR_FRACTION } from "./CardEffects.js";
import { playSound, playCoinBurst, clickThenLoadScene } from "./SoundEffects.js";
import { animateCardScale, setCardScaleInstant, setCardZIndex } from "./CardVisuals.js";

const BASE_MAX_TIME = 10;
const BASE_HAND_SIZE = 3;
const MAX_HAND_SIZE = 4; // Haste/Purge (handSize effects) can push the next hand's size up or down, clamped to this range
const BASE_REGEN = 1; // passive time regained after your own turn — cards (Second Wind / Exhaust) are the real lever
const DRAIN_RATE = 1; // seconds of your own time burned per real second deciding, before the intensity ramp
const INTENSITY_RAMP = 0.035; // +3.5% drain speed per second the round has been going — the fight gets faster the longer it drags on
const MIN_ROUND_REWARD = 10; // coins guaranteed on a win, even with little leftover time — was 15, which (plus ROUND_REWARD_PER_ROUND) pushed early rewards well past the intended ~10-18 range
const ROUND_REWARD_PER_ROUND = 0.5; // extra coins per round on top of the base/leftover-time reward — gentler than before (was 2) so it stays in the ~10-18 range for a long stretch instead of blowing past 18 by round 2
const BAR_HEIGHT = 260;
const BAR_WIDTH = 24;
const HUD_MARGIN = 130; // px in from each screen edge for the bars/labels
const HAND_DISCARD_DURATION = 0.42; // fall-away animation length for unplayed cards
const BG_BASE_X = 2000; // must match the "bg" entity's Transform in scenes/main.json
const BG_BASE_Y = 2000;
const TABLE_Y_EXTRA_OFFSET = 30; // nudges the table background down a bit further than the pile center it's otherwise aligned to
const TENSION_RAMP_FOR_MAX = 0.5; // pace reaching +50% is "fully" tense — zoom maxed out
const TENSION_MAX_ZOOM = 0.12; // bars grow up to 12% larger at max tension (no real camera zoom — see updateShake's note)
const REGEN_PREVIEW_COLOR = "rgba(74, 222, 128, 0.35)";
const SHIELD_PREVIEW_COLOR = "rgba(96, 165, 250, 0.55)"; // was 0.3 — bumped per feedback that it was too faint to read at a glance

// ---------- small utils ----------

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const REFLECT_DECAY_PER_TURN = 1; // stacks lost per turn-end tick, both sides (Reflect — CardEffects.js)

function freshStats(maxTime, regen) {
  // shieldRetain: fraction of current shield KEPT at each turn-end decay
  // tick (resolveTurnEnd) — defaults to losing half each turn; Anchor/
  // Corrode (CardDatabase.js) are the only levers on it.
  // poison: flat seconds burned at every turn-end (Borrowed Time).
  // timelessReduction: 0-1 fraction of pace's speed-up this side's drain
  // ignores (Timeless) — see the phase-drain code in BattleController.
  // reflect: decaying stacks (Reflect) — each bounces a slice of incoming
  // damage back at the attacker (CardEffects.js's "currentTime" case).
  // baseMaxTime: this side's STARTING max time, kept immutable — CardEffects.js's
  // "maxTime" case floors Time Steal-style reductions at a fraction of this
  // instead of an absolute 1s, so repeated casts can't crush maxTime (and by
  // extension currentTime, which clamps down with it) to near-zero.
  return {
    maxTime, currentTime: maxTime, regen, shield: 0, drainMult: 1, nextHandBonus: 0,
    shieldRetain: 0.5, poison: 0, timelessReduction: 0, reflect: 0, baseMaxTime: maxTime,
  };
}

function intensityMultiplier(b) {
  return 1 + b.roundElapsed * INTENSITY_RAMP;
}

// Pace multiplier as `stats`' own drain actually feels it — Timeless
// (timelessReduction, 0-1) shrinks how much of the ramp ABOVE baseline (1x)
// applies, same shape as tickIntensity's TICK_RAMP_FACTOR dampening below,
// rather than snapping the whole multiplier back to a flat 1 the instant
// any reduction is present.
function pacedMultiplier(b, stats) {
  const intensity = intensityMultiplier(b);
  return 1 + (intensity - 1) * (1 - (stats.timelessReduction || 0));
}

const BASE_TICK_INTERVAL = 1; // seconds between clock ticks at baseline pace
const TICK_RAMP_FACTOR = 0.35; // ticking speeds up more gently than the rest of the pace ramp (intensityMultiplier) does
const TICK_VOLUME = 0.04; // was 0.45, then 0.12 — still too loud both times
const TICK_FADE_DURATION = 1; // seconds to fade ticking out once the round ends (roundOver phase)

function tickIntensity(b) {
  return 1 + (intensityMultiplier(b) - 1) * TICK_RAMP_FACTOR;
}

// A background clock-tick, ticking faster as pace climbs — dampened version
// of intensityMultiplier(b) so it doesn't ramp as aggressively as the
// drain rate/screen tension do. `fadeT` (1 = full volume, 0 = silent) lets
// the roundOver phase taper it out instead of cutting it off abruptly —
// b.roundElapsed is frozen once roundOver starts, so the tick rate itself
// naturally holds steady during the fade rather than continuing to speed up.
function updateClockTick(engine, b, dt, fadeT = 1) {
  if (fadeT <= 0) return;
  b.tickTimer = (b.tickTimer || 0) + dt;
  const interval = BASE_TICK_INTERVAL / tickIntensity(b);
  if (b.tickTimer >= interval) {
    b.tickTimer -= interval;
    playSound(engine, "tick", { volume: TICK_VOLUME * fadeT });
  }
}

function barColor(ratio) {
  if (ratio > 0.5) return "#33d17a";
  if (ratio > 0.25) return "#e8b339";
  return "#e0473f";
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// Low-time urgency cue — once a side's fill ratio drops into the critical
// zone, the fill pulses toward white on a sine wave driven by
// b.roundElapsed (already ticked every frame, so no extra per-bar timer
// state is needed) instead of just sitting at a flat "about to lose" red.
const CRITICAL_TIME_RATIO = 0.15;
const CRITICAL_PULSE_SPEED = 6; // radians/sec

function pulsingBarColor(ratio, roundElapsed) {
  const base = barColor(ratio);
  if (ratio > CRITICAL_TIME_RATIO || ratio <= 0) return base;
  const pulse = (Math.sin(roundElapsed * CRITICAL_PULSE_SPEED) + 1) / 2; // 0..1
  return lerpColor(base, "#ffffff", pulse * 0.55);
}

function setShape(engine, id, x, y, w, h, color, rotation = 0) {
  const e = engine.getEntity(id);
  if (!e) return;
  const t = e.getComponent("Transform");
  const s = e.getComponent("ShapeRenderer");
  if (t) { t.x = x; t.y = y; t.rotation = rotation; }
  if (s) { s.width = w; s.height = h; if (color) s.color = color; }
}

// bar.png's barleft/barmiddle/barright pieces are drawn horizontal
// natively (width = length along the bar, height = thickness) — each
// border-piece entity has a fixed 90deg rotation baked into its Transform
// (main.json) so setting SpriteRenderer.width/height in that same
// pre-rotation sense (width = length, height = thickness) reorients them
// to run vertically: barleft's rounded cap ends up on top, barright's on
// the bottom (a 90deg clockwise rotation turns "left-facing" into
// "up-facing" and "right-facing" into "down-facing" in a y-down canvas).
const BAR_BORDER_MID_COUNT = 6;

function setBarPiece(engine, id, x, y, length, thickness) {
  const e = engine.getEntity(id);
  if (!e) return;
  const t = e.getComponent("Transform");
  const s = e.getComponent("SpriteRenderer");
  if (t) { t.x = x; t.y = y; }
  if (s) { s.width = length; s.height = thickness; }
}

function layoutBarBorder(engine, prefix, x, midY, barW, barH) {
  const thickness = barW + 8;
  const totalLength = barH + 10;
  const capLen = thickness; // square caps so the rounded art isn't stretched/squished
  const midSpan = Math.max(0, totalLength - capLen * 2);
  const midLen = midSpan / BAR_BORDER_MID_COUNT;

  setBarPiece(engine, `${prefix}CapTop`, x, midY - totalLength / 2 + capLen / 2, capLen, thickness);
  setBarPiece(engine, `${prefix}CapBottom`, x, midY + totalLength / 2 - capLen / 2, capLen, thickness);

  const midStartY = midY - totalLength / 2 + capLen;
  for (let i = 0; i < BAR_BORDER_MID_COUNT; i++) {
    setBarPiece(engine, `${prefix}Mid${i}`, x, midStartY + midLen * (i + 0.5), midLen, thickness);
  }
}

function setTextPos(engine, id, x, y, text) {
  const e = engine.getEntity(id);
  if (!e) return;
  const t = e.getComponent("Transform");
  const tr = e.getComponent("TextRenderer");
  if (t && x != null) { t.x = x; t.y = y; }
  if (tr && text != null) tr.text = text;
}

function setText(engine, id, text) {
  const e = engine.getEntity(id);
  const tr = e && e.getComponent("TextRenderer");
  if (tr) tr.text = text;
}

// Anchor.onTick (engine core) recomputes this entity's Transform.x/y from
// its own offsetX/offsetY every frame, so mutating those directly (instead
// of Transform.x/y, which Anchor would just overwrite next tick) is how
// screen shake reaches an Anchor-driven HUD label. baseX/baseY must match
// the entity's Anchor offsets in scenes/main.json.
function setAnchorShake(engine, id, baseX, baseY, shakeX, shakeY) {
  const e = engine.getEntity(id);
  const a = e && e.getComponent("Anchor");
  if (a) { a.offsetX = baseX + shakeX; a.offsetY = baseY + shakeY; }
}

// Effect amounts are level-scaled by quarters (LEVEL_POWER_SCALE,
// CardDatabase.js), so a base-0.25 amount (e.g. Second Wind/Exhaust's regen)
// at an off-multiple level can land on a sixteenth (e.g. 0.25 * 1.75 =
// 0.4375) — display-only numbers that skip the existing round-to-1-decimal
// treatment (shield/regen/handSize/reflect/poison below) go through this
// instead so nothing ever shows more than 3 decimal digits.
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function formatTimeLabel(stats) {
  let t = `${stats.currentTime.toFixed(1)}s/${stats.maxTime.toFixed(1)}s`;
  if (stats.shield > 0) t += `\nShield ${stats.shield.toFixed(0)}`;
  return t;
}

// ---------- HUD ----------

// The active side's projected post-turn fill (currentTime + regen, capped
// at maxTime, per resolveTurnEnd) shown as a low-opacity green sliver
// stacked directly above their current fill — only meaningful for whoever's
// turn is live right now, since that's the side about to receive regen.
function layoutRegenPreview(engine, id, isActive, stats, x, bottomY, barW, barH, currentFillH, rotation) {
  const e = engine.getEntity(id);
  if (!e) return;
  let previewH = 0, previewY = bottomY;
  if (isActive && stats.regen > 0) {
    const projected = Math.min(stats.maxTime, stats.currentTime + stats.regen);
    const projectedH = barH * clamp01(projected / stats.maxTime);
    previewH = Math.max(0, projectedH - currentFillH);
    previewY = bottomY - currentFillH - previewH / 2;
  }
  const t = e.getComponent("Transform");
  const s = e.getComponent("ShapeRenderer");
  if (t) { t.x = x; t.y = previewY; t.rotation = rotation; }
  if (s) { s.width = barW - 6; s.height = previewH; s.color = REGEN_PREVIEW_COLOR; }
}

// Current shield as a translucent blue sliver overlaying the BOTTOM of the
// bar (same origin as the fill, PoE-style energy-shield-over-life), sized
// as a fraction of maxTime same as the fill itself so the two stay in the
// same units and a full-shield reading visually matches a full health bar.
function layoutShieldPreview(engine, id, stats, x, bottomY, barW, barH, rotation) {
  const e = engine.getEntity(id);
  if (!e) return;
  const shieldFrac = clamp01(stats.shield / stats.maxTime);
  const h = barH * shieldFrac;
  const t = e.getComponent("Transform");
  const s = e.getComponent("ShapeRenderer");
  if (t) { t.x = x; t.y = bottomY - h / 2; t.rotation = rotation; }
  if (s) { s.width = barW - 2; s.height = h; s.color = SHIELD_PREVIEW_COLOR; }
}

function layoutHud(engine, b) {
  const run = engine.state.run;
  const vp = engine.getViewportSize();

  // The table background sits under the play pile (same center point
  // nextPileSlot uses below, plus a small extra downward nudge of its own)
  // — setShape doubles as a plain Transform setter here since "table" has
  // no ShapeRenderer, just a SpriteRenderer.
  setShape(engine, "table", vp.width / 2, vp.height / 2 + PILE_CENTER_Y_OFFSET + TABLE_Y_EXTRA_OFFSET, 0, 0, null);

  // Bars never move now — no shake offset, no wobble/rotation. Screen shake
  // instead perturbs the top HUD text labels below (setAnchorShake) since
  // those are the only fixed-space elements with enough visible contrast
  // for a position jolt to actually register — a uniform-color background
  // fully covering the viewport looks identical after a few px of
  // translation, which is why the previous bg-only shake wasn't visible.

  // Pace ramps INTENSITY_RAMP per second of round time (intensityMultiplier)
  // — shown as a percentage, plus a "zoom" (bars grow — there's no real
  // camera zoom since every entity here is screen-space fixed) that scales
  // up toward it, so the fight visibly closes in the longer a round drags on.
  const tensionPct = intensityMultiplier(b) - 1;
  const tensionT = clamp01(tensionPct / TENSION_RAMP_FOR_MAX);
  const zoom = 1 + tensionT * TENSION_MAX_ZOOM;
  const barW = BAR_WIDTH * zoom, barH = BAR_HEIGHT * zoom;

  const leftX = HUD_MARGIN, rightX = vp.width - HUD_MARGIN;
  const midY = vp.height / 2;
  const topY = midY - barH / 2;
  const bottomY = midY + barH / 2;

  // Sprite border (assets/bar.png — barleft/barmiddle/barright, rotated
  // 90deg so the naturally-horizontal caps become top/bottom) framing each
  // bar in place of the old flat colored rect.
  layoutBarBorder(engine, "playerBar", leftX, midY, barW, barH);
  layoutBarBorder(engine, "aiBar", rightX, midY, barW, barH);
  setShape(engine, "playerBarTrack", leftX, midY, barW, barH, "#12141c");
  setShape(engine, "aiBarTrack", rightX, midY, barW, barH, "#12141c");

  const pr = clamp01(b.player.currentTime / b.player.maxTime);
  const ar = clamp01(b.ai.currentTime / b.ai.maxTime);
  const pFillH = barH * pr;
  const aFillH = barH * ar;
  setShape(engine, "playerBarFill", leftX, bottomY - pFillH / 2, barW - 6, pFillH, pulsingBarColor(pr, b.roundElapsed));
  setShape(engine, "aiBarFill", rightX, bottomY - aFillH / 2, barW - 6, aFillH, pulsingBarColor(ar, b.roundElapsed));

  layoutShieldPreview(engine, "playerShieldPreview", b.player, leftX, bottomY, barW, barH, 0);
  layoutShieldPreview(engine, "aiShieldPreview", b.ai, rightX, bottomY, barW, barH, 0);

  layoutRegenPreview(engine, "playerBarPreview", b.turn === "player", b.player, leftX, bottomY, barW, barH, pFillH, 0);
  layoutRegenPreview(engine, "aiBarPreview", b.turn === "ai", b.ai, rightX, bottomY, barW, barH, aFillH, 0);

  setTextPos(engine, "playerNameLabel", leftX, topY - 34, "YOU");
  setTextPos(engine, "aiNameLabel", rightX, topY - 34, "ENEMY");
  setTextPos(engine, "playerTimeLabel", leftX, topY + 24, formatTimeLabel(b.player));
  setTextPos(engine, "aiTimeLabel", rightX, topY + 24, formatTimeLabel(b.ai));

  if (run) {
    setText(engine, "roundLabelValue", `Round ${run.round}`);
    setText(engine, "currencyLabelValue", `Coins: ${run.currency}`);
  }
  setText(engine, "intensityLabelValue", `Pace: +${Math.round(tensionPct * 100)}%`);

  const shakeX = b.shake ? b.shake.x : 0, shakeY = b.shake ? b.shake.y : 0;
  setAnchorShake(engine, "roundLabelValue", 16, 14, shakeX, shakeY);
  setAnchorShake(engine, "currencyLabelValue", -70, 14, shakeX, shakeY);
  setAnchorShake(engine, "intensityLabelValue", 70, 14, shakeX, shakeY);
  setAnchorShake(engine, "turnBanner", 0, 46, shakeX, shakeY);
}

// 3-2-1-GO! intro countdown — each step gets its own punchy pop-and-fade on
// the dedicated "introCountdown" HUD entity (scenes/main.json), separate
// from turnBanner (which showBanner already uses for "Round N — Fight!" up
// top at the same time) so the two don't fight over one entity's tween.
const INTRO_STEP_DURATION = 0.6;
const INTRO_STEPS = ["3", "2", "1", "GO!"];
const INTRO_DURATION = INTRO_STEPS.length * INTRO_STEP_DURATION;
const INTRO_BASE_FONT_SIZE = 72;

function showIntroStep(engine, text) {
  const e = engine.getEntity("introCountdown");
  const tr = e && e.getComponent("TextRenderer");
  const anim = e && e.getComponent("Animator");
  const op = e && e.getComponent("Opacity");
  if (!tr || !anim || !op) return;
  tr.text = text;
  tr.fontSize = INTRO_BASE_FONT_SIZE * 1.5;
  op.value = 1;
  anim.animate(tr, "fontSize", INTRO_BASE_FONT_SIZE, { duration: 0.18, easing: "easeOut" });
  anim.animate(op, "value", 0, { duration: INTRO_STEP_DURATION - 0.05, easing: "easeIn" });
}

function showBanner(engine, text) {
  const e = engine.getEntity("turnBanner");
  if (!e) return;
  const tr = e.getComponent("TextRenderer");
  const anim = e.getComponent("Animator");
  const op = e.getComponent("Opacity");
  if (tr) tr.text = text;
  if (op) op.value = 1;
  if (anim && op) anim.animate(op, "value", 0, { duration: 1.6, easing: "easeIn" });
}

function setPauseOverlay(engine, visible) {
  const overlay = engine.getEntity("pauseOverlay");
  const overlayOp = overlay && overlay.getComponent("Opacity");
  if (overlayOp) overlayOp.value = visible ? 1 : 0;
  const text = engine.getEntity("pauseText");
  const textOp = text && text.getComponent("Opacity");
  if (textOp) textOp.value = visible ? 1 : 0;

  const btn = engine.getEntity("pauseDirectoryBtn");
  const btnOp = btn && btn.getComponent("Opacity");
  if (btnOp) btnOp.value = visible ? 1 : 0;
  const btnInteract = btn && btn.getComponent("Interactable");
  if (btnInteract) {
    // Interactable hit-testing isn't gated by Opacity (see Interactable.js)
    // — clear onClick while hidden too, or it'd stay clickable through the
    // invisible button whenever the cursor happens to sit over that spot.
    // A raw string here (the old value) is never compiled into a callable —
    // that only happens for onClick set via the Interactable constructor
    // (see Interactable.js's compileCode) — so this assigns openFromPause
    // directly instead; its (entity, engine) signature already matches.
    btnInteract.onClick = visible ? openFromPause : null;
    btnInteract.cursor = visible ? "pointer" : "default";
  }
}

// Assigned directly as the pause menu's "Card Directory" button's onClick
// (see setPauseOverlay above). b.paused stays true across the trip —
// engine.state.battle survives
// loadScene() (see RunState.js's header comment), so returning here via
// carddirectory's Back button lands right back in the still-paused fight.
export function openFromPause(entity, engine) {
  engine.state.cardDirectoryReturn = "main";
  clickThenLoadScene(engine, "carddirectory");
}

function impact(engine, side) {
  const id = side === "player" ? "playerImpactEmitter" : "aiImpactEmitter";
  engine.query(`${id}:Emitter`)?.trigger();
}

// Distinct blue radial "spark" burst — fired instead of/alongside impact()
// when a hit is (partially or fully) absorbed by shield, so a blocked hit
// reads visually differently from one that actually landed on health.
function shieldHit(engine, side) {
  const id = side === "player" ? "playerShieldHitEmitter" : "aiShieldHitEmitter";
  engine.query(`${id}:Emitter`)?.trigger();
}

function spawnFloatText(engine, x, y, text, color) {
  const id = `fx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  const e = engine.createEntity(id);
  if (!e) return;
  e.addComponent(engine.components.Transform, { x, y, fixed: true, zIndex: 900 });
  e.addComponent(engine.components.TextRenderer, { text, fontSize: 20, fontWeight: "700", color, align: "center" });
  e.addComponent(engine.components.Movement, { velocity: { x: 0, y: -55 }, friction: 0, gravity: 0, drag: 0.15 });
  e.addComponent(engine.components.Opacity, { value: 1 });
  e.addComponent(engine.components.Animator, {});
  const anim = e.getComponent("Animator");
  const op = e.getComponent("Opacity");
  anim.animate(op, "value", 0, {
    duration: 0.9, easing: "easeIn",
    onComplete: (ent, eng) => eng.removeEntity(ent.id),
  });
}

function resultSide(actorSide, target) {
  if (target === "self") return actorSide;
  return actorSide === "player" ? "ai" : "player";
}

// ---------- card-category juice (screenshake / vignette) ----------

const CATEGORY_VIGNETTE_COLOR = {
  defense: "#3b82f6", // blue — matches the shield/guard palette
  heal: "#22c55e",    // green
  utility: "#c4b5fd", // pale violet, matches Focus/Haste's palette
};

// Everything on screen is Transform.fixed (raw screen-space) — the renderer
// only applies Camera.x/y to NON-fixed entities (see ShapeRenderer.render),
// so a Camera-offset-based shake would silently animate a value nothing
// ever reads. Instead this stores a decaying random offset on b.shake;
// updateShake() ticks it down every frame and applies it directly to the
// background, and layoutHud() folds it into every bar/label position it
// already recomputes each frame, so the whole visible HUD judders together.
function startShake(b, magnitude, duration) {
  b.shake = { timer: duration, duration, magnitude, x: 0, y: 0 };
}

function updateShake(engine, b, dt) {
  const s = b.shake;
  if (!s || s.timer <= 0) return;
  s.timer -= dt;
  if (s.timer <= 0) {
    s.x = 0; s.y = 0;
  } else {
    const amt = s.magnitude * (s.timer / s.duration);
    s.x = (Math.random() * 2 - 1) * amt;
    s.y = (Math.random() * 2 - 1) * amt;
  }
  const bg = engine.getEntity("bg");
  const t = bg && bg.getComponent("Transform");
  if (t) { t.x = BG_BASE_X + s.x; t.y = BG_BASE_Y + s.y; }
}

function flashVignette(engine, colorHex, peakAlpha, inDuration, outDuration) {
  const e = engine.getEntity("vignetteOverlay");
  const shape = e && e.getComponent("ShapeRenderer");
  const op = e && e.getComponent("Opacity");
  const anim = e && e.getComponent("Animator");
  if (!shape || !op || !anim) return;
  shape.color = colorHex;
  anim.animate(op, "value", peakAlpha, {
    duration: inDuration, easing: "easeOut",
    onComplete: () => anim.animate(op, "value", 0, { duration: outDuration, easing: "easeIn" }),
  });
}

// Same overlay as flashVignette, but fades to fully opaque black and holds
// there (no auto fade-back-out) — used to fade the battle scene to black
// right before the transition into pathchoice, which fades back in from
// black on its own side (PathChoiceController.js's fadeIn).
function fadeToBlack(engine, duration) {
  const e = engine.getEntity("vignetteOverlay");
  const shape = e && e.getComponent("ShapeRenderer");
  const op = e && e.getComponent("Opacity");
  const anim = e && e.getComponent("Animator");
  if (!shape || !op || !anim) return;
  shape.color = "#000000";
  anim.animate(op, "value", 1, { duration, easing: "easeIn" });
}

// Attack cards shake the screen, scaled by the damage actually realized
// (post-shield, since `results` already reflects absorption) — a fully
// blocked hit barely shakes at all. Every other category gets a quick
// color-coded vignette pulse instead, so the feedback reads as "what kind
// of card was that" at a glance, not just "something happened."
function applyCardFx(engine, b, def, results) {
  if (def.category === "attack") {
    let dmg = 0;
    for (const r of results) {
      if (r.target === "opponent" && r.amount < 0 && (r.type === "currentTime" || r.type === "maxTime" || r.type === "trueDamage")) {
        dmg += -r.amount;
      }
    }
    if (dmg > 0) {
      const magnitude = Math.min(14, 3 + dmg * 1.6); // capped — noticeable, never disorienting
      const duration = Math.min(0.4, 0.18 + dmg * 0.02);
      startShake(b, magnitude, duration);
    }
  } else {
    const color = CATEGORY_VIGNETTE_COLOR[def.category];
    if (color) flashVignette(engine, color, 0.16, 0.15, 0.35);
  }
}

function applyResultVisuals(engine, b, results, actorSide) {
  const vp = engine.getViewportSize();
  const leftX = HUD_MARGIN, rightX = vp.width - HUD_MARGIN, midY = vp.height / 2;
  for (const r of results) {
    const side = resultSide(actorSide, r.target);
    const x = side === "player" ? leftX + 46 : rightX - 46;
    let text = null, color = "#ffffff";
    if (r.type === "currentTime") {
      // A (partially or fully) blocked hit gets its own marker regardless
      // of whether any damage also got through — otherwise a FULLY blocked
      // hit (amt rounds to 0) would show no feedback at all.
      if (r.absorbed > 0) {
        shieldHit(engine, side);
        spawnFloatText(engine, x, midY - 22, `-${Math.round(r.absorbed * 10) / 10}s Blocked`, "#60a5fa");
      }
      const amt = Math.round(r.amount * 10) / 10;
      if (amt === 0) continue;
      text = `${amt > 0 ? "+" : ""}${amt}s`;
      color = amt > 0 ? "#4ade80" : "#f87171";
      if (amt < 0) impact(engine, side);
    } else if (r.type === "trueDamage") {
      const amt = Math.round(r.amount * 10) / 10;
      if (amt === 0) continue;
      text = `${amt}s (pierce)`;
      color = "#fca5a5";
      impact(engine, side);
    } else if (r.type === "shield") {
      text = `+${round3(r.amount)} Shield`; color = "#60a5fa";
    } else if (r.type === "maxTime") {
      const amt = Math.round(r.amount * 10) / 10;
      text = `${amt >= 0 ? "+" : ""}${amt} Max`; color = "#facc15";
      if (amt < 0) impact(engine, side);
    } else if (r.type === "regen") {
      const amt = round3(r.amount);
      text = `${amt >= 0 ? "+" : ""}${amt} Regen`; color = amt >= 0 ? "#a3e635" : "#fb923c";
    } else if (r.type === "drainRate") {
      text = "Focused"; color = "#c4b5fd";
    } else if (r.type === "handSize") {
      text = `+${round3(r.amount)} Hand`; color = "#fbbf24";
    } else if (r.type === "shieldRetain") {
      text = r.amount >= 0 ? "Warded" : "Corroded"; color = r.amount >= 0 ? "#93c5fd" : "#f97316";
    } else if (r.type === "poison") {
      text = "Poisoned"; color = "#c026d3";
    } else if (r.type === "timeless") {
      text = "Timeless"; color = "#e2e8f0";
    } else if (r.type === "reflect") {
      text = `+${round3(r.amount)} Reflect`; color = "#38bdf8";
    } else if (r.type === "cleanse") {
      text = "Cleansed"; color = "#67e8f9";
    } else if (r.type === "reflectDamage") {
      const amt = Math.round(r.amount * 10) / 10;
      if (amt === 0) continue;
      text = `${amt}s Reflected`; color = "#38bdf8";
      impact(engine, side);
    }
    if (text) spawnFloatText(engine, x, midY, text, color);
  }
}

// "pace" is battle-level (b.roundElapsed, which intensityMultiplier is
// derived from), not a per-side stat, so it can't go through resolveEffects
// like the others — read straight off def.effects here instead. Affects
// both sides equally since pace is shared (Time Out).
function applyPaceEffects(engine, b, def, level, side) {
  const scale = levelScale(level);
  for (const eff of def.effects) {
    if (eff.type !== "pace") continue;
    const amt = eff.amount * scale;
    b.roundElapsed = Math.max(0, b.roundElapsed + amt);
    const vp = engine.getViewportSize();
    const x = side === "player" ? HUD_MARGIN + 46 : vp.width - HUD_MARGIN - 46;
    const shown = Math.round(Math.abs(amt) * 10) / 10;
    spawnFloatText(engine, x, vp.height / 2, `${amt <= 0 ? "-" : "+"}${shown}s Pace`, "#67e8f9");
  }
}

// Poison (Borrowed Time) — flat seconds burned off `side`'s currentTime at
// every turn-end, independent of whose turn it was. Mirrors the shield-decay
// tick just above it in resolveTurnEnd.
function tickPoison(engine, b, side) {
  const stats = side === "player" ? b.player : b.ai;
  if (!(stats.poison > 0) || stats.currentTime <= 0) return;
  stats.currentTime = Math.max(0, stats.currentTime - stats.poison);
  const vp = engine.getViewportSize();
  const x = side === "player" ? HUD_MARGIN + 46 : vp.width - HUD_MARGIN - 46;
  spawnFloatText(engine, x, vp.height / 2, `-${round3(stats.poison)}s Poison`, "#c026d3");
  impact(engine, side);
}

// Reflect stacks (Reflect — CardDatabase.js) fall off over time, same
// cadence as poison/shield decay — no visual per tick, the stack count is
// only surfaced when it's gained/spent.
function tickReflectDecay(b, side) {
  const stats = side === "player" ? b.player : b.ai;
  if (stats.reflect > 0) stats.reflect = Math.max(0, stats.reflect - REFLECT_DECAY_PER_TURN);
}

const PILE_SCALE = 0.5; // played cards shrink to this fraction of hand size when they land in the pile
const PILE_MAX_CARDS = 10; // oldest piled card is removed once the pile would exceed this
const PILE_CENTER_Y_OFFSET = -50; // moves the pile up from dead-center, away from the hand

// Next slot in the center "played cards" pile — small jitter/spin per card
// (much smaller than the card itself, since these are shrunk down) and an
// ever-increasing zIndex, so it reads as cards being set down onto a neat
// pile rather than thrown.
function nextPileSlot(engine, b) {
  const vp = engine.getViewportSize();
  b.playPileCount = (b.playPileCount || 0) + 1;
  return {
    x: vp.width / 2 + (Math.random() - 0.5) * 10,
    y: vp.height / 2 + PILE_CENTER_Y_OFFSET + (Math.random() - 0.5) * 10,
    rotation: (Math.random() - 0.5) * 22,
    zIndex: 100 + b.playPileCount * 10, // *10 spacing so a card's 6 child offsets never collide with the next card's
  };
}

// Flies a played card to the center pile, shrinking it down on the way, and
// leaves it there (doesn't fade) — every card either side plays accumulates
// in the middle of the table, capped at PILE_MAX_CARDS (oldest removed
// first). Also gives the entity a fresh permanent id: it arrives here still
// carrying a transient id (a "hand_card_N" slot, or its own ai_played_ id),
// and hand slot ids get recycled every time a new hand is dealt — without
// this rename, dealing a new hand would delete whichever piled card
// happens to still be squatting on that slot's old id.
function animateCardPlay(engine, b, entityId) {
  const e = engine.getEntity(entityId);
  if (!e) return;
  const t = e.getComponent("Transform");
  const anim = e.getComponent("Animator");
  if (!t || !anim) return;
  e.id = `pile_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
  // Child entities were created as `${oldId}.icon` etc (see the compiled
  // Card prefab) and don't follow the parent's id automatically — rename
  // them too, or the next hand dealt into this same old slot id would try
  // to create a child with an id these still hold, which fails outright
  // (createEntity returns null on a collision) and crashes the prefab build.
  for (const child of e.children) child.id = `${e.id}.${child.childName}`;
  // Playing a card almost always happens mid-hover (the cursor has to be
  // over it to click it), which leaves it grown by handCardHoverEnter's
  // animateCardScale — possibly still mid-TWEEN, not yet fully at its
  // target size, if the click lands within the hover tween's 0.15s. Used to
  // revert that via a hand-rolled scaleCardVisual() that multiplied
  // whatever the CURRENT (unreliable, maybe mid-tween) live dimensions were
  // — same class of bug as the shop's hover-shrink issue (see CardVisuals.js's
  // baseMetrics comment): landing mid-tween meant the "revert to 1x" step
  // undershot, so the pile card ended up at the wrong size (occasionally
  // barely shrunk at all). setCardScaleInstant jumps straight to an
  // ABSOLUTE target computed from each card's cached true-1x size, so it's
  // exact regardless of whatever the live in-flight value happens to be.
  setCardScaleInstant(e, PILE_SCALE);
  const slot = nextPileSlot(engine, b);
  setCardZIndex(e, slot.zIndex);
  anim.animate(t, "x", slot.x, { duration: 0.35, easing: "easeIn" });
  anim.animate(t, "y", slot.y, { duration: 0.35, easing: "easeIn" });
  anim.animate(t, "rotation", slot.rotation, { duration: 0.35, easing: "easeIn" });
  const it = e.getComponent("Interactable");
  if (it) { it.onClick = null; it.onHoverEnter = null; it.onHoverExit = null; it.cursor = "default"; }

  b.pileQueue = b.pileQueue || [];
  b.pileQueue.push(e.id);
  if (b.pileQueue.length > PILE_MAX_CARDS) {
    const oldestId = b.pileQueue.shift();
    engine.removeEntity(oldestId);
  }
}

// AI plays don't have a visible hand, so spawn a one-off card to represent
// what it just played and send it into the same center pile.
function spawnAiPlayedCardVisual(engine, b, def, level) {
  const vp = engine.getViewportSize();
  const id = `ai_played_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  const startX = vp.width - HUD_MARGIN, startY = vp.height * 0.35;
  const ent = engine.prefabs.instantiate("Card", {
    Transform: { x: startX, y: startY, zIndex: 90, rotation: (Math.random() - 0.5) * 16 },
    ShapeRenderer: { color: def.color },
    SpriteRenderer: { frame: borderFrameForTier(def.tier) },
    children: {
      icon: cardIconOverride(def.id, def.icon),
      name: { TextRenderer: { text: level > 1 ? `${def.name} +${level - 1}` : def.name } },
      desc: { TextRenderer: { text: formatDescription(def, level) } },
      levelIcon: { SpriteRenderer: { frame: levelIconFrame(level), width: level > 1 ? 22 : 0, height: level > 1 ? 22 : 0 } },
    },
  }, id);
  if (ent) animateCardPlay(engine, b, id);
}

// falls off the bottom of the screen, drifting sideways with a spin — used
// for hand cards that weren't the one played. Triggered the instant the
// player clicks/hotkeys a card (see playCard), so the rest of the hand
// clears out right away instead of sitting there until the next turn.
function animateCardDiscard(engine, entityId) {
  const e = engine.getEntity(entityId);
  if (!e) return;
  const vp = engine.getViewportSize();
  const t = e.getComponent("Transform");
  const anim = e.getComponent("Animator");
  const op = e.getComponent("Opacity");
  if (!t || !anim) { engine.removeEntity(entityId); return; }
  const dir = Math.random() < 0.5 ? -1 : 1;
  anim.animate(t, "y", vp.height + 220, { duration: HAND_DISCARD_DURATION, easing: "easeIn" });
  anim.animate(t, "x", t.x + dir * 70, { duration: HAND_DISCARD_DURATION, easing: "easeIn" });
  anim.animate(t, "rotation", t.rotation + dir * 60, { duration: HAND_DISCARD_DURATION, easing: "easeIn" });
  if (op) {
    anim.animate(op, "value", 0, {
      duration: HAND_DISCARD_DURATION, easing: "easeIn",
      onComplete: (ent, eng) => eng.removeEntity(ent.id),
    });
  } else {
    engine.removeEntity(entityId);
  }
}

// ---------- hand / deck ----------

const HAND_HOVER_SCALE = 1.15;
const HAND_HOVER_Z_INDEX = 900; // above every other hand card while hovered, so it doesn't get clipped by its neighbors as it grows

// No y-lift here (unlike the shop/perk hover) — hand cards already have a
// permanent idle-bob tween on (Transform, "y") from startIdleBob, and
// Animator.animate() cancels whatever tween previously held the same
// (target, prop) pair, so a competing hover lift would just fight the bob
// every frame. Growing width/height/fontSize doesn't touch y, so it
// coexists fine; setCardZIndex (below) brings the whole card forward so
// the enlarged art isn't clipped under its neighbors' zIndex instead.
export function handCardHoverEnter(entity, engine) {
  const t = entity.getComponent("Transform");
  if (!t) return;
  entity.state.baseZIndex = entity.state.baseZIndex ?? t.zIndex;
  setCardZIndex(entity, HAND_HOVER_Z_INDEX);
  animateCardScale(entity, HAND_HOVER_SCALE);
}

export function handCardHoverExit(entity, engine) {
  if (entity.state.baseZIndex != null) setCardZIndex(entity, entity.state.baseZIndex);
  animateCardScale(entity, 1);
}

function spawnHandEntities(engine, b) {
  const vp = engine.getViewportSize();
  const entities = [];
  b.hand.forEach((card, i) => {
    const def = CARD_DEFS[card.defId];
    const id = `hand_card_${i}`;
    if (engine.getEntity(id)) engine.removeEntity(id);
    const ent = engine.prefabs.instantiate("Card", {
      Transform: { x: vp.width / 2, y: vp.height + 160, zIndex: 20 + i },
      ShapeRenderer: { color: def.color },
      SpriteRenderer: { frame: borderFrameForTier(def.tier) },
      Interactable: {
        onClick: "engine.callScript('PlayHandCard', entity, engine);",
        onHoverEnter: "engine.callScript('HandCardHoverEnter', entity, engine);",
        onHoverExit: "engine.callScript('HandCardHoverExit', entity, engine);",
      },
      children: {
        icon: cardIconOverride(def.id, def.icon),
        name: { TextRenderer: { text: card.level > 1 ? `${def.name} +${card.level - 1}` : def.name } },
        desc: { TextRenderer: { text: formatDescription(def, card.level) } },
        levelIcon: { SpriteRenderer: { frame: levelIconFrame(card.level), width: card.level > 1 ? 22 : 0, height: card.level > 1 ? 22 : 0 } },
      },
    }, id);
    if (!ent) return;
    ent.state.handIndex = i;
    card.entityId = ent.id;
    entities.push(ent);
  });

  engine.gui.layoutHand(entities, {
    centerX: vp.width / 2, centerY: vp.height - 105,
    spacing: 130, maxAngle: 10, arcHeight: 12, baseZIndex: 20,
  });

  entities.forEach((ent, i) => {
    // layoutHand just set root zIndex to plain 20+i (see baseZIndex above);
    // rebase it (and the children) onto a widely-spaced value so this card's
    // parts can't collide with its neighbor's — same reasoning as the pile,
    // see setCardZIndex's comment.
    setCardZIndex(ent, 20 + i * 10);
    const t = ent.getComponent("Transform");
    const anim = ent.getComponent("Animator");
    const op = ent.getComponent("Opacity");
    const targetX = t.x, targetY = t.y, targetRot = t.rotation;
    t.x = vp.width / 2; t.y = vp.height + 180; t.rotation = 0;
    if (op) op.value = 0;
    if (anim) {
      anim.animate(t, "x", targetX, { duration: 0.4, easing: "easeOut" });
      anim.animate(t, "y", targetY, {
        duration: 0.4, easing: "easeOut",
        onComplete: () => startIdleBob(anim, t, targetY),
      });
      anim.animate(t, "rotation", targetRot, { duration: 0.4, easing: "easeOut" });
      if (op) anim.animate(op, "value", 1, { duration: 0.3, easing: "easeOut" });
    }
  });
}

// A slow, gentle up/down loop kicked off once a hand card finishes its
// entrance tween — just "the hand feels alive," nothing tied to game state.
// No explicit stop needed: animateCardPlay/animateCardDiscard both re-animate
// this same (Transform, "y") pair when a card is played or falls away, and
// Animator.animate() already cancels whatever tween previously held that
// (target, prop) — so playing/discarding a card silently ends its bob chain.
function startIdleBob(anim, t, baseY) {
  const amplitude = 4;
  const duration = 1.1 + Math.random() * 0.4; // slight per-card variance so the hand doesn't bob in lockstep
  const goDown = () => anim.animate(t, "y", baseY + amplitude, { duration, easing: "easeInOut", onComplete: goUp });
  const goUp = () => anim.animate(t, "y", baseY - amplitude, { duration, easing: "easeInOut", onComplete: goDown });
  goUp();
}

// animates whatever's left in the hand falling away and moves it into the
// discard pile — called right when the player plays a card (see playCard),
// so the leftover cards clear out immediately rather than lingering.
function discardHand(engine, b) {
  for (const c of b.hand) {
    if (c.entityId) animateCardDiscard(engine, c.entityId);
    b.discardPile.push({ defId: c.defId, level: c.level });
  }
  b.hand = [];
}

function drawHand(engine, b, count) {
  for (let i = 0; i < count; i++) {
    if (b.drawPile.length === 0) {
      if (b.discardPile.length === 0) break;
      b.drawPile = shuffle(b.discardPile);
      b.discardPile = [];
    }
    b.hand.push(b.drawPile.pop());
  }
  spawnHandEntities(engine, b);
}

function drawAiHand(aiLevel) {
  // Round 4-5 used to take BOTH jumps at once: tier2 unlocked (/3) at the
  // same aiLevel (3, round 4) the level ramp (/2) also hit level 2, so the
  // AI's whole hand got meaningfully stronger in a single round, then
  // stronger again the very next one. Stretched to /4 and /3 respectively
  // so the two jumps land a round apart instead of stacking.
  const maxTier = 1 + Math.floor(aiLevel / 4);
  const pool = AI_POOL.filter((id) => CARD_DEFS[id].tier <= maxTier);
  // Was hard-capped at level 3 (a leftover from when MAX_CARD_LEVEL was 3
  // for players too) — now climbs all the way to MAX_CARD_LEVEL, reaching it
  // around aiLevel 27 (~round 28) with the /3 divisor above, similar
  // completion window to the other AI difficulty ramps, so long runs don't
  // leave the AI stuck at a fraction of the power the player's own upgrades
  // can reach.
  const level = Math.min(MAX_CARD_LEVEL, 1 + Math.floor(aiLevel / 3));
  const hand = [];
  for (let i = 0; i < 3; i++) {
    const defId = pool[Math.floor(Math.random() * pool.length)];
    hand.push({ defId, level });
  }
  return hand;
}

// AI card scoring. Knows that a maxTime hit on the opponent only actually
// costs them time if they're above the new (lower) max — see the comment
// atop CardDatabase.js — so it weighs those by the real loss they'd cause,
// not just the raw number on the card.
function chooseAiCard(b, aiLevel) {
  if (!b.aiHand.length) return null;
  // Was capping at level ~6.25 (round 7) and sitting flat at a 5% mistake
  // rate for the rest of the run. Stretched to cap around level ~9.6 (round
  // ~10-11) with a slightly higher permanent mistake floor (7%) so accuracy
  // keeps visibly climbing for longer instead of plateauing early.
  // Starting point lowered from 0.45 (55% mistake rate) to 0.30 (70%), then
  // to 0.25 (75%) plus a gentler growth rate and lower cap (10% permanent
  // mistake floor instead of 7%) — round 1-5 were still sharpening up too
  // fast on top of the tier/level jumps above.
  const smart = Math.min(0.9, 0.25 + aiLevel * 0.045); // gets sharper with level, never perfect
  if (Math.random() > smart) return Math.floor(Math.random() * b.aiHand.length);
  let bestIdx = 0, bestScore = -Infinity;
  b.aiHand.forEach((card, i) => {
    const def = CARD_DEFS[card.defId];
    const scale = levelScale(card.level);
    let score = 0;
    for (const eff of def.effects) {
      const amt = eff.amount * scale;
      if (eff.type === "currentTime" && eff.target === "opponent") {
        const dmg = -amt;
        score += dmg;
        if (b.player.currentTime - dmg <= 0) score += 100;
      } else if (eff.type === "currentTime" && eff.target === "self") {
        score += amt * (b.ai.currentTime < b.ai.maxTime * 0.4 ? 2.2 : 0.6);
      } else if (eff.type === "trueDamage" && eff.target === "opponent") {
        const dmg = -amt;
        score += dmg * 1.15; // slightly favored over plain currentTime damage — always lands regardless of the player's shield
        if (b.player.currentTime - dmg <= 0) score += 100;
      } else if (eff.type === "trueDamage") {
        score += amt * (b.ai.currentTime < b.ai.maxTime * 0.4 ? 2.2 : 0.6);
      } else if (eff.type === "shield") {
        score += amt * (b.ai.currentTime < b.ai.maxTime * 0.5 ? 1.3 : 0.5);
      } else if (eff.type === "maxTime" && eff.target === "opponent") {
        const floor = Math.max(1, b.player.baseMaxTime * MAX_TIME_REDUCTION_FLOOR_FRACTION);
        const newMax = Math.max(floor, b.player.maxTime + amt);
        const actualLoss = Math.max(0, b.player.currentTime - newMax);
        score += actualLoss * 1.4 + Math.abs(amt) * 0.3;
        if (b.player.currentTime - actualLoss <= 0) score += 100;
      } else if (eff.type === "maxTime") {
        score += Math.abs(amt) * 0.7;
      } else if (eff.type === "regen") {
        score += amt * (eff.target === "opponent" ? -1 : 1) * 0.9;
      } else if (eff.type === "drainRate") {
        // Slowing yourself (self, negative amt) or speeding up the
        // opponent (opponent, positive amt) is good; the reverse — e.g.
        // Overclock/Adrenaline Rush's self-speedup downside — is bad.
        const favorable = eff.target === "opponent" ? amt : -amt;
        score += favorable * 10;
      } else if (eff.type === "handSize") {
        score += 1;
      } else if (eff.type === "shieldRetain") {
        // amt is percentage-points (e.g. 20/-20) — self+ (retain more) or
        // opponent- (erode their shield faster) is favorable.
        const favorable = eff.target === "opponent" ? -amt : amt;
        score += favorable * 0.3;
      } else if (eff.type === "poison" && eff.target === "opponent") {
        score += amt * 3; // stacking DOT — worth well over its face value since it ticks repeatedly
      } else if (eff.type === "poison") {
        score -= amt * 3;
      } else if (eff.type === "timeless") {
        score += amt * 0.24; // amt is percentage-points; 0.24 keeps the base (50%) copy at the same score (12) the old flat bonus gave
      } else if (eff.type === "pace") {
        // Reducing pace matters most when the AI itself is under pressure.
        score += Math.abs(amt) * (b.ai.currentTime < b.ai.maxTime * 0.4 ? 1.0 : 0.3);
      } else if (eff.type === "reflect") {
        score += amt * 2; // punishes the player's attack cards for the rest of the fight, similar weight to shieldRetain/poison
      }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

// ---------- turn flow ----------

export function playCard(engine, b, side, idx) {
  if (b.locked || b.phase === "roundOver" || b.paused) return;
  const isPlayer = side === "player";
  if ((isPlayer && b.phase !== "playerTurn") || (!isPlayer && b.phase !== "aiTurn")) return;
  const actorStats = isPlayer ? b.player : b.ai;
  const opponentStats = isPlayer ? b.ai : b.player;
  const handArr = isPlayer ? b.hand : b.aiHand;
  const card = handArr[idx];
  if (!card) return;
  const def = CARD_DEFS[card.defId];

  b.locked = true;
  handArr.splice(idx, 1);
  playSound(engine, "place");
  const results = resolveEffects(def.effects, card.level, actorStats, opponentStats);
  applyPaceEffects(engine, b, def, card.level, side);

  if (isPlayer) {
    b.discardPile.push({ defId: card.defId, level: card.level });
    if (card.entityId) animateCardPlay(engine, b, card.entityId);
    discardHand(engine, b); // the rest of the hand falls away right now, not at the start of your next turn
  } else {
    spawnAiPlayedCardVisual(engine, b, def, card.level);
  }

  applyResultVisuals(engine, b, results, side);
  applyCardFx(engine, b, def, results);
  showBanner(engine, `${isPlayer ? "You" : "AI"} played ${def.name}${card.level > 1 ? ` +${card.level - 1}` : ""}!`);
  layoutHud(engine, b);
  b.pendingAfterPlay = { delay: isPlayer ? 0.9 : 1.15 };
}

function resolveTurnEnd(engine, run, b) {
  b.locked = false;
  b.pendingAfterPlay = null;

  if (b.ai.currentTime <= 0) return endRound(engine, run, b, "player");
  if (b.player.currentTime <= 0) return endRound(engine, run, b, "ai");

  const acted = b.turn;
  const stats = acted === "player" ? b.player : b.ai;
  if (stats.regen > 0) {
    stats.currentTime = Math.min(stats.maxTime, stats.currentTime + stats.regen);
  }

  // Shield decays once per round, right after the OPPONENT's turn ends —
  // i.e. only once it's actually had a chance to absorb a hit — not after
  // the turn it was gained on. `acted` is whoever's turn just ended, so the
  // side whose shield decays here is the *other* one (their opponent, who
  // just had a turn to attack it). Each side's own shieldRetain (Anchor/
  // Corrode) still controls how much survives the tick.
  const decaying = acted === "player" ? b.ai : b.player;
  decaying.shield *= decaying.shieldRetain;
  if (decaying.shield < 0.05) decaying.shield = 0;

  // Poison (Borrowed Time) ticks once per full round (player turn + AI turn),
  // not once per individual turn-end — resolveTurnEnd itself runs twice a
  // round (once after the player's card, once after the AI's), so gating
  // this on `acted === "ai"` (the second of the pair) is what makes it fire
  // once per round instead of twice. Previously ungated, poison was
  // silently ticking both sides on both turn-ends — double its intended
  // rate, which is almost certainly why it felt like instant death.
  if (acted === "ai") {
    tickPoison(engine, b, "player");
    tickPoison(engine, b, "ai");
  }
  tickReflectDecay(b, "player");
  tickReflectDecay(b, "ai");

  b.turn = acted === "player" ? "ai" : "player";
  if (b.turn === "player") {
    b.phase = "playerTurn";
    const count = Math.max(1, Math.min(MAX_HAND_SIZE, BASE_HAND_SIZE + (b.player.nextHandBonus || 0)));
    b.player.nextHandBonus = 0;
    drawHand(engine, b, count); // hand was already discarded the instant the player's last card was played
    showBanner(engine, "Your Turn");
  } else {
    b.phase = "aiTurn";
    b.aiHand = drawAiHand(b.effectiveAiLevel);
    b.aiThinkTimer = 0;
    // Stretched divisor (was 0.1) so the think-time range keeps narrowing
    // over more rounds instead of compressing almost fully by round 10-12,
    // plus a hard floor so extremely long runs can't decay toward instant
    // plays — the AI should feel snappier over time, never unfair.
    b.aiThinkDelay = Math.max(0.3, (0.6 + Math.random() * 1.0) / (1 + b.effectiveAiLevel * 0.07));
    showBanner(engine, "AI's Turn");
  }
  layoutHud(engine, b);
}

function endRound(engine, run, b, winner) {
  b.phase = "roundOver";
  b.transitionTimer = 0;
  if (winner === "player") {
    // Elite Fight (PathChoiceController) trades a harder fight for a bigger
    // payout — 1.5x here is the "bigger" half of that trade.
    const base = Math.round(Math.max(MIN_ROUND_REWARD, Math.floor(b.player.currentTime)) + run.round * ROUND_REWARD_PER_ROUND);
    const earned = b.isElite ? Math.round(base * 1.5) : base;
    addCurrency(engine, run, earned);
    // Read by ShopController on arrival to count the currency label up from
    // (run.currency - lastEarned) to run.currency instead of snapping
    // straight to the final number — cleared there once consumed.
    run.lastEarned = earned;
    run.round += 1;
    run.aiLevel += 1;
    engine.state.shop = null; // force ShopController to regenerate fresh offers next visit
    playCoinBurst(engine, earned);
    showBanner(engine, `Round Won! +${earned} coins`);
    startShake(b, 10, 0.35); // bigger punch than a single hit — this is the whole round paying off
    flashVignette(engine, "#ffd76a", 0.22, 0.12, 0.5);
    b.transitionTarget = "pathchoice";
    fadeToBlack(engine, 1.2); // 1.8s roundOver window — leaves ~0.6s fully black before the cut
  } else {
    // Stashed on `run` (not consumed here) since it's the gameover scene's
    // GameOverController that actually renders the recap — engine.state.run
    // survives the scene load, only cleared on Retry (GameoverRetry.js).
    run.newBest = recordRunEnd(engine, run.round);
    showBanner(engine, "Time's Up...");
    b.transitionTarget = "gameover";
  }
  layoutHud(engine, b);
}

function initBattle(engine, run) {
  // Elite Fight (PathChoiceController's "Elite" option) sets this, consumed
  // exactly once here — every AI-difficulty lever below uses effectiveAiLevel
  // instead of the run's real aiLevel so an elite fight is harder across the
  // board (HP, accuracy, card tier, think speed), not just tankier.
  const isElite = !!run.eliteNext;
  run.eliteNext = false;
  const effectiveAiLevel = run.aiLevel + (isElite ? 2 : 0);

  // Flat +0.5s of max time per aiLevel (~1 per round win) — was a 12%-of-base
  // multiplicative scale (~1.2s/level, and compounding oddly at high Elite
  // levels since it was BASE_MAX_TIME-relative); a flat rate is both exactly
  // half that growth, as asked, and simpler to reason about.
  const AI_MAX_TIME_PER_LEVEL = 0.42; // was 0.5 — small across-the-board trim, part of the general "nerf AI a little" pass
  const ai = freshStats(BASE_MAX_TIME + effectiveAiLevel * AI_MAX_TIME_PER_LEVEL, BASE_REGEN);
  // Stretched to floor around level ~16-17 (was ~11) so clock-management
  // keeps improving over a longer stretch of rounds, matching the other
  // ramps above instead of maxing out earlier than they do. Growth rate
  // trimmed further (0.03 -> 0.025) so the AI's clock stays closer to full
  // drain speed for longer, same "little bit" nerf as the rest of this pass.
  ai.drainMult = Math.max(0.5, 1 - effectiveAiLevel * 0.025);
  return {
    phase: "intro",
    introTimer: 0,
    introStep: -1,
    roundElapsed: 0,
    tickTimer: 0,
    playPileCount: 0,
    turn: null,
    locked: false,
    pendingAfterPlay: null,
    transitionTimer: 0,
    transitionTarget: null,
    isElite,
    effectiveAiLevel,
    // run.maxTimeBonus is a persistent, run-wide bonus (Vitality perk,
    // PathChoiceController.js) — unlike card effects like Fortify/Overreach
    // (which only last "for the rest of the fight" since freshStats rebuilds
    // player stats from scratch every battle), this is meant to carry over
    // to every future fight this run, so it's added at the BASE_MAX_TIME
    // level here rather than as a per-battle card effect.
    player: freshStats(BASE_MAX_TIME + (run.maxTimeBonus || 0), BASE_REGEN),
    ai,
    hand: [],
    aiHand: [],
    drawPile: shuffle(run.deck),
    discardPile: [],
    aiThinkTimer: 0,
    aiThinkDelay: 1,
    shake: { timer: 0, duration: 0, magnitude: 0, x: 0, y: 0 },
    paused: false,
  };
}

export function BattleController(entity, engine, dt) {
  const run = ensureRun(engine);
  let b = engine.state.battle;
  if (!b) {
    b = engine.state.battle = initBattle(engine, run);
    entity.state.hudSynced = true;
    layoutHud(engine, b);
    showBanner(engine, `Round ${run.round} — Fight!`);
    playSound(engine, "shuffle");
    return;
  }

  // Battle state (b) survives scene reloads (e.g. pause -> card directory ->
  // back), but the entities themselves don't — loadScene tears down and
  // rebuilds everything from the JSON's placeholder Transforms, and drops
  // any dynamically-spawned ones (the hand cards) entirely. Resync both
  // once against the freshly (re)created entities before anything below
  // has a chance to skip it (like the paused early-return).
  if (!entity.state.hudSynced) {
    entity.state.hudSynced = true;
    layoutHud(engine, b);
    setPauseOverlay(engine, b.paused);
    if (b.hand.length && !engine.getEntity("hand_card_0")) spawnHandEntities(engine, b);
  }

  // Not allowed mid-transition (roundOver) — there's nothing to freeze,
  // the scene's about to change anyway. While paused, every per-frame
  // system below (drain, AI thinking, shake/tension) is simply skipped —
  // playCard() also checks b.paused directly since card clicks bypass
  // this tick function entirely.
  if (b.phase !== "roundOver" && engine.input.wasKeyPressed("Escape")) {
    b.paused = !b.paused;
    setPauseOverlay(engine, b.paused);
  }
  if (b.paused) return;

  if (b.phase === "roundOver") {
    b.transitionTimer += dt;
    updateClockTick(engine, b, dt, clamp01(1 - b.transitionTimer / TICK_FADE_DURATION));
    if (b.transitionTimer > 1.8) engine.loadScene(b.transitionTarget);
    return;
  }

  if (b.phase === "intro") {
    b.introTimer += dt;
    const step = Math.min(INTRO_STEPS.length - 1, Math.floor(b.introTimer / INTRO_STEP_DURATION));
    if (step !== b.introStep) {
      b.introStep = step;
      showIntroStep(engine, INTRO_STEPS[step]);
    }
    if (b.introTimer > INTRO_DURATION) {
      b.turn = "player";
      b.phase = "playerTurn";
      drawHand(engine, b, BASE_HAND_SIZE);
      layoutHud(engine, b);
    }
    return;
  }

  b.roundElapsed += dt;
  updateShake(engine, b, dt);
  updateClockTick(engine, b, dt);

  if (b.pendingAfterPlay) {
    b.pendingAfterPlay.delay -= dt;
    layoutHud(engine, b);
    if (b.pendingAfterPlay.delay <= 0) resolveTurnEnd(engine, run, b);
    return;
  }

  if (b.phase === "playerTurn") {
    const pMult = pacedMultiplier(b, b.player); // Timeless — dampens pace, doesn't skip it
    b.player.currentTime = Math.max(0, b.player.currentTime - DRAIN_RATE * pMult * b.player.drainMult * dt);
    layoutHud(engine, b);
    if (b.player.currentTime <= 0) { endRound(engine, run, b, "ai"); return; }
    for (let i = 0; i < Math.min(9, b.hand.length); i++) {
      if (engine.input.wasKeyPressed(`Digit${i + 1}`)) { playCard(engine, b, "player", i); break; }
    }
    return;
  }

  if (b.phase === "aiTurn") {
    const aMult = pacedMultiplier(b, b.ai); // Timeless — dampens pace, doesn't skip it
    b.ai.currentTime = Math.max(0, b.ai.currentTime - DRAIN_RATE * aMult * b.ai.drainMult * dt);
    b.aiThinkTimer += dt;
    layoutHud(engine, b);
    if (b.ai.currentTime <= 0) { endRound(engine, run, b, "player"); return; }
    if (b.aiThinkTimer >= b.aiThinkDelay) {
      const idx = chooseAiCard(b, b.effectiveAiLevel);
      if (idx != null) playCard(engine, b, "ai", idx);
      else { b.aiThinkTimer = 0; b.aiThinkDelay = 0.5; }
    }
    return;
  }
}
