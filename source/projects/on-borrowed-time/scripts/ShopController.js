// ShopController
// Runs the post-round shop scene: 3 random new-card offers + an "Upgrade"
// and a "Remove" offer, all purchasable with the coins earned from last
// round's leftover time (engine.state.run.currency). Also exports buyOffer
// for BuyOffer.js (the per-offer click handler) to call into.
//
// Upgrade/Remove no longer resolve on a random deck card — clicking either
// opens a "picker" (shop.picker) that shows the player's own deck so they
// choose exactly which card gets upgraded/removed (see enterPicker/
// pickDeckCard/cancelPicker below).

import { CARD_DEFS, SHOP_POOL, formatDescription, formatBuildSummary, LEVEL_POWER_SCALE, MAX_CARD_LEVEL, borderFrameForTier, levelIconFrame, iconFrameForCard, cardIconOverride, cardIconOverrideByFrame } from "./CardDatabase.js";
import { ensureRun } from "./RunState.js";
import { playSound } from "./SoundEffects.js";
import { animateCardScale, setCardScaleInstant, setCardZIndex } from "./CardVisuals.js";
import { computeCardGridLayout, layoutCardGridPage, setPagerButton } from "./CardGrid.js";
import { ShopContinue } from "./ShopContinue.js";

const OFFER_HOVER_SCALE = 1.2; // was 1.1 — too subtle to read as "bigger" against the neighbor cards
const OFFER_HOVER_Z_INDEX = 900; // matches BattleController.js's HAND_HOVER_Z_INDEX

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hoarder's Luck and Bulk Discount (PathChoiceController.js's PERKS) leave
// flags on `run` for the very next shop visit to consume — one-shot, same
// pattern as BattleController.initBattle consuming run.eliteNext.
function generateOffers(run) {
  const pool = shuffle(SHOP_POOL);
  const offers = [];
  const cardCount = run.extraShopOffer ? 4 : 3;
  for (let i = 0; i < cardCount && i < pool.length; i++) {
    const defId = pool[i];
    offers.push({ kind: "card", defId, price: CARD_DEFS[defId].price, bought: false });
  }
  const discount = run.shopDiscount || 0;
  // Upgrade was 16+3/round (31c by round 5) — way past what a round's
  // reward can comfortably cover. Remove is now a flat, cheap 8c regardless
  // of round (was 10+2/round, 20c by round 5) — it's a deck-thinning tool,
  // not something that should get more expensive as the run goes on.
  offers.push({ kind: "upgrade", price: Math.round((8 + run.round * 1.5) * (1 - discount)), bought: false });
  offers.push({ kind: "remove", price: Math.round(8 * (1 - discount)), bought: false });
  run.extraShopOffer = false;
  run.shopDiscount = 0;
  return offers;
}

function offerVisual(offer) {
  if (offer.kind === "card") {
    const def = CARD_DEFS[offer.defId];
    return { color: def.color, icon: def.icon, iconFrame: iconFrameForCard(offer.defId), name: def.name, desc: formatDescription(def, 1), tier: def.tier };
  }
  if (offer.kind === "upgrade") {
    return { color: "#5b4a1e", icon: "#ffb020", iconFrame: "upgrade", name: "Upgrade", desc: `Choose a card to upgrade (+${Math.round(LEVEL_POWER_SCALE * 100)}% power).`, tier: 1 };
  }
  return { color: "#5b1e1e", icon: "#ef4444", iconFrame: "remove", name: "Remove", desc: "Choose a card to remove from your deck.", tier: 1 };
}

// Hover handlers shared by shop offers AND deck-picker cards — grows the
// card (+ its text, via animateCardScale) alongside the existing lift.
// Also bumps zIndex to the front (same treatment as BattleController.js's
// hand-card hover, via the shared setCardZIndex) — at 1.1x this rarely
// mattered since the grow was subtle enough not to overlap a neighbor, but
// at 1.2x an unbumped card would visually clip UNDER whichever neighbor
// happens to have a higher zIndex, making the "bigger" hover read as broken.
export function offerHoverEnter(entity, engine) {
  const anim = entity.getComponent("Animator");
  const t = entity.getComponent("Transform");
  if (!anim || !t) return;
  entity.state.baseY = entity.state.baseY ?? t.y;
  entity.state.baseZIndex = entity.state.baseZIndex ?? t.zIndex;
  anim.animate(t, "y", entity.state.baseY - 16, { duration: 0.12, easing: "easeOut" });
  animateCardScale(entity, OFFER_HOVER_SCALE);
  setCardZIndex(entity, OFFER_HOVER_Z_INDEX);
}

export function offerHoverExit(entity, engine) {
  const anim = entity.getComponent("Animator");
  const t = entity.getComponent("Transform");
  if (!anim || !t) return;
  anim.animate(t, "y", entity.state.baseY, { duration: 0.12, easing: "easeOut" });
  animateCardScale(entity, 1);
  if (entity.state.baseZIndex != null) setCardZIndex(entity, entity.state.baseZIndex);
}

function spawnOffers(engine, shop) {
  const vp = engine.getViewportSize();
  const entities = [];
  shop.offers.forEach((offer, i) => {
    const id = `offer_${i}`;
    if (engine.getEntity(id)) engine.removeEntity(id);
    const v = offerVisual(offer);
    const ent = engine.prefabs.instantiate("Card", {
      Transform: { x: vp.width / 2, y: vp.height / 2 + 10, zIndex: 20 + i },
      ShapeRenderer: { color: v.color },
      SpriteRenderer: { frame: borderFrameForTier(v.tier) },
      Interactable: {
        onClick: "engine.callScript('BuyOffer', entity, engine);",
        onHoverEnter: "engine.callScript('ShopOfferHoverEnter', entity, engine);",
        onHoverExit: "engine.callScript('ShopOfferHoverExit', entity, engine);",
      },
      children: {
        icon: cardIconOverrideByFrame(v.iconFrame, v.icon),
        name: { TextRenderer: { text: v.name } },
        desc: { TextRenderer: { text: v.desc } },
        badge: { ShapeRenderer: { width: 28, height: 28 } },
        badgeText: { TextRenderer: { text: `${offer.price}c` } },
      },
    }, id);
    if (!ent) return;
    ent.state.offerIndex = i;
    entities.push(ent);
  });
  engine.gui.layoutRow(entities, {
    centerX: vp.width / 2, centerY: vp.height / 2 + 10,
    spacing: 132, direction: "horizontal", baseZIndex: 20,
  });
  entities.forEach((ent, i) => {
    const t = ent.getComponent("Transform");
    const anim = ent.getComponent("Animator");
    const op = ent.getComponent("Opacity");
    const targetY = t.y;
    // Set explicitly now rather than relying on onHoverEnter's lazy `??`
    // cache: if the shop opens while the cursor already sits over where a
    // card lands, hover can fire on the very first frame — before this
    // entrance tween even starts — catching t.y at the +60 "start below"
    // offset below and locking that in as the permanent resting position.
    ent.state.baseY = targetY;
    t.y = targetY + 60;
    if (op) op.value = 0;
    if (anim) {
      anim.animate(t, "y", targetY, { duration: 0.35, easing: "easeOut" });
      if (op) anim.animate(op, "value", 1, { duration: 0.3, easing: "easeOut" });
    }
  });
  return entities;
}

// Moves the offer row off-screen (rather than destroying it) while the
// deck picker is open, and back on-screen once it closes — keeps every
// offer's bought/SOLD/onClick state intact without needing to snapshot and
// re-apply it (spawnOffers is otherwise only ever called once per visit).
function setOffersHidden(engine, shop, hidden) {
  shop.offers.forEach((offer, i) => {
    const ent = engine.getEntity(`offer_${i}`);
    const t = ent && ent.getComponent("Transform");
    const anim = ent && ent.getComponent("Animator");
    const it = ent && ent.getComponent("Interactable");
    if (!t) return;
    // You have to be HOVERING an offer to click it, so opening the picker
    // almost always lands here with that offer's hover-lift tween
    // (offerHoverEnter's Transform.y animate, still mid-flight) — Animator
    // re-asserts its own absolute interpolated y every tick until that
    // tween finishes, silently undoing the +3000 offset below a few frames
    // later and leaving the "hidden" offer fully visible. Cancel it first.
    if (anim) anim.stop(t, "y");
    if (hidden) {
      ent.state.preOffscreenY = t.y;
      t.y += 3000;
      // Reset the hover grow now so it doesn't pop back in at 1.1x scale
      // when the offer returns.
      setCardScaleInstant(ent, 1);
      // The offer's Interactable is still LIVE and still ticking every
      // frame even once it's off-screen — the very next tick notices the
      // cursor is no longer over its (now 3000px-away) box and fires
      // onHoverExit for real, which animates Transform.y right back to
      // entity.state.baseY, undoing the hide a frame later and sliding the
      // "hidden" card back into view. Null both handlers out while hidden
      // so that per-frame recheck can't call back into either one; restored
      // below once the offer is back on-screen.
      if (it) { it.onHoverEnter = null; it.onHoverExit = null; }
    } else {
      if (ent.state.preOffscreenY != null) t.y = ent.state.preOffscreenY;
      if (it) { it.onHoverEnter = offerHoverEnter; it.onHoverExit = offerHoverExit; }
    }
  });
}

function updateShopHud(engine) {
  const run = engine.state.run;
  const cur = engine.getEntity("shopCurrency");
  const curTr = cur && cur.getComponent("TextRenderer");
  if (curTr) curTr.text = `Coins: ${run.currency}`;
  const deck = engine.getEntity("shopDeckCount");
  const deckTr = deck && deck.getComponent("TextRenderer");
  if (deckTr) deckTr.text = `Deck: ${run.deck.length} cards`;
  const tags = engine.getEntity("shopBuildTags");
  const tagsTr = tags && tags.getComponent("TextRenderer");
  if (tagsTr) tagsTr.text = formatBuildSummary(run.deck);
}

function markPurchased(engine, idx, label = "SOLD") {
  const ent = engine.getEntity(`offer_${idx}`);
  if (!ent) return;
  const anim = ent.getComponent("Animator");
  const op = ent.getComponent("Opacity");
  const it = ent.getComponent("Interactable");
  // null, not "" — a raw string assigned directly (bypassing the
  // constructor's compileCode) is never compiled into a callable, and
  // throws "onClick is not a function" the moment it's clicked.
  if (it) it.onClick = null;
  const badgeTextEnt = ent.getChild("badgeText");
  if (badgeTextEnt) {
    const tr = badgeTextEnt.getComponent("TextRenderer");
    if (tr) tr.text = label;
  }
  if (anim && op) anim.animate(op, "value", 0.35, { duration: 0.3 });
}

// Quick punch (grow then settle) on the badge circle so the "SOLD"/
// "UPGRADED!" label reads as a hit landing, not just a text swap. Animator's
// animate() ticks whatever component instance it's given regardless of
// which entity owns it, so the offer's own root Animator (already present
// via the Card prefab) can drive a tween on its badge child directly.
function punchBadge(engine, idx) {
  const ent = engine.getEntity(`offer_${idx}`);
  const anim = ent && ent.getComponent("Animator");
  const badge = ent && ent.getChild("badge");
  const shape = badge && badge.getComponent("ShapeRenderer");
  if (!anim || !shape) return;
  const baseW = shape.width, baseH = shape.height;
  anim.animate(shape, "width", baseW * 1.5, {
    duration: 0.12, easing: "easeOut",
    onComplete: () => anim.animate(shape, "width", baseW, { duration: 0.18, easing: "easeOut" }),
  });
  anim.animate(shape, "height", baseH * 1.5, {
    duration: 0.12, easing: "easeOut",
    onComplete: () => anim.animate(shape, "height", baseH, { duration: 0.18, easing: "easeOut" }),
  });
}

// Same one-off "drifts up and fades" recipe as BattleController.js's
// spawnFloatText — duplicated rather than shared since each script here
// owns its own small helpers (see PROJECT_STRUCTURE.md's scripts-folder
// convention) and there's no shared utils module to hang it on yet.
function spawnFloatText(engine, x, y, text, color) {
  const id = `shopfx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
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
    onComplete: (fxEnt, eng) => eng.removeEntity(fxEnt.id),
  });
}

// `reason` is optional — every denial (can't afford, deck too small to
// remove from, no upgradable cards left) used to just shake the offer with
// no explanation, which reads identically to "you can't afford this" even
// when money has nothing to do with it (e.g. Remove is blocked below 6
// cards regardless of price) — pass a reason so it's clear why.
function flashDenied(engine, idx, reason) {
  const ent = engine.getEntity(`offer_${idx}`);
  if (!ent) return;
  const t = ent.getComponent("Transform");
  const anim = ent.getComponent("Animator");
  if (!t || !anim) return;
  const ox = t.x;
  anim.animate(t, "x", ox - 10, { duration: 0.07, onComplete: () => {
    anim.animate(t, "x", ox + 10, { duration: 0.07, onComplete: () => {
      anim.animate(t, "x", ox, { duration: 0.07 });
    } });
  } });
  if (reason) spawnFloatText(engine, t.x, t.y - 96, reason, "#f87171");
}

// Finalizes a purchase's visuals — shared by the instant "card" purchase
// path and pickDeckCard (upgrade/remove) below. `anchorEnt` is whichever
// entity the floating text/particle burst should appear at — the offer
// itself for a plain card buy, or the specific deck card just picked for
// an upgrade/remove (the offer entity is off-screen during picker mode).
function finishPurchase(engine, idx, badgeLabel, popupText, popupColor, anchorEnt) {
  markPurchased(engine, idx, badgeLabel);
  updateShopHud(engine);
  punchBadge(engine, idx);
  const t = anchorEnt && anchorEnt.getComponent("Transform");
  if (t) {
    spawnFloatText(engine, t.x, t.y - 96, popupText, popupColor);
    const burstEnt = engine.getEntity("shopBurst");
    const burstT = burstEnt && burstEnt.getComponent("Transform");
    if (burstT) { burstT.x = t.x; burstT.y = t.y; }
  }
  engine.query("shopBurst:Emitter")?.trigger();
}

// ---------- deck picker (Upgrade/Remove target selection) ----------
// Same paginated-grid approach as the card directory (CardGrid.js) — "the
// directory, but your deck." The old fixed-rows-of-6 layout had no
// pagination, so it could overflow off-screen with no way to reach the
// rest once a deck grew past what fit — the exact bug the directory itself
// had before it got real pagination.

const PICKER_CARD_SCALE = 0.85; // match the directory's shrink
const PICKER_TOP_MARGIN = 130; // room for the hint text above
const PICKER_BOTTOM_MARGIN = 190; // room for the prev/page-label/next row plus Cancel below it
const PICKER_SIDE_MARGIN = 60;
const PICKER_MAX_COLUMNS = 5;
const PICKER_MAX_ROWS = 3;

function computePickerLayout(engine) {
  return computeCardGridLayout(engine, {
    scale: PICKER_CARD_SCALE, maxColumns: PICKER_MAX_COLUMNS, maxRows: PICKER_MAX_ROWS,
    topMargin: PICKER_TOP_MARGIN, bottomMargin: PICKER_BOTTOM_MARGIN, sideMargin: PICKER_SIDE_MARGIN,
  });
}

function clearPickerCardEntities(engine) {
  let i = 0;
  while (engine.getEntity(`picker_${i}`)) {
    engine.removeEntity(`picker_${i}`);
    i++;
  }
}

// Everything here is created without an onClick — spawnPickerPage (the only
// thing that ever runs after this, on the very same call) wires the real
// Prev/Next handlers via setPagerButton immediately, before the player
// could plausibly click either button.
function spawnPickerChrome(engine, kind) {
  const vp = engine.getViewportSize();

  if (engine.getEntity("pickerHint")) engine.removeEntity("pickerHint");
  const hint = engine.createEntity("pickerHint");
  if (hint) {
    hint.addComponent(engine.components.Transform, { x: vp.width / 2, y: 86, fixed: true, zIndex: 30 });
    hint.addComponent(engine.components.TextRenderer, {
      text: kind === "upgrade" ? "Choose a card to upgrade" : "Choose a card to remove",
      fontFamily: "VT323", googleFont: true, fontSize: 24, color: "#ffffff", align: "center",
    });
  }

  if (engine.getEntity("pickerCancelBtn")) engine.removeEntity("pickerCancelBtn");
  const cancel = engine.createEntity("pickerCancelBtn");
  if (cancel) {
    cancel.addComponent(engine.components.Transform, { x: vp.width / 2, y: vp.height - 54, fixed: true, zIndex: 30 });
    cancel.addComponent(engine.components.ShapeRenderer, { shape: "rect", width: 160, height: 44, color: "#3a2a2a" });
    cancel.addComponent(engine.components.TextRenderer, {
      text: "Cancel", fontFamily: "VT323", googleFont: true, fontSize: 20, color: "#ffffff", align: "center", verticalAlign: "middle",
    });
    cancel.addComponent(engine.components.Interactable, {
      width: 160, height: 44, cursor: "pointer", onClick: "engine.callScript('CancelPicker', entity, engine);",
    });
  }

  if (engine.getEntity("pickerPrevBtn")) engine.removeEntity("pickerPrevBtn");
  const prev = engine.createEntity("pickerPrevBtn");
  if (prev) {
    prev.addComponent(engine.components.Transform, { x: vp.width / 2 - 140, y: vp.height - 124, fixed: true, zIndex: 30 });
    prev.addComponent(engine.components.ShapeRenderer, { shape: "rect", width: 120, height: 44, color: "#2a2d38" });
    prev.addComponent(engine.components.TextRenderer, {
      text: "< Prev", fontFamily: "VT323", googleFont: true, fontSize: 20, color: "#ffffff", align: "center", verticalAlign: "middle",
    });
    prev.addComponent(engine.components.Interactable, { width: 120, height: 44 });
    prev.addComponent(engine.components.Opacity, { value: 1 });
  }

  if (engine.getEntity("pickerPageLabel")) engine.removeEntity("pickerPageLabel");
  const label = engine.createEntity("pickerPageLabel");
  if (label) {
    label.addComponent(engine.components.Transform, { x: vp.width / 2, y: vp.height - 136, fixed: true, zIndex: 30 });
    label.addComponent(engine.components.TextRenderer, {
      text: "Page 1 / 1", fontFamily: "VT323", googleFont: true, fontSize: 20, color: "#c7cad6", align: "center",
    });
  }

  if (engine.getEntity("pickerNextBtn")) engine.removeEntity("pickerNextBtn");
  const next = engine.createEntity("pickerNextBtn");
  if (next) {
    next.addComponent(engine.components.Transform, { x: vp.width / 2 + 140, y: vp.height - 124, fixed: true, zIndex: 30 });
    next.addComponent(engine.components.ShapeRenderer, { shape: "rect", width: 120, height: 44, color: "#2a2d38" });
    next.addComponent(engine.components.TextRenderer, {
      text: "Next >", fontFamily: "VT323", googleFont: true, fontSize: 20, color: "#ffffff", align: "center", verticalAlign: "middle",
    });
    next.addComponent(engine.components.Interactable, { width: 120, height: 44 });
    next.addComponent(engine.components.Opacity, { value: 1 });
  }
}

function spawnPickerPage(engine, run, kind, page) {
  clearPickerCardEntities(engine);
  const layout = computePickerLayout(engine);
  const pageCount = Math.max(1, Math.ceil(run.deck.length / layout.pageSize));
  const clampedPage = Math.max(0, Math.min(page, pageCount - 1));
  engine.state.shop.picker.page = clampedPage;

  const vp = engine.getViewportSize();
  const start = clampedPage * layout.pageSize;
  const pageCards = run.deck.slice(start, start + layout.pageSize);
  const entities = [];

  pageCards.forEach((card, i) => {
    const def = CARD_DEFS[card.defId];
    const id = `picker_${i}`;
    const eligible = kind !== "upgrade" || card.level < MAX_CARD_LEVEL;
    const ent = engine.prefabs.instantiate("Card", {
      Transform: { x: vp.width / 2, y: vp.height / 2, zIndex: 20 + i },
      ShapeRenderer: { color: def.color },
      SpriteRenderer: { frame: borderFrameForTier(def.tier) },
      Opacity: { value: eligible ? 1 : 0.35 },
      Interactable: {
        cursor: eligible ? "pointer" : "not-allowed",
        onClick: eligible ? "engine.callScript('PickDeckCard', entity, engine);" : "",
        onHoverEnter: eligible ? "engine.callScript('ShopOfferHoverEnter', entity, engine);" : "",
        onHoverExit: eligible ? "engine.callScript('ShopOfferHoverExit', entity, engine);" : "",
      },
      children: {
        icon: cardIconOverride(def.id, def.icon),
        name: { TextRenderer: { text: card.level > 1 ? `${def.name} +${card.level - 1}` : def.name } },
        desc: { TextRenderer: { text: formatDescription(def, card.level) } },
        levelIcon: { SpriteRenderer: { frame: levelIconFrame(card.level), width: card.level > 1 ? 22 : 0, height: card.level > 1 ? 22 : 0 } },
        badgeText: { TextRenderer: { text: eligible ? "" : "MAX" } },
      },
    }, id);
    if (!ent) return;
    // Real index into run.deck, not the page-local `i` — pagination only
    // changes what's SHOWN, pickDeckCard still needs to resolve against the
    // full deck regardless of which page the picked card was on.
    ent.state.deckIndex = start + i;
    entities.push(ent);
  });

  layoutCardGridPage(engine, entities, layout, { topMargin: PICKER_TOP_MARGIN, bottomMargin: PICKER_BOTTOM_MARGIN, scale: PICKER_CARD_SCALE });

  const labelEnt = engine.getEntity("pickerPageLabel");
  const labelTr = labelEnt && labelEnt.getComponent("TextRenderer");
  if (labelTr) labelTr.text = `Page ${clampedPage + 1} / ${pageCount}`;

  setPagerButton(engine, "pickerPrevBtn", clampedPage > 0, prevPickerPage);
  setPagerButton(engine, "pickerNextBtn", clampedPage < pageCount - 1, nextPickerPage);
}

function nextPickerPage(entity, engine) {
  const shop = engine.state.shop;
  const run = engine.state.run;
  if (!shop || !run || !shop.picker) return;
  playSound(engine, "click");
  spawnPickerPage(engine, run, shop.picker.kind, shop.picker.page + 1);
}

function prevPickerPage(entity, engine) {
  const shop = engine.state.shop;
  const run = engine.state.run;
  if (!shop || !run || !shop.picker) return;
  playSound(engine, "click");
  spawnPickerPage(engine, run, shop.picker.kind, shop.picker.page - 1);
}

// Dims the shop behind the picker (a translucent overlay, same recipe as
// BattleController.js's vignetteOverlay) and turns off the HUD labels +
// Continue button while it's open — before this, the title/coins/deck-count
// text and the Continue button just sat there fully visible/clickable
// behind the picker, competing with it for attention (and Continue could
// still be clicked through to leave the shop mid-pick).
const PICKER_OVERLAY_ALPHA = 0.82;
const PICKER_HIDDEN_HUD_IDS = ["shopTitle", "shopCurrency", "shopDeckCount", "shopBuildTags"];

function setShopChromeHidden(engine, hidden) {
  const overlay = engine.getEntity("pickerOverlay");
  const overlayOp = overlay && overlay.getComponent("Opacity");
  const overlayAnim = overlay && overlay.getComponent("Animator");
  if (overlayOp && overlayAnim) {
    overlayAnim.animate(overlayOp, "value", hidden ? PICKER_OVERLAY_ALPHA : 0, { duration: 0.2, easing: "easeOut" });
  }

  for (const id of PICKER_HIDDEN_HUD_IDS) {
    const ent = engine.getEntity(id);
    const op = ent && ent.getComponent("Opacity");
    if (op) op.value = hidden ? 0 : 1;
  }

  const btn = engine.getEntity("continueBtn");
  const btnOp = btn && btn.getComponent("Opacity");
  const btnInteract = btn && btn.getComponent("Interactable");
  if (btnOp) btnOp.value = hidden ? 0 : 1;
  if (btnInteract) {
    // Interactable hit-testing isn't gated by Opacity (see Interactable.js)
    // — clear onClick while hidden too, or Continue would stay clickable
    // through the invisible button. A raw string here is never compiled
    // into a callable (that only happens for onClick passed through the
    // Interactable constructor, see compileCode) — restore the real
    // imported ShopContinue function directly instead.
    btnInteract.onClick = hidden ? null : ShopContinue;
    btnInteract.cursor = hidden ? "default" : "pointer";
  }
}

function enterPicker(engine, shop, run, idx, kind) {
  if (kind === "remove" && run.deck.length <= 5) { flashDenied(engine, idx, "Deck too small"); return; }
  if (kind === "upgrade" && !run.deck.some((c) => c.level < MAX_CARD_LEVEL)) { flashDenied(engine, idx, "All cards maxed"); return; }

  shop.picker = { kind, offerIdx: idx, page: 0 };
  setOffersHidden(engine, shop, true);
  setShopChromeHidden(engine, true);
  spawnPickerChrome(engine, kind);
  spawnPickerPage(engine, run, kind, 0);
}

function exitPicker(engine, shop) {
  clearPickerCardEntities(engine);
  if (engine.getEntity("pickerHint")) engine.removeEntity("pickerHint");
  if (engine.getEntity("pickerCancelBtn")) engine.removeEntity("pickerCancelBtn");
  if (engine.getEntity("pickerPrevBtn")) engine.removeEntity("pickerPrevBtn");
  if (engine.getEntity("pickerPageLabel")) engine.removeEntity("pickerPageLabel");
  if (engine.getEntity("pickerNextBtn")) engine.removeEntity("pickerNextBtn");
  setOffersHidden(engine, shop, false);
  setShopChromeHidden(engine, false);
  shop.picker = null;
}

export function cancelPicker(entity, engine) {
  const shop = engine.state.shop;
  if (!shop || !shop.picker) return;
  playSound(engine, "click");
  exitPicker(engine, shop);
}

export function pickDeckCard(entity, engine) {
  const shop = engine.state.shop;
  const run = engine.state.run;
  if (!shop || !run || !shop.picker) return;
  const { kind, offerIdx } = shop.picker;
  const offer = shop.offers[offerIdx];
  const card = run.deck[entity.state.deckIndex];
  if (!offer || !card) return;

  playSound(engine, "click");

  const def = CARD_DEFS[card.defId];
  let badgeLabel, popupText, popupColor;
  if (kind === "upgrade") {
    if (card.level >= MAX_CARD_LEVEL) return; // ineligible cards have no onClick, but guard anyway
    card.level += 1;
    badgeLabel = "UPGRADED!";
    popupColor = "#ffb020";
    popupText = `${def.name} → Lv${card.level}`;
  } else {
    run.deck.splice(entity.state.deckIndex, 1);
    badgeLabel = "REMOVED";
    popupColor = "#f87171";
    popupText = `-${def.name}`;
  }

  run.currency -= offer.price;
  offer.bought = true;
  finishPurchase(engine, offerIdx, badgeLabel, popupText, popupColor, entity);
  exitPicker(engine, shop);
}

export function buyOffer(entity, engine) {
  const shop = engine.state.shop;
  const run = engine.state.run;
  if (!shop || !run || shop.picker) return; // ignore offer clicks while a picker is open
  const idx = entity.state.offerIndex;
  const offer = shop.offers[idx];
  if (!offer || offer.bought) return;
  playSound(engine, "click");
  if (run.currency < offer.price) { flashDenied(engine, idx, "Not enough coins"); return; }

  if (offer.kind === "card") {
    run.currency -= offer.price;
    offer.bought = true;
    run.deck.push({ defId: offer.defId, level: 1 });
    finishPurchase(engine, idx, "SOLD", `+${CARD_DEFS[offer.defId].name}`, "#ffd76a", entity);
    return;
  }

  enterPicker(engine, shop, run, idx, offer.kind);
}

// Counts the currency label up from `from` to run.currency over `duration`
// instead of it just snapping straight to the final number on arrival —
// ticked from ShopController's own per-frame tick below since there's no
// need to route a plain number through the Animator component for this.
function startCurrencyCountUp(entity, engine, run, from, duration = 0.7) {
  entity.state.currencyCountUp = { from, to: run.currency, elapsed: 0, duration };
  // updateShopHud (called just before this) already set the label to the
  // final value — reset it to `from` right away so the very first frame
  // doesn't flash the end number before the count-up even starts.
  const cur = engine.getEntity("shopCurrency");
  const curTr = cur && cur.getComponent("TextRenderer");
  if (curTr) curTr.text = `Coins: ${from}`;
}

function tickCurrencyCountUp(entity, engine, run, dt) {
  const c = entity.state.currencyCountUp;
  if (!c) return;
  c.to = run.currency; // re-synced every tick so a purchase mid-count-up (spending) isn't overwritten once this finishes
  c.elapsed += dt;
  const t = Math.min(1, c.elapsed / c.duration);
  const shown = Math.round(c.from + (c.to - c.from) * t);
  const cur = engine.getEntity("shopCurrency");
  const curTr = cur && cur.getComponent("TextRenderer");
  if (curTr) curTr.text = `Coins: ${shown}`;
  if (t >= 1) entity.state.currencyCountUp = null;
}

export function ShopController(entity, engine, dt) {
  const run = ensureRun(engine);
  let shop = engine.state.shop;
  if (!shop) {
    shop = engine.state.shop = { offers: generateOffers(run), picker: null };
    spawnOffers(engine, shop);
    updateShopHud(engine);
    if (run.lastEarned) {
      startCurrencyCountUp(entity, engine, run, run.currency - run.lastEarned);
      run.lastEarned = 0;
    }
  }
  tickCurrencyCountUp(entity, engine, run, dt);
}
