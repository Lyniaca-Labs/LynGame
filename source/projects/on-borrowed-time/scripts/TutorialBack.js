// TutorialBack
// Click handler wired onto the tutorial scene's Back button (blank onClick
// while on step 0 — see TutorialController.js's layout()). Invoked via
// engine.callScript('TutorialBack', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { prevStep } from "./TutorialController.js";

export function TutorialBack(entity, engine) {
  prevStep(entity, engine);
}
