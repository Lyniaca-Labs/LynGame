import { Transform } from "../../engine/components/Transform.js";
const LG = window.LG;

const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

const SPEED = 200; // px/sec

export function InputScript(entity, engine, dt) {
  const transform = entity.getComponent(Transform);
  if (!transform) return;

  if (keys["ArrowLeft"]) transform.x -= SPEED * dt;
  if (keys["ArrowRight"]) transform.x += SPEED * dt;
  if (keys["ArrowUp"]) transform.y -= SPEED * dt;
  if (keys["ArrowDown"]) transform.y += SPEED * dt;
}