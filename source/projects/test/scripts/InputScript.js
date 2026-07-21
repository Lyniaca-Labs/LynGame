export function InputScript(entity, engine, dt) {
  const movement = entity.getComponent("Movement");
  if (!movement) return;

  let dx = 0, dy = 0;
  if (engine.input.isKeyDown("KeyW")) dy -= 1;
  if (engine.input.isKeyDown("KeyS")) dy += 1;
  if (engine.input.isKeyDown("KeyA")) dx -= 1;
  if (engine.input.isKeyDown("KeyD")) dx += 1;

  const len = Math.hypot(dx, dy);
  if (len > 0) {
    movement.setVelocity((dx / len) * movement.maxSpeed, (dy / len) * movement.maxSpeed);
  } else {
    movement.stop();
  }
}