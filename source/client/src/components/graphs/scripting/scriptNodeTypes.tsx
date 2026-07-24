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

export interface CompileContext {
  node: GraphNode;
  /** node.data.values — the inline field values set in the inspector. */
  values: Record<string, unknown>;
  /** For each input port id, a JS expression string for whatever feeds it. */
  inputs: CompiledInputs;
}

export interface ScriptNodeTypeDefinition extends GraphNodeTypeDefinition {
  /**
   * Produce a JS expression (NOT a statement — no trailing `;`) for this
   * node given its resolved inputs. The compiler assigns the result to a
   * local const, e.g. `const n3 = <your expression>;`, and other nodes
   * reference it by that variable name.
   */
  compile: (ctx: CompileContext) => string;
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

  "value.constant": {
    type: "value.constant",
    label: "Constant",
    category: "Value",
    outputs: [{ id: "value", label: "Value", dataType: "any" }],
    fields: [{ key: "value", label: "Value", type: "text", defaultValue: "" }],
    compile: (ctx) => literal(ctx.values.value),
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
};