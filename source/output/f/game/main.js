import { Transform } from "../engine/components/Transform.js";
import { SpriteRenderer } from "../engine/components/SpriteRenderer.js";


export function init(engine) {
  const entity_rectangle1 = engine.createEntity("rectangle1");
  entity_rectangle1.addComponent(Transform, {"x":50,"y":50,"rotation":0});
  entity_rectangle1.addComponent(SpriteRenderer, {"width":100,"height":100,"color":"#00ff00"});


  engine.start();
}
