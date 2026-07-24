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
//
// This intentionally does NOT support control-flow/loops — it compiles a
// pure dataflow graph into a single expression tree per output. That's a
// deliberate scope cut; add statement-emitting node types later if needed.

import type { GraphValue, GraphNode, GraphEdge } from "../GraphEditor";
import type { ScriptNodeTypes, CompiledInputs } from "./scriptNodeTypes";

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

function sanitizeVarName(nodeId: string): string {
  return `n_${nodeId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function compileScriptGraph(
  graph: GraphValue,
  nodeTypes: ScriptNodeTypes,
  options: CompileOptions = {}
): CompileResult {
  const { functionName = "run", paramName = "input" } = options;
  const errors: string[] = [];

  const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));

  // For a given (targetNodeId, targetHandle) find the (sourceNodeId, sourceHandle)
  // feeding it. If a handle has multiple incoming edges, the last one wins and
  // a warning is recorded.
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
  const varByNode = new Map<string, string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function resolveNode(nodeId: string): string | undefined {
    if (varByNode.has(nodeId)) return varByNode.get(nodeId);

    const node = nodesById.get(nodeId);
    if (!node) {
      errors.push(`Edge references missing node "${nodeId}".`);
      return undefined;
    }

    if (visiting.has(nodeId)) {
      errors.push(`Cycle detected at node "${nodeId}" (${node.type}).`);
      return undefined;
    }
    if (visited.has(nodeId)) return varByNode.get(nodeId);

    const def = node.type ? nodeTypes[node.type] : undefined;
    if (!def) {
      errors.push(`Unknown node type "${node.type}" on node "${nodeId}".`);
      return undefined;
    }

    visiting.add(nodeId);

    const inputs: CompiledInputs = {};
    for (const port of def.inputs ?? []) {
      const edge = incoming.get(`${nodeId}::${port.id}`);
      if (edge) {
        const sourceVar = resolveNode(edge.source);
        if (sourceVar !== undefined) inputs[port.id] = sourceVar;
      }
      // If unconnected, the node's own `compile` fn is expected to fall
      // back to its field value (see scriptNodeTypes' `inputOr` helper).
    }

    visiting.delete(nodeId);
    visited.add(nodeId);

    let expr: string;
    try {
      expr = def.compile({ node, values: node.data?.values ?? {}, inputs });
    } catch (err) {
      errors.push(
        `compile() threw for node "${nodeId}" (${node.type}): ${err instanceof Error ? err.message : String(err)
        }`
      );
      return undefined;
    }

    const varName = sanitizeVarName(nodeId);
    statements.push(`  const ${varName} = ${expr};`);
    varByNode.set(nodeId, varName);
    return varName;
  }

  const outputNodes = graph.nodes.filter((n) => n.type === "script.output");
  if (outputNodes.length === 0) {
    errors.push('No "script.output" node found — nothing to return.');
    return { code: "", errors };
  }

  const keyedResults: { key: string; varName: string }[] = [];
  let bareResultVar: string | undefined;

  for (const outputNode of outputNodes) {
    const varName = resolveNode(outputNode.id);
    if (varName === undefined) continue;
    const key = String((outputNode.data?.values as Record<string, unknown> | undefined)?.key ?? "").trim();
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