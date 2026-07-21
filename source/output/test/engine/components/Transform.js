import { Component } from "../types/Component.js";

export class Transform extends Component {
  constructor({ x = 0, y = 0, rotation = 0 } = {}) {
    super();
    this.x = x;
    this.y = y;
    this.rotation = rotation;
  }
}