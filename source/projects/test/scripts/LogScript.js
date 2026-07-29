export function LogScript(entity, engine, dt) {
  entity.getComponent("Animator").play("test");
  if (!entity._loggedSpawn) {
    console.log(`[LogScript] ${entity.id} spawned...`);
    entity._loggedSpawn = true;
  } 
}  