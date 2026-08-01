// PathChoiceShop
// Click handler wired onto the pathchoice scene's "Shop" option. Invoked via
// engine.callScript('PathChoiceShop', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { chooseShop } from "./PathChoiceController.js";

export function PathChoiceShop(entity, engine) {
  chooseShop(entity, engine);
}
