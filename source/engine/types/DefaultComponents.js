import { Transform } from "../components/Transform.js";
import { SpriteRenderer } from "../components/SpriteRenderer.js";
import { Movement } from "../components/Movement.js";
import { ShapeRenderer } from "../components/ShapeRenderer.js";
import { TextRenderer } from "../components/TextRenderer.js";
import { Camera } from "../components/Camera.js";
import { Interactable } from "../components/Interactable.js";

export const DEFAULT_COMPONENTS = {
  Interactable,
  Transform,
  SpriteRenderer,
  ShapeRenderer,
  TextRenderer,
  Camera,
  Movement,
};