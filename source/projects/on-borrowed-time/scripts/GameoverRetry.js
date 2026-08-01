// GameoverRetry
// Click handler wired onto the gameover scene's "Try Again" button. Invoked
// via engine.callScript('GameoverRetry', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { clickThenLoadScene } from "./SoundEffects.js";

export function GameoverRetry(entity, engine) {
  engine.state.run = null;
  engine.state.battle = null;
  clickThenLoadScene(engine, "main");
}
