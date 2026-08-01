// PathChoiceRest
// Click handler wired onto the pathchoice scene's "Rest" option. Invoked via
// engine.callScript('PathChoiceRest', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { chooseRest } from "./PathChoiceController.js";

export function PathChoiceRest(entity, engine) {
  chooseRest(entity, engine);
}
