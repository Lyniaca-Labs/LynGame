// TutorialNext
// Click handler wired onto the tutorial scene's Next/Start-Fight button.
// Invoked via engine.callScript('TutorialNext', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { nextStep } from "./TutorialController.js";

export function TutorialNext(entity, engine) {
  nextStep(entity, engine);
}
