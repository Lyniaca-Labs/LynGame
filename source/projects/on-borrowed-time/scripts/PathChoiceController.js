// PathChoiceController
// Runs the "pathchoice" scene shown after every round win instead of always
// going straight to the shop — three tradeoff options, each wrapped by its
// own thin callScript file (PathChoiceShop.js etc — see PlayHandCard.js's
// header comment for why engine.callScript needs a dedicated file per
// action rather than just naming the function on the click handler).

import { ensureRun } from "./RunState.js";

export function PathChoiceController(entity, engine, dt) {
  const run = ensureRun(engine);
  const deckCount = engine.getEntity("pathChoiceDeckCount");
  const tr = deckCount && deckCount.getComponent("TextRenderer");
  if (tr) tr.text = `Deck: ${run.deck.length} cards`;
}

export function chooseShop(entity, engine) {
  engine.loadScene("shop");
}

// engine.state.battle survives loadScene() (only entities get torn down —
// see RunState.js's header comment), so skipping the shop means clearing it
// ourselves here, same as the shop scene's own Continue button does. Without
// this, BattleController would see the stale roundOver battle from the
// fight that just ended and immediately try to re-transition, bouncing
// straight back to this scene instead of starting the next fight.
export function chooseElite(entity, engine) {
  const run = ensureRun(engine);
  run.eliteNext = true;
  engine.state.battle = null;
  engine.loadScene("main");
}

export function chooseRest(entity, engine) {
  const run = ensureRun(engine);
  const candidates = run.deck.filter((c) => c.level < 3);
  if (candidates.length) {
    candidates[Math.floor(Math.random() * candidates.length)].level += 1;
  }
  engine.state.battle = null;
  engine.loadScene("main");
}
