// TutorialSkip
// Click handler wired onto the tutorial scene's Skip button. Invoked via
// engine.callScript('TutorialSkip', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { skip } from "./TutorialController.js";

export function TutorialSkip(entity, engine) {
  skip(entity, engine);
}
