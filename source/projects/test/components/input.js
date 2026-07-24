import { Component } from "@types/Component.js";
import { Transform } from "@components/Transform.js";

export class input extends Component {
  static schema = {
    // width: { type: "number", default: 32 },
    // label: { type: "string", default: "" },
    // color: { type: "color", default: "#ffffff" },
    // enabled: { type: "boolean", default: true },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns any fields declared in static schema
  }

  onSpawn(entity, engine) {}

  onTick(entity, engine, dt) {
    const transform = entity.getComponent("Transform");
    if (!transform) return;
    transform.x ++;
  }

  onDestroy(entity, engine) {}
}
