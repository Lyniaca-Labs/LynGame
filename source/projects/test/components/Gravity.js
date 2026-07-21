import { Component } from "@types/Component.js";
import { Transform } from "@components/Transform.js";

export class Gravity extends Component {
  constructor({ force = 500, velocityY = 0, grounded = false } = {}) {
    super();
    this.force = force;
    this.velocityY = velocityY;
    this.grounded = grounded;
  }

  onSpawn(entity, engine) {
    console.log(`Gravity attached to ${entity.id}`);
  }

  onDestroy(entity, engine) {
    console.log(`Gravity removed from ${entity.id}`);
  }

  onTick(entity, engine, dt) {
    if (engine.time > 3000) {
      engine.removeEntity(entity.id);
    }
    
    const transform = entity.getComponent("Transform");
    if (!transform || this.grounded) return;

    this.velocityY += this.force * dt;
    transform.y += this.velocityY * dt;

    const GROUND_Y = 400;
    if (transform.y >= GROUND_Y) {
      transform.y = GROUND_Y;
      this.velocityY = 0;
      this.grounded = true;
    }

  }
}