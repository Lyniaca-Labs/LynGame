export function DoorScript(entity, engine, dt) {
  if (engine.input.wasKeyPressed("KeyE")) {
    engine.loadScene("level2");
  }
}