// RunState
// Persistent (across scene loads, within one run) state helpers, stored on
// engine.state.run — engine.state itself survives loadScene(), only the
// entities get torn down, so this is the right place for anything that must
// outlive the battle/shop/gameover scene transitions.

import { STARTER_DECK } from "./CardDatabase.js";
import { recordRunStart, addLifetimeCurrency } from "./MetaState.js";

export function initRun(engine) {
  engine.state.run = {
    deck: STARTER_DECK.map((defId) => ({ defId, level: 1 })),
    currency: 0,
    round: 1,
    aiLevel: 0,
    // Set by PathChoiceController's "Elite Fight" option, consumed once by
    // BattleController.js's initBattle (boosted aiLevel for that one fight)
    // and cleared immediately after so it never lingers past its round.
    eliteNext: false,
    // Set by PathChoiceController's "Vitality" perk — unlike eliteNext, this
    // is NOT one-shot: it stays added to the player's base max time
    // (BattleController.js's initBattle) for every fight for the rest of
    // the run, and stacks if picked more than once.
    maxTimeBonus: 0,
  };
  engine.state.battle = null;
  recordRunStart(engine); // covers first Play and every Retry — this is the one choke point both go through
  return engine.state.run;
}

export function ensureRun(engine) {
  if (!engine.state.run) return initRun(engine);
  return engine.state.run;
}

// Every currency GAIN (round-win rewards, Bounty/Windfall perks) should go
// through here instead of `run.currency +=` directly — keeps MetaState's
// lifetime total (a cross-run stat, see gameover's recap) in lockstep
// without every earn site having to remember to touch it separately.
// Spending (shop purchases) doesn't call this — lifetime tracks earned, not
// net — so those still just do `run.currency -=` directly.
export function addCurrency(engine, run, amount) {
  run.currency += amount;
  addLifetimeCurrency(engine, amount);
}

export function RunState() {}
