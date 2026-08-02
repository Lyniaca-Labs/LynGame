// PerkHoverExit
// Hover handler wired onto each pathchoice scene option tile (see
// PathChoiceController.js's spawnOptions). Invoked via
// engine.callScript('PerkHoverExit', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { perkHoverExit } from "./PathChoiceController.js";

export function PerkHoverExit(entity, engine) {
  perkHoverExit(entity, engine);
}
