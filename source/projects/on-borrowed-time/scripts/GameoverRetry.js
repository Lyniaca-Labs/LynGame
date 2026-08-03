// GameoverRetry
// Click handler wired onto the gameover scene's "Main Menu" button. Invoked
// via engine.callScript('GameoverRetry', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.
//
// Goes back to "menu" rather than straight into a new fight — run/battle
// are still cleared here (not left for the menu's Play button to do) so
// whichever path the player takes from the menu starts from a genuinely
// fresh run, same as it always has.

import { clickThenLoadScene } from "./SoundEffects.js";

export function GameoverRetry(entity, engine) {
  engine.state.run = null;
  engine.state.battle = null;
  clickThenLoadScene(engine, "menu", 450);
}
