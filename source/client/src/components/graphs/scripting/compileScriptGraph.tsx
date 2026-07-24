// compileScriptGraph.ts
//
// Turns a GraphEditor GraphValue ({ nodes, edges }) into one JS function
// source string, using the `compile` fn on each node type in a
// ScriptNodeTypes registry (see scriptNodeTypes.ts).
//
// Contract:
//   - One or more "script.output" nodes mark what gets returned.
//     - Exactly one output node with no `key` field -> `return <expr>;`
//     - One or more output nodes with a `key` field  -> returns an object
//       merging every keyed output, e.g. `return { foo: n3, bar: n7 };`
//   - "script.input" nodes read off the function's single parameter.
//   - Everything else is a pure expression node wired together by edges.
//   - Node types may have multiple outputs. Their `compile` fn returns
//     either a single expression string (single-output nodes) or a
//     Record<outputPortId, string> (multi-output nodes, e.g. vector.split).
//     Each output gets its own `const` statement and variable name, and
//     edges are wired using `edge.sourceHandle` to pick the right one.
//
// This intentionally does NOT support control-flow/loops — it compiles a
// pure dataflow graph into a single expression tree per output. That's a
// deliberate scope cut; add statement-emitting node types later if needed.

import type { GraphValue, GraphNode, GraphEdge } from "../GraphEditor";
import type { ScriptNodeTypes, CompiledInputs, CompileOutput } from "./scriptNodeTypes";

export interface CompileOptions {
  /** Function name in the generated source. Defaults to "run". */
  functionName?: string;
  /** Param name for the input object. Defaults to "input". */
  paramName?: string;
}

export interface CompileResult {
  /** Empty string if `errors` is non-empty. */
  code: string;
  errors: string[];
}

/**
 * Turns a node type id like "vector.split" or "script.input" into a short,
 * identifier-safe fragment for variable names, e.g. "vectorSplit", "scriptInput".
 */
function typeFragment(nodeType: string | undefined): string {
  if (!nodeType) return "node";
  return nodeType
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join("");
}

export function compileScriptGraph(
  graph: GraphValue,
  nodeTypes: ScriptNodeTypes,
  options: CompileOptions = {}
): CompileResult {
  const { functionName = "run", paramName = "input" } = options;
  const errors: string[] = [];

  const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));

  // For a given (targetNodeId, targetHandle) find the edge feeding it.
  // If a handle has multiple incoming edges, the last one wins and a
  // warning is recorded.
  const incoming = new Map<string, GraphEdge>();
  for (const edge of graph.edges) {
    const handle = edge.targetHandle ?? "value";
    const key = `${edge.target}::${handle}`;
    if (incoming.has(key)) {
      errors.push(
        `Input "${handle}" on node ${edge.target} has more than one connection; using the last one.`
      );
    }
    incoming.set(key, edge);
  }

  const statements: string[] = [];

  // One entry per (nodeId, outputPortId) -> the generated variable name
  // holding that output's compiled expression. Single-output nodes get one
  // entry (keyed by their default port); multi-output nodes get one entry
  // per declared output.
  const varsByNodeAndPort = new Map<string, string>();
  const portKey = (nodeId: string, portId: string) => `${nodeId}::${portId}`;

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let nextVarNum = 1;

  /**
   * Resolves a node's output on a specific port, compiling the node (and,
   * recursively, its inputs) on first visit. Returns the variable name
   * holding that port's value, or undefined if resolution failed (in
   * which case an error has already been pushed to `errors`).
   */
  function resolveNodeOutput(nodeId: string, requestedPort?: string): string | undefined {
    const node = nodesById.get(nodeId);
    if (!node) {
      errors.push(`Edge references missing node "${nodeId}".`);
      return undefined;
    }

    const def = node.type ? nodeTypes[node.type] : undefined;
    if (!def) {
      errors.push(`Unknown node type "${node.type}" on node "${nodeId}".`);
      return undefined;
    }

    // Default port: whatever was requested, else the node's first declared
    // output, else "value" (matches single-output nodes with no `outputs`
    // metadata at all, e.g. script.output).
    const defaultPort = def.outputs?.[0]?.id ?? "value";
    const port = requestedPort ?? defaultPort;

    const cachedKey = portKey(nodeId, port);
    if (varsByNodeAndPort.has(cachedKey)) return varsByNodeAndPort.get(cachedKey);

    if (visited.has(nodeId)) {
      // Node was already compiled but this specific port was never
      // populated — means compile() didn't return this port, or the edge
      // references a port that doesn't exist on this node type.
      errors.push(`Node "${nodeId}" (${node.type}) has no output named "${port}".`);
      return undefined;
    }

    if (visiting.has(nodeId)) {
      errors.push(`Cycle detected at node "${nodeId}" (${node.type}).`);
      return undefined;
    }
    visiting.add(nodeId);

    const inputs: CompiledInputs = {};
    for (const inPort of def.inputs ?? []) {
      const edge = incoming.get(`${nodeId}::${inPort.id}`);
      if (edge) {
        const sourceVar = resolveNodeOutput(edge.source, edge.sourceHandle ?? undefined);
        if (sourceVar !== undefined) inputs[inPort.id] = sourceVar;
      }
      // If unconnected, the node's own `compile` fn is expected to fall
      // back to its field value (see scriptNodeTypes' `inputOr` helper).
    }

    visiting.delete(nodeId);
    visited.add(nodeId);

    let result: CompileOutput;
    try {
      result = def.compile({ node, values: node.data?.values ?? {}, inputs });
    } catch (err) {
      errors.push(
        `compile() threw for node "${nodeId}" (${node.type}): ${err instanceof Error ? err.message : String(err)
        }`
      );
      return undefined;
    }

    const baseVar = `n${nextVarNum++}_${typeFragment(node.type)}`;

    if (typeof result === "string") {
      // Single-output node: one statement, cached under its default port.
      statements.push(`  const ${baseVar} = ${result};`);
      varsByNodeAndPort.set(portKey(nodeId, defaultPort), baseVar);
    } else {
      // Multi-output node: one statement per port, suffixed variable names
      // (e.g. n_abc123_x, n_abc123_y) so each output is independently
      // addressable by downstream edges.
      for (const [outPort, expr] of Object.entries(result)) {
        const varName = `${baseVar}_${outPort}`;
        statements.push(`  const ${varName} = ${expr};`);
        varsByNodeAndPort.set(portKey(nodeId, outPort), varName);
      }
    }

    return varsByNodeAndPort.get(portKey(nodeId, port));
  }

  const outputNodes = graph.nodes.filter((n) => n.type === "script.output");
  if (outputNodes.length === 0) {
    errors.push('No "script.output" node found — nothing to return.');
    return { code: "", errors };
  }

  const keyedResults: { key: string; varName: string }[] = [];
  let bareResultVar: string | undefined;

  for (const outputNode of outputNodes) {
    const varName = resolveNodeOutput(outputNode.id);
    if (varName === undefined) continue;
    const key = String(
      (outputNode.data?.values as Record<string, unknown> | undefined)?.key ?? ""
    ).trim();
    if (key) {
      keyedResults.push({ key, varName });
    } else if (bareResultVar) {
      errors.push(
        'More than one unkeyed "script.output" node found — give each a "key", or keep only one unkeyed.'
      );
    } else {
      bareResultVar = varName;
    }
  }

  if (errors.length > 0) {
    return { code: "", errors };
  }

  const returnExpr =
    keyedResults.length > 0
      ? `{ ${keyedResults.map((r) => `${JSON.stringify(r.key)}: ${r.varName}`).join(", ")} }`
      : bareResultVar!;

  const code = [
    `function ${functionName}(${paramName}) {`,
    ...statements,
    `  return ${returnExpr};`,
    `}`,
  ].join("\n");

  return { code, errors: [] };
}