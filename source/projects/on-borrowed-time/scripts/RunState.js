// RunState
// Persistent (across scene loads, within one run) state helpers, stored on
// engine.state.run — engine.state itself survives loadScene(), only the
// entities get torn down, so this is the right place for anything that must
// outlive the battle/shop/gameover scene transitions.

import { STARTER_DECK } from "./CardDatabase.js";

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
  };
  engine.state.battle = null;
  return engine.state.run;
}

export function ensureRun(engine) {
  if (!engine.state.run) return initRun(engine);
  return engine.state.run;
}

export function RunState() {}
