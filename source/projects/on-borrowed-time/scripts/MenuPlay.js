// MenuPlay
// Click handler wired onto the menu scene's "Play" button. Invoked via
// engine.callScript('MenuPlay', entity, engine) — callScript forwards args
// as-is, so engine must be passed explicitly.

import { clickThenLoadScene } from "./SoundEffects.js";

export function MenuPlay(entity, engine) {
  clickThenLoadScene(engine, "main", 450);
}
