import { LGTexture } from "../../engine/index.js";
export function buildTexture(data = {}) {
  const n1_textureColor = LGTexture.color(data.size, "#7c3aed");
  const n2_textureOpacity = LGTexture.adjust(n1_textureColor, data.size, "opacity", 0.3);
  const n3_textureAsset = LGTexture.asset(data.assets, "tree", data.size);
  const n4_textureMask = LGTexture.mask(n2_textureOpacity, n3_textureAsset, data.size);
  const n5_textureOpacity = LGTexture.adjust(n4_textureMask, data.size, "opacity", 0.45);
  const n6_scriptOutput = n5_textureOpacity;
  return n6_scriptOutput;
}
