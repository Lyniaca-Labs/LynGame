// BattleController
// Attached to the "controller" entity in scenes/main.json. Owns the whole
// battle state machine (engine.state.battle) — live shot-clock draining,
// turn switching, AI decisions, hand drawing/discarding, HUD, and juice.
// Also exports playCard/drawHand/etc for PlayHandCard.js (the per-card
// click handler) to call into.

import { CARD_DEFS, AI_POOL, formatDescription } from "./CardDatabase.js";
import { ensureRun } from "./RunState.js";
import { resolveEffects } from "./CardEffects.js";

const BASE_MAX_TIME = 10;
const BASE_REGEN = 2; // passive time regained after your own turn — cards (Second Wind / Exhaust) are the real lever
const DRAIN_RATE = 1; // seconds of your own time burned per real second deciding, before the intensity ramp
const INTENSITY_RAMP = 0.035; // +3.5% drain speed per second the round has been going — the fight gets faster the longer it drags on
const MIN_ROUND_REWARD = 7; // coins guaranteed on a win, even with little leftover time
const BAR_HEIGHT = 260;
const BAR_WIDTH = 24;
const HUD_MARGIN = 130; // px in from each screen edge for the bars/labels
const HAND_DISCARD_DURATION = 0.42; // fall-away animation length for unplayed cards

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

function freshStats(maxTime, regen) {
  return { maxTime, currentTime: maxTime, regen, shield: 0, drainMult: 1, nextHandBonus: 0 };
}

function intensityMultiplier(b) {
  return 1 + b.roundElapsed * INTENSITY_RAMP;
}

function barColor(ratio) {
  if (ratio > 0.5) return "#33d17a";
  if (ratio > 0.25) return "#e8b339";
  return "#e0473f";
}

function setShape(engine, id, x, y, w, h, color) {
  const e = engine.getEntity(id);
  if (!e) return;
  const t = e.getComponent("Transform");
  const s = e.getComponent("ShapeRenderer");
  if (t) { t.x = x; t.y = y; }
  if (s) { s.width = w; s.height = h; if (color) s.color = color; }
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

function formatTimeLabel(stats) {
  let t = `${stats.currentTime.toFixed(1)}s/${stats.maxTime.toFixed(0)}s`;
  if (stats.shield > 0) t += `\nShield ${stats.shield.toFixed(0)}`;
  return t;
}

// ---------- HUD ----------

function layoutHud(engine, b) {
  const run = engine.state.run;
  const vp = engine.getViewportSize();
  const leftX = HUD_MARGIN, rightX = vp.width - HUD_MARGIN;
  const midY = vp.height / 2;
  const topY = midY - BAR_HEIGHT / 2;
  const bottomY = midY + BAR_HEIGHT / 2;

  // colored frames behind each bar are the always-visible "this side is
  // mine / this side is the enemy's" cue — independent of the fill color,
  // which is reserved for health status (green/yellow/red).
  setShape(engine, "playerBarFrame", leftX, midY, BAR_WIDTH + 10, BAR_HEIGHT + 10, "#3b5bdb");
  setShape(engine, "aiBarFrame", rightX, midY, BAR_WIDTH + 10, BAR_HEIGHT + 10, "#dc3b3b");
  setShape(engine, "playerBarTrack", leftX, midY, BAR_WIDTH, BAR_HEIGHT, "#12141c");
  setShape(engine, "aiBarTrack", rightX, midY, BAR_WIDTH, BAR_HEIGHT, "#12141c");

  const pr = clamp01(b.player.currentTime / b.player.maxTime);
  const ar = clamp01(b.ai.currentTime / b.ai.maxTime);
  const pFillH = BAR_HEIGHT * pr;
  const aFillH = BAR_HEIGHT * ar;
  setShape(engine, "playerBarFill", leftX, bottomY - pFillH / 2, BAR_WIDTH - 6, pFillH, barColor(pr));
  setShape(engine, "aiBarFill", rightX, bottomY - aFillH / 2, BAR_WIDTH - 6, aFillH, barColor(ar));

  setTextPos(engine, "playerNameLabel", leftX, topY - 34, "YOU");
  setTextPos(engine, "aiNameLabel", rightX, topY - 34, "ENEMY");
  setTextPos(engine, "playerTimeLabel", leftX, topY + 24, formatTimeLabel(b.player));
  setTextPos(engine, "aiTimeLabel", rightX, topY + 24, formatTimeLabel(b.ai));

  if (run) {
    setText(engine, "roundLabelValue", `Round ${run.round}`);
    setText(engine, "currencyLabelValue", `Coins: ${run.currency}`);
  }
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

function impact(engine, side) {
  const id = side === "player" ? "playerImpactEmitter" : "aiImpactEmitter";
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

function applyResultVisuals(engine, b, results, actorSide) {
  const vp = engine.getViewportSize();
  const leftX = HUD_MARGIN, rightX = vp.width - HUD_MARGIN, midY = vp.height / 2;
  for (const r of results) {
    const side = resultSide(actorSide, r.target);
    const x = side === "player" ? leftX + 46 : rightX - 46;
    let text = null, color = "#ffffff";
    if (r.type === "currentTime") {
      const amt = Math.round(r.amount * 10) / 10;
      if (amt === 0) continue;
      text = `${amt > 0 ? "+" : ""}${amt}s`;
      color = amt > 0 ? "#4ade80" : "#f87171";
      if (amt < 0) impact(engine, side);
    } else if (r.type === "shield") {
      text = `+${r.amount} Shield`; color = "#60a5fa";
    } else if (r.type === "maxTime") {
      const amt = Math.round(r.amount * 10) / 10;
      text = `${amt >= 0 ? "+" : ""}${amt} Max`; color = "#facc15";
      if (amt < 0) impact(engine, side);
    } else if (r.type === "regen") {
      text = `${r.amount >= 0 ? "+" : ""}${r.amount} Regen`; color = r.amount >= 0 ? "#a3e635" : "#fb923c";
    } else if (r.type === "drainRate") {
      text = "Focused"; color = "#c4b5fd";
    } else if (r.type === "handSize") {
      text = `+${r.amount} Hand`; color = "#fbbf24";
    }
    if (text) spawnFloatText(engine, x, midY, text, color);
  }
}

const PILE_SCALE = 0.5; // played cards shrink to this fraction of hand size when they land in the pile
const PILE_MAX_CARDS = 10; // oldest piled card is removed once the pile would exceed this
const PILE_CENTER_Y_OFFSET = -50; // moves the pile up from dead-center, away from the hand
// Every card is a root + these named children (see prefabs/Card.json). Each
// child has a FIXED zIndex in the prefab (500-505) meant only to keep a
// card's own parts above its own background — that's fine when cards don't
// overlap (the hand), but once many card instances overlap in the pile,
// those shared absolute values interleave between different cards' parts
// instead of each card layering as one coherent unit. setCardZIndex rebases
// every instance's children onto that instance's own root zIndex so a whole
// card — root and children together — moves as a unit in draw order.
const PILE_CHILD_Z_OFFSETS = { descBg: 0, icon: 1, name: 2, desc: 3, badge: 4, badgeText: 5 };

function setCardZIndex(ent, baseZIndex) {
  const t = ent.getComponent("Transform");
  if (t) t.zIndex = baseZIndex;
  for (const [name, offset] of Object.entries(PILE_CHILD_Z_OFFSETS)) {
    const child = ent.getChild(name);
    const ct = child && child.getComponent("Transform");
    if (ct) ct.zIndex = baseZIndex + offset;
  }
}

// Shrinks a card entity in place — Transform has no scale field, so this
// scales the root's own renderer(s) plus every named child's local offset
// and renderer/font size, proportionally, around the root's origin.
function scaleCardVisual(ent, scale) {
  const rootShape = ent.getComponent("ShapeRenderer");
  const rootSprite = ent.getComponent("SpriteRenderer");
  if (rootShape) { rootShape.width *= scale; rootShape.height *= scale; }
  if (rootSprite) { rootSprite.width *= scale; rootSprite.height *= scale; }
  for (const name of Object.keys(PILE_CHILD_Z_OFFSETS)) {
    const child = ent.getChild(name);
    if (!child) continue;
    const t = child.getComponent("Transform");
    if (t) { t.x *= scale; t.y *= scale; }
    const sr = child.getComponent("ShapeRenderer");
    if (sr) { sr.width *= scale; sr.height *= scale; }
    const spr = child.getComponent("SpriteRenderer");
    if (spr) { spr.width *= scale; spr.height *= scale; }
    const tr = child.getComponent("TextRenderer");
    if (tr) {
      tr.fontSize = Math.max(6, tr.fontSize * scale);
      if (tr.maxWidth) tr.maxWidth *= scale;
    }
  }
}

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
  scaleCardVisual(e, PILE_SCALE);
  const slot = nextPileSlot(engine, b);
  setCardZIndex(e, slot.zIndex);
  anim.animate(t, "x", slot.x, { duration: 0.35, easing: "easeIn" });
  anim.animate(t, "y", slot.y, { duration: 0.35, easing: "easeIn" });
  anim.animate(t, "rotation", slot.rotation, { duration: 0.35, easing: "easeIn" });
  const it = e.getComponent("Interactable");
  if (it) { it.onClick = null; it.cursor = "default"; }

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
    children: {
      icon: { ShapeRenderer: { color: def.icon } },
      name: { TextRenderer: { text: level > 1 ? `${def.name} +${level - 1}` : def.name } },
      desc: { TextRenderer: { text: formatDescription(def, level) } },
      badge: { ShapeRenderer: { width: level > 1 ? 22 : 0, height: level > 1 ? 22 : 0 } },
      badgeText: { TextRenderer: { text: level > 1 ? `Lv${level}` : "" } },
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
      Interactable: { onClick: "engine.callScript('PlayHandCard', entity, engine);" },
      children: {
        icon: { ShapeRenderer: { color: def.icon } },
        name: { TextRenderer: { text: card.level > 1 ? `${def.name} +${card.level - 1}` : def.name } },
        desc: { TextRenderer: { text: formatDescription(def, card.level) } },
        badge: { ShapeRenderer: { width: card.level > 1 ? 22 : 0, height: card.level > 1 ? 22 : 0 } },
        badgeText: { TextRenderer: { text: card.level > 1 ? `Lv${card.level}` : "" } },
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
      anim.animate(t, "y", targetY, { duration: 0.4, easing: "easeOut" });
      anim.animate(t, "rotation", targetRot, { duration: 0.4, easing: "easeOut" });
      if (op) anim.animate(op, "value", 1, { duration: 0.3, easing: "easeOut" });
    }
  });
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
  const maxTier = 1 + Math.floor(aiLevel / 2);
  const pool = AI_POOL.filter((id) => CARD_DEFS[id].tier <= maxTier);
  const level = Math.min(3, 1 + Math.floor(aiLevel / 3));
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
  const smart = Math.min(0.95, 0.45 + aiLevel * 0.08); // gets sharper with level, never perfect
  if (Math.random() > smart) return Math.floor(Math.random() * b.aiHand.length);
  let bestIdx = 0, bestScore = -Infinity;
  b.aiHand.forEach((card, i) => {
    const def = CARD_DEFS[card.defId];
    const scale = 1 + 0.5 * (card.level - 1);
    let score = 0;
    for (const eff of def.effects) {
      const amt = eff.amount * scale;
      if (eff.type === "currentTime" && eff.target === "opponent") {
        const dmg = -amt;
        score += dmg;
        if (b.player.currentTime - dmg <= 0) score += 100;
      } else if (eff.type === "currentTime" && eff.target === "self") {
        score += amt * (b.ai.currentTime < b.ai.maxTime * 0.4 ? 2.2 : 0.6);
      } else if (eff.type === "shield") {
        score += amt * (b.ai.currentTime < b.ai.maxTime * 0.5 ? 1.3 : 0.5);
      } else if (eff.type === "maxTime" && eff.target === "opponent") {
        const newMax = Math.max(1, b.player.maxTime + amt);
        const actualLoss = Math.max(0, b.player.currentTime - newMax);
        score += actualLoss * 1.4 + Math.abs(amt) * 0.3;
        if (b.player.currentTime - actualLoss <= 0) score += 100;
      } else if (eff.type === "maxTime") {
        score += Math.abs(amt) * 0.7;
      } else if (eff.type === "regen") {
        score += amt * (eff.target === "opponent" ? -1 : 1) * 0.9;
      } else if (eff.type === "drainRate") {
        score += 3;
      } else if (eff.type === "handSize") {
        score += 1;
      }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

// ---------- turn flow ----------

export function playCard(engine, b, side, idx) {
  if (b.locked || b.phase === "roundOver") return;
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
  const results = resolveEffects(def.effects, card.level, actorStats, opponentStats);

  if (isPlayer) {
    b.discardPile.push({ defId: card.defId, level: card.level });
    if (card.entityId) animateCardPlay(engine, b, card.entityId);
    discardHand(engine, b); // the rest of the hand falls away right now, not at the start of your next turn
  } else {
    spawnAiPlayedCardVisual(engine, b, def, card.level);
  }

  applyResultVisuals(engine, b, results, side);
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

  b.turn = acted === "player" ? "ai" : "player";
  if (b.turn === "player") {
    b.phase = "playerTurn";
    const count = 3 + (b.player.nextHandBonus || 0);
    b.player.nextHandBonus = 0;
    drawHand(engine, b, count); // hand was already discarded the instant the player's last card was played
    showBanner(engine, "Your Turn");
  } else {
    b.phase = "aiTurn";
    b.aiHand = drawAiHand(run.aiLevel);
    b.aiThinkTimer = 0;
    b.aiThinkDelay = (0.6 + Math.random() * 1.0) / (1 + run.aiLevel * 0.1);
    showBanner(engine, "AI's Turn");
  }
  layoutHud(engine, b);
}

function endRound(engine, run, b, winner) {
  b.phase = "roundOver";
  b.transitionTimer = 0;
  if (winner === "player") {
    const earned = Math.max(MIN_ROUND_REWARD, Math.floor(b.player.currentTime));
    run.currency += earned;
    run.round += 1;
    run.aiLevel += 1;
    engine.state.shop = null; // force ShopController to regenerate fresh offers next visit
    showBanner(engine, `Round Won! +${earned} coins`);
    b.transitionTarget = "shop";
  } else {
    showBanner(engine, "Time's Up...");
    b.transitionTarget = "gameover";
  }
  layoutHud(engine, b);
}

function initBattle(engine, run) {
  const aiScale = 1 + run.aiLevel * 0.12;
  const ai = freshStats(Math.round(BASE_MAX_TIME * aiScale), BASE_REGEN);
  ai.drainMult = Math.max(0.55, 1 - run.aiLevel * 0.04);
  return {
    phase: "intro",
    introTimer: 0,
    roundElapsed: 0,
    playPileCount: 0,
    turn: null,
    locked: false,
    pendingAfterPlay: null,
    transitionTimer: 0,
    transitionTarget: null,
    player: freshStats(BASE_MAX_TIME, BASE_REGEN),
    ai,
    hand: [],
    aiHand: [],
    drawPile: shuffle(run.deck),
    discardPile: [],
    aiThinkTimer: 0,
    aiThinkDelay: 1,
  };
}

export function BattleController(entity, engine, dt) {
  const run = ensureRun(engine);
  let b = engine.state.battle;
  if (!b) {
    b = engine.state.battle = initBattle(engine, run);
    layoutHud(engine, b);
    showBanner(engine, `Round ${run.round} — Fight!`);
    return;
  }

  if (b.phase === "roundOver") {
    b.transitionTimer += dt;
    if (b.transitionTimer > 1.8) engine.loadScene(b.transitionTarget);
    return;
  }

  if (b.phase === "intro") {
    b.introTimer += dt;
    if (b.introTimer > 1.2) {
      b.turn = "player";
      b.phase = "playerTurn";
      drawHand(engine, b, 3);
      layoutHud(engine, b);
    }
    return;
  }

  b.roundElapsed += dt;

  if (b.pendingAfterPlay) {
    b.pendingAfterPlay.delay -= dt;
    layoutHud(engine, b);
    if (b.pendingAfterPlay.delay <= 0) resolveTurnEnd(engine, run, b);
    return;
  }

  if (b.phase === "playerTurn") {
    b.player.currentTime = Math.max(0, b.player.currentTime - DRAIN_RATE * intensityMultiplier(b) * b.player.drainMult * dt);
    layoutHud(engine, b);
    if (b.player.currentTime <= 0) { endRound(engine, run, b, "ai"); return; }
    for (let i = 0; i < Math.min(9, b.hand.length); i++) {
      if (engine.input.wasKeyPressed(`Digit${i + 1}`)) { playCard(engine, b, "player", i); break; }
    }
    return;
  }

  if (b.phase === "aiTurn") {
    b.ai.currentTime = Math.max(0, b.ai.currentTime - DRAIN_RATE * intensityMultiplier(b) * b.ai.drainMult * dt);
    b.aiThinkTimer += dt;
    layoutHud(engine, b);
    if (b.ai.currentTime <= 0) { endRound(engine, run, b, "player"); return; }
    if (b.aiThinkTimer >= b.aiThinkDelay) {
      const idx = chooseAiCard(b, run.aiLevel);
      if (idx != null) playCard(engine, b, "ai", idx);
      else { b.aiThinkTimer = 0; b.aiThinkDelay = 0.5; }
    }
    return;
  }
}
