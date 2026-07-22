export function spawnEnemies(entity, engine, dt) {

  if(Math.random() < 0.1) {

    engine.prefabs.instantiate("Enemy", {
      Transform: { x: Math.random() * 400, y: Math.random() * 400 },
    });

  }
  
}