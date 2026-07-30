export function LogScript(entity, engine, dt) {
  const animator = entity.getComponent("Animator")
  if(animator) {
    animator.play("test");
  }
  if (!entity._loggedSpawn) {
    console.log(`[LogScript] ${entity.id} spawned...`);
    entity._loggedSpawn = true;
  } 
}  