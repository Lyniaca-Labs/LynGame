// ShopController
// Runs the post-round shop scene: 3 random new-card offers + an "Upgrade"
// and a "Remove" offer, all purchasable with the coins earned from last
// round's leftover time (engine.state.run.currency). Also exports buyOffer
// for BuyOffer.js (the per-offer click handler) to call into.

import { CARD_DEFS, SHOP_POOL, formatDescription, LEVEL_POWER_SCALE, MAX_CARD_LEVEL, borderFrameForTier } from "./CardDatabase.js";
import { ensureRun } from "./RunState.js";
import { playSound } from "./SoundEffects.js";

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
  offers.push({ kind: "upgrade", price: Math.round((16 + run.round * 3) * (1 - discount)), bought: false });
  offers.push({ kind: "remove", price: Math.round((10 + run.round * 2) * (1 - discount)), bought: false });
  run.extraShopOffer = false;
  run.shopDiscount = 0;
  return offers;
}

function offerVisual(offer) {
  if (offer.kind === "card") {
    const def = CARD_DEFS[offer.defId];
    return { color: def.color, icon: def.icon, name: def.name, desc: formatDescription(def, 1), tier: def.tier };
  }
  if (offer.kind === "upgrade") {
    return { color: "#5b4a1e", icon: "#ffb020", name: "Upgrade", desc: `Upgrade a random owned card (+${Math.round(LEVEL_POWER_SCALE * 100)}% power).`, tier: 1 };
  }
  return { color: "#5b1e1e", icon: "#ef4444", name: "Remove", desc: "Remove a random basic card from your deck.", tier: 1 };
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
        onHoverEnter: "const a=entity.getComponent('Animator'); const t=entity.getComponent('Transform'); entity.state.baseY = entity.state.baseY ?? t.y; a.animate(t,'y', entity.state.baseY - 16, {duration:0.12, easing:'easeOut'});",
        onHoverExit: "const a=entity.getComponent('Animator'); const t=entity.getComponent('Transform'); a.animate(t,'y', entity.state.baseY, {duration:0.12, easing:'easeOut'});",
      },
      children: {
        icon: { ShapeRenderer: { color: v.icon } },
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

function updateShopHud(engine) {
  const run = engine.state.run;
  const cur = engine.getEntity("shopCurrency");
  const curTr = cur && cur.getComponent("TextRenderer");
  if (curTr) curTr.text = `Coins: ${run.currency}`;
  const deck = engine.getEntity("shopDeckCount");
  const deckTr = deck && deck.getComponent("TextRenderer");
  if (deckTr) deckTr.text = `Deck: ${run.deck.length} cards`;
}

function markPurchased(engine, idx, label = "SOLD") {
  const ent = engine.getEntity(`offer_${idx}`);
  if (!ent) return;
  const anim = ent.getComponent("Animator");
  const op = ent.getComponent("Opacity");
  const it = ent.getComponent("Interactable");
  if (it) it.onClick = "";
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

function flashDenied(engine, idx) {
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
}

export function buyOffer(entity, engine) {
  const shop = engine.state.shop;
  const run = engine.state.run;
  if (!shop || !run) return;
  const idx = entity.state.offerIndex;
  const offer = shop.offers[idx];
  if (!offer || offer.bought) return;
  playSound(engine, "click");
  if (run.currency < offer.price) { flashDenied(engine, idx); return; }

  run.currency -= offer.price;
  offer.bought = true;

  let badgeLabel = "SOLD";
  let popupText = "Bought!";
  let popupColor = "#ffd76a";

  if (offer.kind === "card") {
    run.deck.push({ defId: offer.defId, level: 1 });
    popupText = `+${CARD_DEFS[offer.defId].name}`;
  } else if (offer.kind === "upgrade") {
    const candidates = run.deck.filter((c) => c.level < MAX_CARD_LEVEL);
    if (candidates.length) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      target.level += 1;
      badgeLabel = "UPGRADED!";
      popupColor = "#ffb020";
      popupText = `${CARD_DEFS[target.defId].name} → Lv${target.level}`;
    } else {
      popupText = "No card to upgrade";
    }
  } else if (offer.kind === "remove") {
    badgeLabel = "REMOVED";
    popupColor = "#f87171";
    popupText = "Deck too small";
    if (run.deck.length > 5) {
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      const pool = basics.length ? basics : run.deck;
      const target = pool[Math.floor(Math.random() * pool.length)];
      const i2 = run.deck.indexOf(target);
      if (i2 !== -1) {
        run.deck.splice(i2, 1);
        popupText = `-${CARD_DEFS[target.defId].name}`;
      }
    }
  }

  markPurchased(engine, idx, badgeLabel);
  updateShopHud(engine);
  punchBadge(engine, idx);

  // Reposition the shared burst emitter onto the purchased card (it has no
  // Anchor of its own — see shop.json — so this sticks until next trigger)
  // so the particles/upgrade badge read as coming from that specific card
  // instead of always firing from screen-center.
  const offerEnt = engine.getEntity(`offer_${idx}`);
  const t = offerEnt && offerEnt.getComponent("Transform");
  if (t) {
    spawnFloatText(engine, t.x, t.y - 96, popupText, popupColor);
    const burstEnt = engine.getEntity("shopBurst");
    const burstT = burstEnt && burstEnt.getComponent("Transform");
    if (burstT) { burstT.x = t.x; burstT.y = t.y; }
  }
  engine.query("shopBurst:Emitter")?.trigger();
}

export function ShopController(entity, engine, dt) {
  const run = ensureRun(engine);
  let shop = engine.state.shop;
  if (!shop) {
    shop = engine.state.shop = { offers: generateOffers(run) };
    spawnOffers(engine, shop);
    updateShopHud(engine);
  }
}
