export class Scene {
  constructor(name, load, cameraId = null) {
    this.name = name;
    this.load = load;         // (engine) => void — builds this scene's entities
    this.cameraId = cameraId; // entity id to auto-activate via setCamera() after load, or null
  }
}