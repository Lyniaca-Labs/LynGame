// scriptNodeTypes.ts
//
// Extends GraphEditor's node-type registry shape with a `compile` step,
// so a graph built in the generic GraphEditor can be turned into a plain
// JS function. Everything here is additive — GraphEditor itself stays
// generic and knows nothing about compilation.

// TODO: move this backend 

import type {
  GraphNodeTypeDefinition,
  GraphNode,
} from "../GraphEditor";

/** Resolved JS expression strings for each input port of a node, keyed by port id. */
export type CompiledInputs = Record<string, string>;

/**
 * What a node type's compile() function returns:
 *  - a single expression string, for nodes with exactly one output (the
 *    common case — the compiler assigns it to one variable)
 *  - a Record<outputPortId, expression>, for nodes with multiple outputs
 *    (e.g. vector.split returning separate expressions for "x" and "y",
 *    each assigned to its own variable by the compiler)
 */
export type CompileOutput = string | Record<string, string>;

export interface CompileContext {
  node: GraphNode;
  /** node.data.values — the inline field values set in the inspector. */
  values: Record<string, unknown>;
  /** For each input port id, a JS expression string for whatever feeds it. */
  inputs: CompiledInputs;
}

export interface ScriptNodeTypeDefinition extends GraphNodeTypeDefinition {
  /**
   * Produce either:
   *  - a single JS expression (NOT a statement — no trailing `;`) if this
   *    node has one output. The compiler assigns it to a local const, e.g.
   *    `const n3 = <your expression>;`.
   *  - a Record<outputPortId, expression> if this node has multiple
   *    outputs. The compiler assigns each entry to its own local const,
   *    e.g. `const n3_x = <expr>; const n3_y = <expr>;`, so downstream
   *    nodes wired from a specific output port reference the right one.
   */
  compile: (ctx: CompileContext) => CompileOutput;
}

export type ScriptNodeTypes = Record<string, ScriptNodeTypeDefinition>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function literal(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === undefined || value === null) return "undefined";
  return JSON.stringify(value);
}

/** Reads an input if connected, otherwise falls back to the node's own field value. */
function inputOr(ctx: CompileContext, portId: string, fallbackFieldKey = portId): string {
  return ctx.inputs[portId] ?? literal(ctx.values[fallbackFieldKey]);
}

/**
 * Builds a runtime index expression into a compiled value, e.g.
 *   indexOf("someArrayExpr", 0) -> "someArrayExpr[0]"
 * Wraps the base expression in parentheses if it isn't already a simple
 * identifier/member/index expression, so things like ternaries or object
 * literals don't break: indexOf("a ? b : c", 0) -> "(a ? b : c)[0]"
 */
function indexOf(expr: string, index: number): string {
  const isSimple = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*|\[[^\]]*\])*$/.test(expr);
  return `${isSimple ? expr : `(${expr})`}[${index}]`;
}

// ---------------------------------------------------------------------------
// Default node types — enough to build real scripts. Extensions can merge
// more in: `{ ...defaultScriptNodeTypes, ...myDomainNodeTypes }`.
// ---------------------------------------------------------------------------

export const defaultScriptNodeTypes: ScriptNodeTypes = {
  "script.input": {
    type: "script.input",
    label: "Script Input",
    category: "Script",
    description: "Reads a field off the function's input object.",
    outputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [{ key: "key", label: "Field", type: "text", defaultValue: "value" }],
    compile: (ctx) => {
      const key = String(ctx.values.key ?? "value");
      return `input${/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${literal(key)}]`}`;
    },
  },

  "script.output": {
    type: "script.output",
    label: "Script Output",
    category: "Script",
    description: "Marks a value as (part of) the function's return value.",
    inputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [
      {
        key: "key",
        label: "Result field (blank = return directly)",
        type: "text",
        defaultValue: "",
      },
    ],
    compile: (ctx) => inputOr(ctx, "value"),
  },

  "value.number": {
    type: "value.number",
    label: "Number",
    category: "Value",
    outputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [{ key: "value", label: "Value", type: "text", defaultValue: "" }],
    compile: (ctx) => {
      const raw = ctx.values.value;
      const num = typeof raw === "number" ? raw : Number(raw ?? 0);
      if (Number.isNaN(num)) {
        throw new Error(`"Number" node has a non-numeric value: ${JSON.stringify(raw)}`);
      }
      return literal(num); // now hits the number/boolean branch → plain "42"
    },
  },
  "value.string": {
    type: "value.string",
    label: "Text",
    category: "Value",
    outputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [{ key: "value", label: "Value", type: "text", defaultValue: "" }],
    compile: (ctx) => literal(ctx.values.value),
  },
  "value.random": {
    type: "value.random",
    label: "Random",
    category: "Value",
    outputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [
      { key: "min", label: "Min", type: "number", defaultValue: 0 },
      { key: "max", label: "Max", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "min")} + Math.random() * (${inputOr(ctx, "max")} - ${inputOr(
      ctx,
      "min"
    )}))`,
  },  
  "value.vector2": {
    type: "value.vector2",
    label: "Vector2",
    category: "Value",
    outputs: [{ id: "value", label: "Value", dataType: "vector" }],
    fields: [
      { key: "x", label: "X", type: "number", defaultValue: 0 },
      { key: "y", label: "Y", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `[${inputOr(ctx, "x")}, ${inputOr(ctx, "y")}]`,
  },

  "string.length": {
    type: "string.length",
    label: "Text Length",
    category: "String",
    inputs: [{ id: "value", label: "Value", dataType: "string" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", label: "Value", type: "text", defaultValue: "" }],
    compile: (ctx) => `${inputOr(ctx, "value")}.length`,
  },
  "string.concat": {
    type: "string.concat",
    label: "Concat",
    category: "String",
    inputs: [
      { id: "a", label: "A", dataType: "string" },
      { id: "b", label: "B", dataType: "string" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "string" }],
    fields: [
      { key: "a", label: "A", type: "text", defaultValue: "" },
      { key: "b", label: "B", type: "text", defaultValue: "" },
    ],
    compile: (ctx) => `${inputOr(ctx, "a")} + ${inputOr(ctx, "b")}`,
  },


  "math.add": {
    type: "math.add",
    label: "Add",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} + ${inputOr(ctx, "b")})`,
  },

  "math.subtract": {
    type: "math.subtract",
    label: "Subtract",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} - ${inputOr(ctx, "b")})`,
  },

  "math.multiply": {
    type: "math.multiply",
    label: "Multiply",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 1 },
      { key: "b", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} * ${inputOr(ctx, "b")})`,
  },

  "math.divide": {
    type: "math.divide",
    label: "Divide",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} / ${inputOr(ctx, "b")})`,
  },

  "math.modulo": {
    type: "math.modulo",
    label: "Modulo",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} % ${inputOr(ctx, "b")})`,
  },

  "math.pow": {
    type: "math.pow",
    label: "Power",
    category: "Math",
    inputs: [
      { id: "base", label: "Base", dataType: "number" },
      { id: "exponent", label: "Exponent", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "base", type: "number", defaultValue: 1 },
      { key: "exponent", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) => `Math.pow(${inputOr(ctx, "base")}, ${inputOr(ctx, "exponent")})`,
  },


  "logic.and": {
    type: "logic.and",
    label: "And",
    category: "Logic",
    inputs: [
      { id: "a", label: "A", dataType: "boolean" },
      { id: "b", label: "B", dataType: "boolean" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "boolean", defaultValue: false },
      { key: "b", type: "boolean", defaultValue: false },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} && ${inputOr(ctx, "b")})`,
  },

  "logic.or": {
    type: "logic.or",
    label: "Or",
    category: "Logic",
    inputs: [
      { id: "a", label: "A", dataType: "boolean" },
      { id: "b", label: "B", dataType: "boolean" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "boolean", defaultValue: false },
      { key: "b", type: "boolean", defaultValue: false },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} || ${inputOr(ctx, "b")})`,
  },

  "logic.not": {
    type: "logic.not",
    label: "Not",
    category: "Logic",
    inputs: [{ id: "value", label: "Value", dataType: "boolean" }],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [{ key: "value", type: "boolean", defaultValue: false }],
    compile: (ctx) => `(!${inputOr(ctx, "value")})`,
  },

  "vector.create": {
    type: "vector.create",
    label: "Create Vector",
    category: "Vector",
    inputs: [
      { id: "x", label: "X", dataType: "number" },
      { id: "y", label: "Y", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [
      { key: "x", type: "number", defaultValue: 0 },
      { key: "y", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `[${inputOr(ctx, "x")}, ${inputOr(ctx, "y")}]`,
  },
  "vector.split": {
    type: "vector.split",
    label: "Split Vector",
    category: "Vector",
    inputs: [{ id: "vector", label: "Vector", dataType: "vector" }],
    outputs: [
      { id: "x", label: "X", dataType: "number" },
      { id: "y", label: "Y", dataType: "number" },
    ],
    fields: [],
    compile: (ctx) => {
      const vec = inputOr(ctx, "vector");
      return {
        x: indexOf(vec, 0),
        y: indexOf(vec, 1),
      };
    },
  },

  "compare.equals": {
    type: "compare.equals",
    label: "Equals",
    category: "Compare",
    inputs: [
      { id: "a", label: "A", dataType: "any" },
      { id: "b", label: "B", dataType: "any" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "text", defaultValue: "" },
      { key: "b", type: "text", defaultValue: "" },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} === ${inputOr(ctx, "b")})`,
  },

  "compare.greaterThan": {
    type: "compare.greaterThan",
    label: "Greater Than",
    category: "Compare",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} > ${inputOr(ctx, "b")})`,
  },

  "logic.if": {
    type: "logic.if",
    label: "If / Else",
    category: "Logic",
    description: "Ternary — picks 'then' or 'else' based on 'condition'.",
    inputs: [
      { id: "condition", label: "Condition", dataType: "boolean" },
      { id: "then", label: "Then", dataType: "any" },
      { id: "else", label: "Else", dataType: "any" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "any" }],
    fields: [
      { key: "condition", type: "boolean", defaultValue: false },
      { key: "then", type: "text", defaultValue: "" },
      { key: "else", type: "text", defaultValue: "" },
    ],
    compile: (ctx) =>
      `(${inputOr(ctx, "condition")} ? ${inputOr(ctx, "then")} : ${inputOr(ctx, "else")})`,
  },

  "mutate.round": {
    type: "mutate.round",
    label: "Round",
    category: "Mutate",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.round(${inputOr(ctx, "value")})`,
  },
  "mutate.floor": {
    type: "mutate.floor",
    label: "Floor",
    category: "Mutate",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.floor(${inputOr(ctx, "value")})`,
  },
  "mutate.ceil": {
    type: "mutate.ceil",
    label: "Ceil",
    category: "Mutate",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.ceil(${inputOr(ctx, "value")})`,
  },
  "mutate.tostring": {
    type: "mutate.tostring",
    label: "To Text",
    category: "Mutate",
    inputs: [{ id: "value", label: "Value", dataType: "any" }],
    outputs: [{ id: "result", label: "Result", dataType: "string" }],
    fields: [{ key: "value", type: "text", defaultValue: "" }],
    compile: (ctx) => `String(${inputOr(ctx, "value")})`,
  },
  "mutate.tonumber": {
    type: "mutate.tonumber",
    label: "To Number",
    category: "Mutate",
    inputs: [{ id: "value", label: "Value", dataType: "any" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "text", defaultValue: "" }],
    compile: (ctx) => `Number(${inputOr(ctx, "value")})`,
  },

  "vector.add": {
    type: "vector.add",
    label: "Vector Add",
    category: "Vector",
    inputs: [
      { id: "a", label: "A", dataType: "vector" },
      { id: "b", label: "B", dataType: "vector" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [],
    compile: (ctx) => {
      const a = inputOr(ctx, "a");
      const b = inputOr(ctx, "b");
      return `[${indexOf(a, 0)} + ${indexOf(b, 0)}, ${indexOf(a, 1)} + ${indexOf(b, 1)}]`;
    },
  },

  "vector.subtract": {
    type: "vector.subtract",
    label: "Vector Subtract",
    category: "Vector",
    inputs: [
      { id: "a", label: "A", dataType: "vector" },
      { id: "b", label: "B", dataType: "vector" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [],
    compile: (ctx) => {
      const a = inputOr(ctx, "a");
      const b = inputOr(ctx, "b");
      return `[${indexOf(a, 0)} - ${indexOf(b, 0)}, ${indexOf(a, 1)} - ${indexOf(b, 1)}]`;
    },
  },

  "vector.scale": {
    type: "vector.scale",
    label: "Vector Scale",
    category: "Vector",
    inputs: [
      { id: "vector", label: "Vector", dataType: "vector" },
      { id: "scalar", label: "Scalar", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [{ key: "scalar", label: "Scalar", type: "number", defaultValue: 1 }],
    compile: (ctx) => {
      const v = inputOr(ctx, "vector");
      const s = inputOr(ctx, "scalar");
      return `[${indexOf(v, 0)} * ${s}, ${indexOf(v, 1)} * ${s}]`;
    },
  },

  "vector.length": {
    type: "vector.length",
    label: "Vector Length",
    category: "Vector",
    description: "Magnitude of a vector (its distance from the origin).",
    inputs: [{ id: "vector", label: "Vector", dataType: "vector" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [],
    compile: (ctx) => {
      const v = inputOr(ctx, "vector");
      return `Math.hypot(${indexOf(v, 0)}, ${indexOf(v, 1)})`;
    },
  },

  "vector.normalize": {
    type: "vector.normalize",
    label: "Vector Normalize",
    category: "Vector",
    description: "Scales a vector to length 1 (zero vector stays zero).",
    inputs: [{ id: "vector", label: "Vector", dataType: "vector" }],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [],
    compile: (ctx) => {
      const v = inputOr(ctx, "vector");
      return `(( _v => { const _l = Math.hypot(_v[0], _v[1]); return _l === 0 ? [0, 0] : [_v[0] / _l, _v[1] / _l]; })(${v}))`;
    },
  },

  "vector.distance": {
    type: "vector.distance",
    label: "Vector Distance",
    category: "Vector",
    inputs: [
      { id: "a", label: "A", dataType: "vector" },
      { id: "b", label: "B", dataType: "vector" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [],
    compile: (ctx) => {
      const a = inputOr(ctx, "a");
      const b = inputOr(ctx, "b");
      return `Math.hypot(${indexOf(a, 0)} - ${indexOf(b, 0)}, ${indexOf(a, 1)} - ${indexOf(b, 1)})`;
    },
  },

  "vector.dot": {
    type: "vector.dot",
    label: "Vector Dot Product",
    category: "Vector",
    inputs: [
      { id: "a", label: "A", dataType: "vector" },
      { id: "b", label: "B", dataType: "vector" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [],
    compile: (ctx) => {
      const a = inputOr(ctx, "a");
      const b = inputOr(ctx, "b");
      return `(${indexOf(a, 0)} * ${indexOf(b, 0)} + ${indexOf(a, 1)} * ${indexOf(b, 1)})`;
    },
  },

  "vector.lerp": {
    type: "vector.lerp",
    label: "Vector Lerp",
    category: "Vector",
    description: "Interpolates between two vectors. t=0 -> A, t=1 -> B.",
    inputs: [
      { id: "a", label: "A", dataType: "vector" },
      { id: "b", label: "B", dataType: "vector" },
      { id: "t", label: "T", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "vector" }],
    fields: [{ key: "t", label: "T", type: "number", defaultValue: 0, min: 0, max: 1, step: 0.01 }],
    compile: (ctx) => {
      const a = inputOr(ctx, "a");
      const b = inputOr(ctx, "b");
      const t = inputOr(ctx, "t");
      return `[${indexOf(a, 0)} + (${indexOf(b, 0)} - ${indexOf(a, 0)}) * ${t}, ${indexOf(a, 1)} + (${indexOf(b, 1)} - ${indexOf(a, 1)}) * ${t}]`;
    },
  },

  "math.lerp": {
    type: "math.lerp",
    label: "Lerp",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
      { id: "t", label: "T", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 1 },
      { key: "t", type: "number", defaultValue: 0, min: 0, max: 1, step: 0.01 },
    ],
    compile: (ctx) =>
      `(${inputOr(ctx, "a")} + (${inputOr(ctx, "b")} - ${inputOr(ctx, "a")}) * ${inputOr(ctx, "t")})`,
  },

  "math.clamp": {
    type: "math.clamp",
    label: "Clamp",
    category: "Math",
    inputs: [
      { id: "value", label: "Value", dataType: "number" },
      { id: "min", label: "Min", dataType: "number" },
      { id: "max", label: "Max", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "value", type: "number", defaultValue: 0 },
      { key: "min", type: "number", defaultValue: 0 },
      { key: "max", type: "number", defaultValue: 1 },
    ],
    compile: (ctx) =>
      `Math.min(Math.max(${inputOr(ctx, "value")}, ${inputOr(ctx, "min")}), ${inputOr(ctx, "max")})`,
  },

  "math.min": {
    type: "math.min",
    label: "Min",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `Math.min(${inputOr(ctx, "a")}, ${inputOr(ctx, "b")})`,
  },

  "math.max": {
    type: "math.max",
    label: "Max",
    category: "Math",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `Math.max(${inputOr(ctx, "a")}, ${inputOr(ctx, "b")})`,
  },

  "math.abs": {
    type: "math.abs",
    label: "Abs",
    category: "Math",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.abs(${inputOr(ctx, "value")})`,
  },

  "math.sqrt": {
    type: "math.sqrt",
    label: "Square Root",
    category: "Math",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.sqrt(${inputOr(ctx, "value")})`,
  },

  "math.sign": {
    type: "math.sign",
    label: "Sign",
    category: "Math",
    inputs: [{ id: "value", label: "Value", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.sign(${inputOr(ctx, "value")})`,
  },

  "math.sin": {
    type: "math.sin",
    label: "Sin",
    category: "Math",
    description: "Sine, in radians.",
    inputs: [{ id: "value", label: "Radians", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.sin(${inputOr(ctx, "value")})`,
  },

  "math.cos": {
    type: "math.cos",
    label: "Cos",
    category: "Math",
    description: "Cosine, in radians.",
    inputs: [{ id: "value", label: "Radians", dataType: "number" }],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [{ key: "value", type: "number", defaultValue: 0 }],
    compile: (ctx) => `Math.cos(${inputOr(ctx, "value")})`,
  },

  "math.atan2": {
    type: "math.atan2",
    label: "Atan2",
    category: "Math",
    description: "Angle (radians) of a vector's direction, e.g. for aiming/facing.",
    inputs: [
      { id: "y", label: "Y", dataType: "number" },
      { id: "x", label: "X", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "number" }],
    fields: [
      { key: "y", type: "number", defaultValue: 0 },
      { key: "x", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `Math.atan2(${inputOr(ctx, "y")}, ${inputOr(ctx, "x")})`,
  },

  "random.int": {
    type: "random.int",
    label: "Random Int",
    category: "Value",
    description: "Random integer, inclusive of both min and max.",
    outputs: [{ id: "value", label: "Value", dataType: "number" }],
    fields: [
      { key: "min", label: "Min", type: "number", defaultValue: 0 },
      { key: "max", label: "Max", type: "number", defaultValue: 10 },
    ],
    compile: (ctx) =>
      `Math.floor(${inputOr(ctx, "min")} + Math.random() * (${inputOr(ctx, "max")} - ${inputOr(ctx, "min")} + 1))`,
  },

  "compare.lessThan": {
    type: "compare.lessThan",
    label: "Less Than",
    category: "Compare",
    inputs: [
      { id: "a", label: "A", dataType: "number" },
      { id: "b", label: "B", dataType: "number" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "number", defaultValue: 0 },
      { key: "b", type: "number", defaultValue: 0 },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} < ${inputOr(ctx, "b")})`,
  },

  "compare.notEquals": {
    type: "compare.notEquals",
    label: "Not Equals",
    category: "Compare",
    inputs: [
      { id: "a", label: "A", dataType: "any" },
      { id: "b", label: "B", dataType: "any" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "text", defaultValue: "" },
      { key: "b", type: "text", defaultValue: "" },
    ],
    compile: (ctx) => `(${inputOr(ctx, "a")} !== ${inputOr(ctx, "b")})`,
  },

  "logic.xor": {
    type: "logic.xor",
    label: "Xor",
    category: "Logic",
    inputs: [
      { id: "a", label: "A", dataType: "boolean" },
      { id: "b", label: "B", dataType: "boolean" },
    ],
    outputs: [{ id: "result", label: "Result", dataType: "boolean" }],
    fields: [
      { key: "a", type: "boolean", defaultValue: false },
      { key: "b", type: "boolean", defaultValue: false },
    ],
    compile: (ctx) => `(!!${inputOr(ctx, "a")} !== !!${inputOr(ctx, "b")})`,
  },
};