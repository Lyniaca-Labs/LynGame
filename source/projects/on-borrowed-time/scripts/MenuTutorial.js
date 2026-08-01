// MenuTutorial
// Click handler wired onto the menu scene's "Tutorial" button. Invoked via
// engine.callScript('MenuTutorial', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { clickThenLoadScene } from "./SoundEffects.js";

export function MenuTutorial(entity, engine) {
  clickThenLoadScene(engine, "tutorial");
}
