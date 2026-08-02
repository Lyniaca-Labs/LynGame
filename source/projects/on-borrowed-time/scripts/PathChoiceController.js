// PathChoiceController
// Runs the "pathchoice" scene shown after every round win. PERKS holds the
// full pool (10); each visit randomly draws 2-3 of them (see pickPerkIndices) so
// the player sees a fresh, focused choice each round instead of the whole
// pool at once. The shop is no longer one of the choices itself — every
// perk applies its effect and then heads straight to the shop.

import { ensureRun, addCurrency } from "./RunState.js";
import { CARD_DEFS, MAX_CARD_LEVEL, formatBuildSummary } from "./CardDatabase.js";
import { playSound } from "./SoundEffects.js";
import { animateCardScale } from "./CardVisuals.js";

const OPTION_SPACING = 210;
const OPTION_HOVER_SCALE = 1.1;

export function perkHoverEnter(entity, engine) {
  const anim = entity.getComponent("Animator");
  const t = entity.getComponent("Transform");
  if (!anim || !t) return;
  entity.state.baseY = entity.state.baseY ?? t.y;
  anim.animate(t, "y", entity.state.baseY - 10, { duration: 0.14, easing: "easeOut" });
  animateCardScale(entity, OPTION_HOVER_SCALE);
}

export function perkHoverExit(entity, engine) {
  const anim = entity.getComponent("Animator");
  const t = entity.getComponent("Transform");
  if (!anim || !t) return;
  anim.animate(t, "y", entity.state.baseY, { duration: 0.16, easing: "easeOut" });
  animateCardScale(entity, 1);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns a random subset of indices into PERKS — 2 or 3 of them, per round.
function pickPerkIndices() {
  const count = 2 + Math.floor(Math.random() * 2);
  return shuffle(PERKS.map((_, i) => i)).slice(0, count);
}

function randomEligibleCard(run) {
  const candidates = run.deck.filter((c) => c.level < MAX_CARD_LEVEL);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function tier1Ids() {
  return Object.values(CARD_DEFS).filter((d) => d.tier === 1).map((d) => d.id);
}

// Each perk mutates `run` (and, for Elite, the one-shot eliteNext flag
// BattleController's initBattle consumes) — choosePerk always clears the
// stale battle and loads "shop" right after, regardless of which perk.
// apply() returns a short result string, shown as floating text before the
// scene transition (see choosePerk) — several of these (Rest & Recover,
// Quick Study, Cull, Free Sample, Second Chance) mutate the deck with no
// other visible effect, and used to hand off to the shop almost instantly
// with zero feedback, reading as "nothing happened" even when it worked.
const PERKS = [
  {
    id: "elite", name: "Elite Fight", color: "#5a1e1e",
    desc: "Your next fight is tougher — +50% coin reward for winning it.",
    apply(run) { run.eliteNext = true; return "Next fight is Elite (+50% coins)"; },
  },
  {
    id: "rest", name: "Rest & Recover", color: "#1e3a5f",
    desc: "Upgrade a random card in your deck at no cost.",
    apply(run) {
      const c = randomEligibleCard(run);
      if (!c) return "No eligible cards to upgrade";
      c.level += 1;
      return `${CARD_DEFS[c.defId].name} upgraded to Lv${c.level}`;
    },
  },
  // run.maxTimeBonus is a persistent, run-wide bonus — unlike Fortify/
  // Overreach (card effects that only last "for the rest of the fight"),
  // this carries over to every future fight this run since BattleController's
  // initBattle folds it into the player's base max time on every battle setup.
  {
    id: "vitality", name: "Vitality", color: "#1e3a5f",
    desc: "Permanently increase your max time by 1s for the rest of the run.",
    apply(run) {
      run.maxTimeBonus = (run.maxTimeBonus || 0) + 1;
      return "+1 max time for the rest of the run";
    },
  },
  {
    id: "bounty", name: "Bounty", color: "#5b4a1e",
    desc: "Find a stash of coins.",
    apply(run, engine) {
      const amt = 10 + run.round * 2;
      addCurrency(engine, run, amt);
      return `+${amt} coins`;
    },
  },
  {
    id: "windfall", name: "Windfall", color: "#5b4a1e",
    desc: "Cash in — gain 20% of your current coins as a bonus.",
    apply(run, engine) {
      const amt = Math.round(run.currency * 0.2);
      addCurrency(engine, run, amt);
      return `+${amt} coins`;
    },
  },
  {
    id: "quickStudy", name: "Quick Study", color: "#1e3a5f",
    desc: "Upgrade two random cards in your deck.",
    apply(run) {
      const names = [];
      for (let i = 0; i < 2; i++) {
        const c = randomEligibleCard(run);
        if (c) { c.level += 1; names.push(CARD_DEFS[c.defId].name); }
      }
      return names.length ? `Upgraded: ${names.join(", ")}` : "No eligible cards to upgrade";
    },
  },
  {
    id: "cull", name: "Cull the Weak", color: "#5b1e1e",
    desc: "Remove a random basic card from your deck for free.",
    apply(run) {
      if (run.deck.length <= 5) return "Deck too small to remove from";
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      const pool = basics.length ? basics : run.deck;
      const target = pool[Math.floor(Math.random() * pool.length)];
      const i = run.deck.indexOf(target);
      if (i === -1) return null;
      run.deck.splice(i, 1);
      return `Removed ${CARD_DEFS[target.defId].name}`;
    },
  },
  {
    id: "discount", name: "Bulk Discount", color: "#374151",
    desc: "Your next shop's Upgrade and Remove offers cost 30% less.",
    apply(run) { run.shopDiscount = Math.min(0.6, (run.shopDiscount || 0) + 0.3); return "Next shop discounted 30%"; },
  },
  {
    id: "freeSample", name: "Free Sample", color: "#14532d",
    desc: "Add a free basic card to your deck.",
    apply(run) {
      const ids = tier1Ids();
      const defId = ids[Math.floor(Math.random() * ids.length)];
      run.deck.push({ defId, level: 1 });
      return `+${CARD_DEFS[defId].name} added to deck`;
    },
  },
  {
    id: "hoarder", name: "Hoarder's Luck", color: "#5b4a1e",
    desc: "Your next shop offers one extra card.",
    apply(run) { run.extraShopOffer = true; return "Next shop has an extra offer"; },
  },
  {
    id: "reroll", name: "Second Chance", color: "#4a1942",
    desc: "Reroll one basic card in your deck into a random better one.",
    apply(run) {
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      if (!basics.length) return "No basic cards to reroll";
      const better = Object.values(CARD_DEFS).filter((d) => d.tier > 1);
      if (!better.length) return null;
      const target = basics[Math.floor(Math.random() * basics.length)];
      const oldName = CARD_DEFS[target.defId].name;
      const newDef = better[Math.floor(Math.random() * better.length)];
      target.defId = newDef.id;
      target.level = 1;
      return `${oldName} → ${newDef.name}`;
    },
  },
];

function spawnOptions(engine) {
  const vp = engine.getViewportSize();
  const centerX = vp.width / 2, centerY = vp.height / 2 + 20;
  const indices = pickPerkIndices();
  const entities = [];

  indices.forEach((perkIndex, i) => {
    const perk = PERKS[perkIndex];
    const id = `pathOption_${i}`;
    if (engine.getEntity(id)) engine.removeEntity(id);
    const ent = engine.prefabs.instantiate("PathOption", {
      ShapeRenderer: { color: perk.color },
      Interactable: {
        onClick: "engine.callScript('ChoosePerk', entity, engine);",
        onHoverEnter: "engine.callScript('PerkHoverEnter', entity, engine);",
        onHoverExit: "engine.callScript('PerkHoverExit', entity, engine);",
      },
      children: {
        title: { TextRenderer: { text: perk.name } },
        desc: { TextRenderer: { text: perk.desc } },
      },
    }, id);
    if (!ent) return;
    // Indexes into the full PERKS pool (not the subset shown), so
    // choosePerk resolves the right perk regardless of which 2-3 were drawn.
    ent.state.perkIndex = perkIndex;
    entities.push(ent);
  });

  engine.gui.layoutRow(entities, { centerX, centerY, spacing: OPTION_SPACING, direction: "horizontal", baseZIndex: 20 });

  // onHoverEnter's lazy `??` cache would otherwise catch whatever y layoutRow
  // just assigned only once the mouse first enters — fine normally, but set
  // it explicitly now so a hover firing before that (cursor already resting
  // on a tile when the scene loads) can't lock in a wrong base.
  for (const ent of entities) {
    ent.state.baseY = ent.getComponent("Transform").y;
  }
}

// The battle scene fades to black before transitioning here (see
// BattleController.js's fadeToBlack, called from endRound) — this fades
// the matching black "fadeOverlay" (pathchoice.json) back out on arrival so
// the transition reads as one continuous crossfade across the scene swap.
function fadeIn(engine) {
  const e = engine.getEntity("fadeOverlay");
  const op = e && e.getComponent("Opacity");
  const anim = e && e.getComponent("Animator");
  if (!op || !anim) return;
  anim.animate(op, "value", 0, { duration: 0.5, easing: "easeOut" });
}

// Same one-off "drifts up and fades" recipe as ShopController.js's
// spawnFloatText — duplicated rather than shared since each script here
// owns its own small helpers (see PROJECT_STRUCTURE.md's scripts-folder
// convention) and there's no shared utils module to hang it on yet.
function spawnFloatText(engine, x, y, text, color) {
  const id = `perkfx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  const e = engine.createEntity(id);
  if (!e) return;
  e.addComponent(engine.components.Transform, { x, y, fixed: true, zIndex: 900 });
  e.addComponent(engine.components.TextRenderer, { text, fontSize: 22, fontWeight: "700", color, align: "center" });
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

export function PathChoiceController(entity, engine, dt) {
  const run = ensureRun(engine);
  const deckCount = engine.getEntity("pathChoiceDeckCount");
  const tr = deckCount && deckCount.getComponent("TextRenderer");
  if (tr) tr.text = `Deck: ${run.deck.length} cards`;
  const tagsLabel = engine.getEntity("pathChoiceBuildTags");
  const tagsTr = tagsLabel && tagsLabel.getComponent("TextRenderer");
  if (tagsTr) tagsTr.text = formatBuildSummary(run.deck);

  if (!engine.getEntity("pathOption_0")) {
    engine.state.perkChosen = false; // fresh visit — re-arm choosePerk's double-click guard below
    spawnOptions(engine);
    fadeIn(engine);
  }
}

// engine.state.battle survives loadScene() (only entities get torn down —
// see RunState.js's header comment), so heading to the shop instead of
// straight back into a fight means clearing it ourselves here. Without
// this, BattleController would see the stale roundOver battle from the
// fight that just ended and immediately try to re-transition, bouncing
// straight back to this scene instead of the shop.
//
// Delays the actual scene load (instead of clickThenLoadScene's near-instant
// 150ms) so the result text below has time to be read — several perks (Rest
// & Recover, Quick Study, Cull, Free Sample, Second Chance) only mutate the
// deck, with no other visible effect, so vanishing into the shop immediately
// used to read as the perk having silently done nothing.
export function choosePerk(entity, engine) {
  if (engine.state.perkChosen) return; // block a second pick landing during the delay below
  const run = ensureRun(engine);
  const perk = PERKS[entity.state.perkIndex];
  if (!perk) return;
  engine.state.perkChosen = true;

  // Disable every option now, not just the clicked one, so a second click
  // during the delay can't apply a SECOND perk on top of this one.
  for (let i = 0; ; i++) {
    const opt = engine.getEntity(`pathOption_${i}`);
    if (!opt) break;
    const it = opt.getComponent("Interactable");
    if (it) { it.onClick = null; it.cursor = "default"; }
  }

  const message = perk.apply(run, engine);
  playSound(engine, "click");
  const t = entity.getComponent("Transform");
  if (t && message) spawnFloatText(engine, t.x, t.y - 100, message, "#ffe08a");

  engine.state.battle = null;
  setTimeout(() => engine.loadScene("shop"), 1100);
}
