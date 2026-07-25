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

/**
 * Single source of truth for every texture graph node: both the UI metadata
 * (label, category, color, fields, ports) the editor needs to render the
 * node picker/inspector, and the `compile` function the backend uses to
 * turn a graph into runnable code. Defining both in one place means the
 * frontend and backend can never silently drift out of sync.
 */
export const textureNodeRegistry: Record<string, TextureNodeDefinition> = {
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
    label: "Gradient",
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
  "texture.noise": {
    type: "texture.noise",
    label: "Noise",
    category: "Generators",
    color: "#f97316",
    outputs: [texturePort],
    fields: [
      { key: "seed", type: "number", defaultValue: 1 },
      { key: "scale", type: "number", defaultValue: 8, min: 1, max: 64 },
      { key: "colorA", type: "color", defaultValue: "#111827" },
      { key: "colorB", type: "color", defaultValue: "#f8fafc" },
    ],
    compile: ({ values }) => `LGTexture.noise(data.size, ${Number(values.seed ?? 1)}, ${Number(values.scale ?? 8)}, ${JSON.stringify(String(values.colorA ?? "#111827"))}, ${JSON.stringify(String(values.colorB ?? "#f8fafc"))})`,
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
  "texture.blend": {
    type: "texture.blend",
    label: "Blend",
    category: "Filters",
    color: "#14b8a6",
    inputs: [{ id: "a", label: "A", dataType: "texture" }, { id: "b", label: "B", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 0.5, min: 0, max: 1, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.blend(${inputs.a ?? "LGTexture.empty(data.size)"}, ${inputs.b ?? "LGTexture.empty(data.size)"}, ${Number(values.amount ?? 0.5)}, data.size)`,
  },
  "texture.invert": {
    type: "texture.invert",
    label: "Invert",
    category: "Filters",
    color: "#6366f1",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    compile: ({ inputs }) => `LGTexture.filter(${inputs.texture ?? "LGTexture.empty(data.size)"}, "invert", 1, data.size)`,
  },
  "texture.brightness": {
    type: "texture.brightness",
    label: "Brightness",
    category: "Filters",
    color: "#0ea5e9",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "amount", type: "number", defaultValue: 1, min: 0, max: 2, step: 0.05 }],
    compile: ({ values, inputs }) => `LGTexture.filter(${inputs.texture ?? "LGTexture.empty(data.size)"}, "brightness", ${Number(values.amount ?? 1)}, data.size)`,
  },
  "texture.antialias": {
    type: "texture.antialias",
    label: "Antialias",
    category: "Filters",
    color: "#f43f5e",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    outputs: [texturePort],
    fields: [{ key: "strength", type: "number", defaultValue: 2, min: 1, max: 8, step: 1 }],
    compile: ({ values, inputs }) => `LGTexture.antialias(${inputs.texture ?? "LGTexture.empty(data.size)"}, data.size, ${Number(values.strength ?? 2)})`,
  },
  "texture.output": {
    type: "texture.output",
    label: "Output",
    category: "Output",
    color: "#ef8fc8",
    inputs: [{ id: "texture", label: "Texture", dataType: "texture" }],
    compile: ({ inputs }) => inputs.texture ?? "LGTexture.empty(data.size)",
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