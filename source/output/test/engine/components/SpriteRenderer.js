import { Component } from "../types/Component.js";

export class SpriteRenderer extends Component {
  constructor({ width = 32, height = 32, color = "#fff" } = {}) {
    super();
    this.width = width;
    this.height = height;
    this.color = color;
  }
}