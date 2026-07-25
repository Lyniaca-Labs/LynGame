import { LGTexture } from "../../engine/index.js";
export function buildTexture(data = {}) {
  const n1_textureAsset = LGTexture.asset(data.assets, "tree", data.size);
  const n2_textureBrightness = LGTexture.adjust(n1_textureAsset, data.size, "brightness", 9);
  const n3_scriptOutput = n2_textureBrightness;
  return n3_scriptOutput;
}
