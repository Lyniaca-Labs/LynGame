// ButtonHoverExit
// Hover handler wired onto plain menu/nav buttons' Interactable (menu,
// tutorial, card directory, gameover scenes). Invoked via
// engine.callScript('ButtonHoverExit', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { animateButtonHover } from "./ButtonHover.js";

export function ButtonHoverExit(entity, engine) {
  animateButtonHover(entity, 1);
}
