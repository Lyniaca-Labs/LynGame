// MenuCardDirectory
// Click handler wired onto the menu scene's "Card Directory" button.
// Invoked via engine.callScript('MenuCardDirectory', entity, engine) —
// callScript forwards args as-is, so engine must be passed explicitly.

import { clickThenLoadScene } from "./SoundEffects.js";

export function MenuCardDirectory(entity, engine) {
  engine.state.cardDirectoryReturn = "menu";
  clickThenLoadScene(engine, "carddirectory", 450);
}
