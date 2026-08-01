// PathChoiceElite
// Click handler wired onto the pathchoice scene's "Elite Fight" option.
// Invoked via engine.callScript('PathChoiceElite', entity, engine) —
// callScript forwards args as-is, so engine must be passed explicitly.

import { chooseElite } from "./PathChoiceController.js";

export function PathChoiceElite(entity, engine) {
  chooseElite(entity, engine);
}
