export function LogScript(entity, engine, dt) {
  if (!entity._loggedSpawn) {
    console.log(`[LogScript] ${entity.id} spawned...`);
    entity._loggedSpawn = true;
  }
}