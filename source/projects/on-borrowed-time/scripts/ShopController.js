// ShopController
// Runs the post-round shop scene: 3 random new-card offers + an "Upgrade"
// and a "Remove" offer, all purchasable with the coins earned from last
// round's leftover time (engine.state.run.currency). Also exports buyOffer
// for BuyOffer.js (the per-offer click handler) to call into.

import { CARD_DEFS, SHOP_POOL, formatDescription } from "./CardDatabase.js";
import { ensureRun } from "./RunState.js";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateOffers(run) {
  const pool = shuffle(SHOP_POOL);
  const offers = [];
  for (let i = 0; i < 3 && i < pool.length; i++) {
    const defId = pool[i];
    offers.push({ kind: "card", defId, price: CARD_DEFS[defId].price, bought: false });
  }
  offers.push({ kind: "upgrade", price: 16 + run.round * 3, bought: false });
  offers.push({ kind: "remove", price: 10 + run.round * 2, bought: false });
  return offers;
}

function offerVisual(offer) {
  if (offer.kind === "card") {
    const def = CARD_DEFS[offer.defId];
    return { color: def.color, icon: def.icon, name: def.name, desc: formatDescription(def, 1) };
  }
  if (offer.kind === "upgrade") {
    return { color: "#5b4a1e", icon: "#ffb020", name: "Upgrade", desc: "Upgrade a random owned card (+50% power)." };
  }
  return { color: "#5b1e1e", icon: "#ef4444", name: "Remove", desc: "Remove a random basic card from your deck." };
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

function markPurchased(engine, idx) {
  const ent = engine.getEntity(`offer_${idx}`);
  if (!ent) return;
  const anim = ent.getComponent("Animator");
  const op = ent.getComponent("Opacity");
  const it = ent.getComponent("Interactable");
  if (it) it.onClick = "";
  const badgeTextEnt = ent.getChild("badgeText");
  if (badgeTextEnt) {
    const tr = badgeTextEnt.getComponent("TextRenderer");
    if (tr) tr.text = "SOLD";
  }
  if (anim && op) anim.animate(op, "value", 0.35, { duration: 0.3 });
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
  if (run.currency < offer.price) { flashDenied(engine, idx); return; }

  run.currency -= offer.price;
  offer.bought = true;

  if (offer.kind === "card") {
    run.deck.push({ defId: offer.defId, level: 1 });
  } else if (offer.kind === "upgrade") {
    const candidates = run.deck.filter((c) => c.level < 3);
    if (candidates.length) candidates[Math.floor(Math.random() * candidates.length)].level += 1;
  } else if (offer.kind === "remove") {
    if (run.deck.length > 5) {
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      const pool = basics.length ? basics : run.deck;
      const target = pool[Math.floor(Math.random() * pool.length)];
      const i2 = run.deck.indexOf(target);
      if (i2 !== -1) run.deck.splice(i2, 1);
    }
  }

  markPurchased(engine, idx);
  updateShopHud(engine);
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
