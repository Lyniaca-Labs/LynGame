// PathChoiceController
// Runs the "pathchoice" scene shown after every round win. PERKS holds the
// full pool (10); each visit randomly draws 2-3 of them (see pickPerkIndices) so
// the player sees a fresh, focused choice each round instead of the whole
// pool at once. The shop is no longer one of the choices itself — every
// perk applies its effect and then heads straight to the shop.

import { ensureRun } from "./RunState.js";
import { CARD_DEFS, MAX_CARD_LEVEL } from "./CardDatabase.js";
import { clickThenLoadScene } from "./SoundEffects.js";

const OPTION_SPACING = 210;

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
const PERKS = [
  {
    id: "elite", name: "Elite Fight", color: "#5a1e1e",
    desc: "Your next fight is tougher — +50% coin reward for winning it.",
    apply(run) { run.eliteNext = true; },
  },
  {
    id: "rest", name: "Rest & Recover", color: "#1e3a5f",
    desc: "Freely upgrade one random card in your deck.",
    apply(run) {
      const c = randomEligibleCard(run);
      if (c) c.level += 1;
    },
  },
  {
    id: "bounty", name: "Bounty", color: "#5b4a1e",
    desc: "Find a stash of coins.",
    apply(run) { run.currency += 10 + run.round * 2; },
  },
  {
    id: "windfall", name: "Windfall", color: "#5b4a1e",
    desc: "Cash in — gain 20% of your current coins as a bonus.",
    apply(run) { run.currency += Math.round(run.currency * 0.2); },
  },
  {
    id: "quickStudy", name: "Quick Study", color: "#1e3a5f",
    desc: "Upgrade two random cards in your deck.",
    apply(run) {
      for (let i = 0; i < 2; i++) {
        const c = randomEligibleCard(run);
        if (c) c.level += 1;
      }
    },
  },
  {
    id: "cull", name: "Cull the Weak", color: "#5b1e1e",
    desc: "Remove a random basic card from your deck for free.",
    apply(run) {
      if (run.deck.length <= 5) return;
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      const pool = basics.length ? basics : run.deck;
      const target = pool[Math.floor(Math.random() * pool.length)];
      const i = run.deck.indexOf(target);
      if (i !== -1) run.deck.splice(i, 1);
    },
  },
  {
    id: "discount", name: "Bulk Discount", color: "#374151",
    desc: "Your next shop's Upgrade and Remove offers cost 30% less.",
    apply(run) { run.shopDiscount = Math.min(0.6, (run.shopDiscount || 0) + 0.3); },
  },
  {
    id: "freeSample", name: "Free Sample", color: "#14532d",
    desc: "Add a free basic card to your deck.",
    apply(run) {
      const ids = tier1Ids();
      const defId = ids[Math.floor(Math.random() * ids.length)];
      run.deck.push({ defId, level: 1 });
    },
  },
  {
    id: "hoarder", name: "Hoarder's Luck", color: "#5b4a1e",
    desc: "Your next shop offers one extra card.",
    apply(run) { run.extraShopOffer = true; },
  },
  {
    id: "reroll", name: "Second Chance", color: "#4a1942",
    desc: "Reroll one basic card in your deck into a random better one.",
    apply(run) {
      const basics = run.deck.filter((c) => CARD_DEFS[c.defId].tier === 1);
      if (!basics.length) return;
      const better = Object.values(CARD_DEFS).filter((d) => d.tier > 1);
      if (!better.length) return;
      const target = basics[Math.floor(Math.random() * basics.length)];
      target.defId = better[Math.floor(Math.random() * better.length)].id;
      target.level = 1;
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
        onHoverEnter: "var anim=entity.getComponent('Animator'); var t=entity.getComponent('Transform'); entity.state.baseY = entity.state.baseY ?? t.y; anim.animate(t, 'y', entity.state.baseY - 10, { duration: 0.14, easing: 'easeOut' });",
        onHoverExit: "var anim=entity.getComponent('Animator'); var t=entity.getComponent('Transform'); anim.animate(t, 'y', entity.state.baseY, { duration: 0.16, easing: 'easeOut' });",
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

export function PathChoiceController(entity, engine, dt) {
  const run = ensureRun(engine);
  const deckCount = engine.getEntity("pathChoiceDeckCount");
  const tr = deckCount && deckCount.getComponent("TextRenderer");
  if (tr) tr.text = `Deck: ${run.deck.length} cards`;

  if (!engine.getEntity("pathOption_0")) {
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
export function choosePerk(entity, engine) {
  const run = ensureRun(engine);
  const perk = PERKS[entity.state.perkIndex];
  if (!perk) return;
  perk.apply(run);
  engine.state.battle = null;
  clickThenLoadScene(engine, "shop");
}
