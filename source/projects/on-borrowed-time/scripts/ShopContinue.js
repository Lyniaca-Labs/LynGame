// ShopContinue
// Click handler wired onto the shop scene's "Continue" button. Invoked via
// engine.callScript('ShopContinue', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { clickThenLoadScene } from "./SoundEffects.js";

export function ShopContinue(entity, engine) {
  engine.state.battle = null;
  clickThenLoadScene(engine, "main");
}
