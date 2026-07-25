import { LGTexture } from "../../engine/index.js";
export function buildTexture(data = {}) {
  const n1_textureRandom = LGTexture.random(data.size, 6, "#111827", "#f8fafc");
  const n2_textureInvert = LGTexture.adjust(n1_textureRandom, data.size, "invert", 1);
  const n3_textureOpacity = LGTexture.adjust(n2_textureInvert, data.size, "opacity", 0.25);
  const n4_scriptOutput = n3_textureOpacity;
  const n5_textureAsset = LGTexture.asset(data.assets, "tree", data.size);
  const n6_textureBrightness = LGTexture.adjust(n5_textureAsset, data.size, "brightness", 1.15);
  const n7_textureRotate = LGTexture.rotate(n5_textureAsset, data.size, 47);
  return n4_scriptOutput;
}
