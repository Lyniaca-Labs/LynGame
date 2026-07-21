

export function InputScript(entity, engine, dt) {
  
  const JUMP_FORCE = 500;       // instantaneous velocity set on jump
  const FAST_FALL_MULTIPLIER = 2.5; // extra downward force while S is held and falling

  const movement = entity.getComponent("Movement");
  if (!movement) return;

  // --- horizontal movement ---
  let dx = 0;
  if (engine.input.isKeyDown("KeyA")) dx -= 1;
  if (engine.input.isKeyDown("KeyD")) dx += 1;

  if (dx !== 0) {
    movement.accelerateInDirection(dx, 0);
  }

  // --- jump (W) ---
  // no ground detection yet, so this only prevents holding W from jumping
  // every frame — it does NOT stop mid-air jumping. Revisit once collision
  // exists and you can check "grounded" here instead.
  const jumpPressed = engine.input.isKeyDown("KeyW");
  if (jumpPressed && !entity.state.wasJumpKeyDown) {
    movement.velocity.y = -JUMP_FORCE; // instant upward velocity, negative = up
  }
  entity.state.wasJumpKeyDown = jumpPressed;

  // --- fast fall (S) ---
  // only applies extra downward pull while already falling, so it doesn't
  // yank the entity down while it's still moving upward from a jump
  if (engine.input.isKeyDown("KeyS") && movement.velocity.y > 0) {
    movement.applyForce(0, movement.gravity * movement.mass * FAST_FALL_MULTIPLIER);
  }
}