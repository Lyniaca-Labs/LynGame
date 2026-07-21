import { Transform } from "../engine/components/Transform.js";
import { SpriteRenderer } from "../engine/components/SpriteRenderer.js";
import { Gravity } from "./components/Gravity.js";
import { LogScript } from "./scripts/LogScript.js";
import { InputScript } from "./scripts/InputScript.js";
const LG = window.LG;

export function init(engine) {
  const entity_fallingBox = engine.createEntity("fallingBox");
  entity_fallingBox.addComponent(Transform, {"x":200,"y":20,"rotation":0});
  entity_fallingBox.addComponent(SpriteRenderer, {"width":100,"height":100,"color":"#00ff00"});
  entity_fallingBox.addComponent(Gravity, {"force":500,"velocityY":0,"grounded":false});
  entity_fallingBox.attachScript(LogScript);
  entity_fallingBox.attachScript(InputScript);

  engine.start();
}
