export function spawnEnemies(entity, engine, dt) {

  const transform = entity.getComponent("Transform");
  if(!transform) return;

  if(Math.random() < 0.1) {

    engine.prefabs.instantiate("Enemy", {
      Transform: { x: Math.random() * 200 - 100 + transform.x, y: Math.random() * 200 - 100 + transform.y },
    });

  }
  
}