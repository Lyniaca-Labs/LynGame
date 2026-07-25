import type { ScriptNodeTypes } from "./scriptNodeTypes.js";

export interface TextureNodeField {
  key: string;
  type: "number" | "color" | "text" | "select";
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface TextureNodePort {
  id: string;
  label: string;
  dataType: "texture";
}

export interface TextureNodeDefinition {
  type: string;
  label: string;
  category: string;
  color: string;
  inputs?: TextureNodePort[];
  outputs?: TextureNodePort[];
  fields?: TextureNodeField[];
  compile: (args: { values: Record<string, unknown>; inputs: Record<string, string> }) => string;
}
export type TextureNodeMetadata = Omit<TextureNodeDefinition, "compile">;

const texturePort: TextureNodePort = { id: "value", label: "Texture", dataType: "texture" };
const EMPTY = "LGTexture.empty(data.size)";

/**
 * Single source of truth for every texture graph node: both the UI metadata
 * (label, category, color, fields, ports) the editor needs to render the
 * node picker/inspector, and the `compile` function the backend uses to
 * turn a graph into runnable code. Defining both in one place means the
 * frontend and backend can never silently drift out of sync.
 */
export const textureNodeRegistry: Record<string, TextureNodeDefinition> = {
  // ---------------------------------------------------------------------
  // Generators
  // ---------------------------------------------------------------------
  "texture.color": {
    type: "texture.color",
    label: "Solid Color",
    category: "Generators",
    color: "#a855f7",
    outputs: [texturePort],
    fields: [{ key: "color", type: "color", defaultValue: "#7c3aed" }],
    compile: ({ values }) => `LGTexture.color(data.size, ${JSON.stringify(String(values.color ?? "#7c3aed"))})`,
  },
  "texture.gradient": {
    type: "texture.gradient",
    label: "Gradient (Linear)",
    category: "Generators",
    color: "#ec4899",
    outputs: [texturePort],
    fields: [
      { key: "direction", type: "select", defaultValue: "horizontal", options: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }, { value: "diagonal", label: "Diagonal" }] },
      { key: "from", type: "color", defaultValue: "#111827" },
      { key: "to", type: "color", defaultValue: "#38bdf8" },
    ],
    compile: ({ values }) => `LGTexture.gradient(data.size, ${JSON.stringify(String(values.direction ?? "horizontal"))}, ${JSON.stringify(String(values.from ?? "#111827"))}, ${JSON.stringify(String(values.to ?? "#38bdf8"))})`,
  },
  "texture.radialGradient": {
    type: "texture.radialGradient",
    label: "Gradient (Radial)",
    category: "Generators",
    color: "#f472b6",
    outputs: [texturePort],
    fields: [
      { key: "from", type: "color", defaultValue: "#111827" },
      { key: "to", type: "color", defaultValue: "#38bdf8" },
    ],
    compile: ({ values }) => `LGTexture.radialGradient(data.size, ${JSON.stringify(String(values.from ?? "#111827"))}, ${JSON.stringify(String(values.to ?? "#38bdf8"))})`,
  },
  "texture.noise": {
    type: "texture.noise",
    label: "Noise (Smooth)",
    category: "Generators",
    color: "#f97316",
    outputs: [texturePort],
    fields: [
      { key: "seed", type: "number", defaultValue: 1, min: 0, max: 99999, step: 1 },
      { key: "scale", type: "number", defaultValue: 8, min: 1, max: 64 },
      { key: "colorA", type: "color", defaultValue: "#111827" },
      { key: "colorB", type: "color", defaultValue: "#f8fafc" },
    ],
    compile: ({ values }) => `LGTexture.noise(data.size, ${Number(values.seed ?? 1)}, ${Number(values.scale ?? 8)}, ${JSON.stringify(String(values.colorA ?? "#111827"))}, ${JSON.stringify(String(values.colorB ?? "#f8fafc"))})`,
  },
  "texture.random": {
    type: "texture.random",
    label: "Random (Seeded)",
    category: "Generators",
    color: "#fb923c",
    outputs: [texturePort],
    fields: [
      { key: "seed", type: "number", defaultValue: 1, min: 0, max: 99999, step: 1 },
      { key: "colorA", type: "color", defaultValue: "#111827" },
      { key: "colorB", type: "color", defaultValue: "#f8fafc" },
    ],
    compile: ({ values }) => `LGTexture.random(data.size, ${Number(values.seed ?? 1)}, ${JSON.stringify(String(values.colorA ?? "#111827"))}, ${JSON.stringify(String(values.colorB ?? "#f8fafc"))})`,
  },
  "texture.stripes": {
    type: "texture.stripes",
    label: "Stripes",
    category: "Generators",
    color: "#facc15",
    outputs: [texturePort],
    fields: [
      { key: "width", type: "number", defaultValue: 8, min: 1, max: 64, step: 1 },
      { key: "direction", type: "select", defaultValue: "horizontal", options: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }, { value: "diagonal", label: "Diagonal" }] },
      { key: "colorA", type: "color", defaultValue: "#111827" },
      { key: "colorB", type: "color", defaultValue: "#f8fafc" },
    ],
    compile: ({ values }) => `LGTexture.stripes(data.size, ${Number(values.width ?? 8)}, ${JSON.stringify(String(values.direction ?? "horizontal"))}, ${JSON.stringify(String(values.colorA ?? "#111827"))}, ${JSON.stringify(String(values.colorB ?? "#f8fafc"))})`,
  },
  "texture.checker": {
    type: "texture.checker",
    label: "Checker",
    category: "Generators",
    color: "#eab308",
    outputs: [texturePort],
    fields: [
      { key: "size", type: "number", defaultValue: 16, min: 2, max: 64 },
      { key: "colorA", type: "color", defaultValue: "#111827" },
      { key: "colorB", type: "color", defaultValue: "#f8fafc" },
    ],
    compile: ({ values }) => `LGTexture.checker(data.size, ${Number(values.size ?? 16)}, ${JSON.stringify(String(values.colorA ?? "#111827"))}, ${JSON.stringify(String(values.colorB ?? "#f8fafc"))})`,
  },
  "texture.asset": {
    type: "texture.asset",
    label: "Existing Asset",
    category: "Inputs",
    color: "#22c55e",
    outputs: [texturePort],
    fields: [{ key: "asset", type: "text", defaultValue: "" }],
    compile: ({ values }) => `LGTexture.asset(data.assets, ${JSON.stringify(String(values.asset ?? ""))}, data.size)`,
  },

  // ---------------------------------------------------------------------
  // Adjust (color / value operations on a single texture)
  // ---------------------------------------------------------------------
  "texture.invert": {
    type: "texture.invert",
    label: "Invert",
    category: "Adjust",
    color: "#6366f1",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    compile: ({ inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "invert", 1)`,
  },
  "texture.brightness": {
    type: "texture.brightness",
    label: "Brightness",
    category: "Adjust",
    color: "#0ea5e9",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 1, min: 0, max: 2, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "brightness", ${Number(values.amount ?? 1)})`,
  },
  "texture.contrast": {
    type: "texture.contrast",
    label: "Contrast",
    category: "Adjust",
    color: "#0284c7",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 0, min: -1, max: 1, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "contrast", ${Number(values.amount ?? 0)})`,
  },
  "texture.saturation": {
    type: "texture.saturation",
    label: "Saturation",
    category: "Adjust",
    color: "#06b6d4",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 1, min: 0, max: 2, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "saturation", ${Number(values.amount ?? 1)})`,
  },
  "texture.grayscale": {
    type: "texture.grayscale",
    label: "Grayscale",
    category: "Adjust",
    color: "#64748b",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    compile: ({ inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "grayscale", 1)`,
  },
  "texture.hue": {
    type: "texture.hue",
    label: "Hue Shift",
    category: "Adjust",
    color: "#a78bfa",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "degrees", type: "number", defaultValue: 0, min: 0, max: 360, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.hueRotate(${inputs.texture ?? EMPTY}, data.size, ${Number(values.degrees ?? 0)})`,
  },
  "texture.posterize": {
    type: "texture.posterize",
    label: "Posterize",
    category: "Adjust",
    color: "#f59e0b",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "levels", type: "number", defaultValue: 4, min: 2, max: 16, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "posterize", ${Number(values.levels ?? 4)})`,
  },
  "texture.threshold": {
    type: "texture.threshold",
    label: "Threshold",
    category: "Adjust",
    color: "#dc2626",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "cutoff", type: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "threshold", ${Number(values.cutoff ?? 0.5)})`,
  },
  "texture.opacity": {
    type: "texture.opacity",
    label: "Opacity",
    category: "Adjust",
    color: "#94a3b8",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 1, min: 0, max: 1, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.adjust(${inputs.texture ?? EMPTY}, data.size, "opacity", ${Number(values.amount ?? 1)})`,
  },
  "texture.tint": {
    type: "texture.tint",
    label: "Tint",
    category: "Adjust",
    color: "#c026d3",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [
      { key: "color", type: "color", defaultValue: "#f97316" },
      { key: "amount", type: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    compile: ({ values, inputs }) => `LGTexture.tint(${inputs.texture ?? EMPTY}, data.size, ${JSON.stringify(String(values.color ?? "#f97316"))}, ${Number(values.amount ?? 0.5)})`,
  },
  "texture.pixelate": {
    type: "texture.pixelate",
    label: "Pixelate",
    category: "Adjust",
    color: "#84cc16",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "blockSize", type: "number", defaultValue: 8, min: 1, max: 64, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.pixelate(${inputs.texture ?? EMPTY}, data.size, ${Number(values.blockSize ?? 8)})`,
  },
  "texture.blur": {
    type: "texture.blur",
    label: "Blur",
    category: "Adjust",
    color: "#38bdf8",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "radius", type: "number", defaultValue: 4, min: 0, max: 32, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.blur(${inputs.texture ?? EMPTY}, data.size, ${Number(values.radius ?? 4)})`,
  },
  "texture.antialias": {
    type: "texture.antialias",
    label: "Antialias",
    category: "Adjust",
    color: "#f43f5e",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "strength", type: "number", defaultValue: 2, min: 1, max: 8, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.antialias(${inputs.texture ?? EMPTY}, data.size, ${Number(values.strength ?? 2)})`,
  },

  // ---------------------------------------------------------------------
  // Transform (geometry)
  // ---------------------------------------------------------------------
  "texture.rotate": {
    type: "texture.rotate",
    label: "Rotate",
    category: "Transform",
    color: "#34d399",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "degrees", type: "number", defaultValue: 0, min: -180, max: 180, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.rotate(${inputs.texture ?? EMPTY}, data.size, ${Number(values.degrees ?? 0)})`,
  },
  "texture.flip": {
    type: "texture.flip",
    label: "Flip",
    category: "Transform",
    color: "#2dd4bf",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "axis", type: "select", defaultValue: "horizontal", options: [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }] }],
    compile: ({ values, inputs }) => `LGTexture.flip(${inputs.texture ?? EMPTY}, data.size, ${JSON.stringify(String(values.axis ?? "horizontal"))})`,
  },
  "texture.offset": {
    type: "texture.offset",
    label: "Offset (Pan)",
    category: "Transform",
    color: "#10b981",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [
      { key: "x", type: "number", defaultValue: 0, min: -256, max: 256, step: 1 },
      { key: "y", type: "number", defaultValue: 0, min: -256, max: 256, step: 1 },
    ],
    compile: ({ values, inputs }) => `LGTexture.offset(${inputs.texture ?? EMPTY}, data.size, ${Number(values.x ?? 0)}, ${Number(values.y ?? 0)})`,
  },
  "texture.tile": {
    type: "texture.tile",
    label: "Tile / Repeat",
    category: "Transform",
    color: "#059669",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "repeat", type: "number", defaultValue: 2, min: 1, max: 8, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.tile(${inputs.texture ?? EMPTY}, data.size, ${Number(values.repeat ?? 2)})`,
  },

  // ---------------------------------------------------------------------
  // Combine (two textures in)
  // ---------------------------------------------------------------------
  "texture.blend": {
    type: "texture.blend",
    label: "Blend",
    category: "Combine",
    color: "#14b8a6",
    inputs: [{ id: "a", label: "A", dataType: "texture" }, { id: "b", label: "B", dataType: "texture" }],
    outputs: [texturePort],
    fields: [
      { key: "amount", type: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "mode", type: "select", defaultValue: "normal", options: [{ value: "normal", label: "Normal" }, { value: "multiply", label: "Multiply" }, { value: "screen", label: "Screen" }, { value: "overlay", label: "Overlay" }, { value: "add", label: "Add" }] },
    ],
    compile: ({ values, inputs }) => `LGTexture.blend(${inputs.a ?? EMPTY}, ${inputs.b ?? EMPTY}, ${Number(values.amount ?? 0.5)}, data.size, ${JSON.stringify(String(values.mode ?? "normal"))})`,
  },
  "texture.mask": {
    type: "texture.mask",
    label: "Mask",
    category: "Combine",
    color: "#0d9488",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }, { id: "mask", label: "Mask", dataType: "texture" }],
    outputs: [texturePort],
    compile: ({ inputs }) => `LGTexture.mask(${inputs.texture ?? EMPTY}, ${inputs.mask ?? EMPTY}, data.size)`,
  },

  // ---------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------
  "texture.output": {
    type: "texture.output",
    label: "Output",
    category: "Output",
    color: "#ef8fc8",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    compile: ({ inputs }) => inputs.texture ?? EMPTY,
  },
};

/**
 * Compiler-facing view of the registry. The generic script compiler expects
 * a designated "script.output" entry point, so texture.output is aliased to
 * that key here while keeping "texture.output" as the canonical UI-facing
 * type name everywhere else.
 */
export const textureScriptNodeTypes: ScriptNodeTypes = Object.fromEntries(
  Object.entries(textureNodeRegistry).map(([key, def]) => {
    const type = key === "texture.output" ? "script.output" : def.type;
    return [
      type,
      {
        type,
        label: def.label,
        category: def.category,
        inputs: def.inputs?.map(({ id }) => ({ id })),
        compile: def.compile,
      },
    ];
  }),
) as unknown as ScriptNodeTypes;

/** JSON-safe metadata (no compile functions), keyed by node type, for the frontend node picker/inspector. */
export function getTextureNodeMetadata(): Record<string, TextureNodeMetadata> {
  return Object.fromEntries(
    Object.entries(textureNodeRegistry).map(([type, { compile: _compile, ...meta }]) => [type, meta]),
  );
}