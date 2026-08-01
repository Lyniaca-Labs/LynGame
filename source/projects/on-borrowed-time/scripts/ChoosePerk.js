// ChoosePerk
// Click handler wired onto each pathchoice scene option tile (see
// PathChoiceController.js's spawnOptions). Invoked via
// engine.callScript('ChoosePerk', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { choosePerk } from "./PathChoiceController.js";

export function ChoosePerk(entity, engine) {
  choosePerk(entity, engine);
}
