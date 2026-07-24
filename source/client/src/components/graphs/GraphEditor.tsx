// GraphEditor.tsx
//
// A standalone, fully generic node-graph editor. It knows nothing about
// visual scripting, textures, audio, or procedural generation specifically —
// every node type it can render comes from a `nodeTypes` registry you pass
// in, so extensions to the engine can add their own node types just by
// contributing more entries to that object at runtime.
//
// Requires: `npm install @xyflow/react` (React Flow v12+).
// The graph edges/nodes shape is a plain, serializable object
// ({ nodes, edges }), so it's trivial to persist to disk or send over
// whatever project-save pipeline you already have (see Inspector.tsx).
//
// ---------------------------------------------------------------------------
// Minimal usage:
//
//   const nodeTypes: Record<string, GraphNodeTypeDefinition> = {
//     "math.add": {
//       type: "math.add",
//       label: "Add",
//       category: "Math",
//       inputs: [
//         { id: "a", label: "A", dataType: "number" },
//         { id: "b", label: "B", dataType: "number" },
//       ],
//       outputs: [{ id: "result", label: "Result", dataType: "number" }],
//     },
//     "math.constant": {
//       type: "math.constant",
//       label: "Constant",
//       category: "Math",
//       outputs: [{ id: "value", label: "Value", dataType: "number" }],
//       fields: [{ key: "value", type: "number", defaultValue: 0 }],
//     },
//   };
//
//   const [graph, setGraph] = useState<GraphValue>({ nodes: [], edges: [] });
//
//   <GraphEditor nodeTypes={nodeTypes} value={graph} onChange={setGraph} />
//
// Extensions add more node types just by merging into the registry object
// you build before render, e.g. `{ ...coreNodeTypes, ...extensionNodeTypes }`.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  memo,
  useEffect
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  type NodeTypes as RFNodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Search, Trash2, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Public types — the registry shape extensions author against.
// ---------------------------------------------------------------------------

/** Same vocabulary as Inspector.tsx's ComponentFieldDefinition, plus "select". */
export type GraphFieldType =
  | "number"
  | "boolean"
  | "color"
  | "text"
  | "vector"
  | "select";

export interface GraphFieldOption {
  value: string;
  label: string;
}

export interface GraphFieldDefinition {
  key: string;
  label?: string;
  type: GraphFieldType;
  defaultValue?: unknown;
  /** Only used when type === "select". */
  options?: GraphFieldOption[];
  /** Only used when type === "number". */
  min?: number;
  max?: number;
  step?: number;
}

export interface GraphPortDefinition {
  id: string;
  label?: string;
  /**
   * Free-form type tag used for color-coding and optional connection
   * validation — e.g. "number", "texture", "audio", "flow", "vector",
   * "any". Nodes from different domains (visual scripting vs procedural
   * textures, say) can use entirely different tag vocabularies; nothing
   * here is hardcoded to one domain. Leave undefined or use "any" to
   * always allow the connection regardless of the other side's tag.
   */
  dataType?: string;
}

export interface GraphNodeTypeDefinition {
  /** Unique key, e.g. "math.add", "texture.noise", "audio.oscillator". */
  type: string;
  label: string;
  /** Groups this node type in the add-node search menu. */
  category?: string;
  /** Any CSS color for the header accent. Auto-derived from category if omitted. */
  color?: string;
  description?: string;
  inputs?: GraphPortDefinition[];
  outputs?: GraphPortDefinition[];
  /** Inline-editable parameters, rendered the same way Inspector renders component fields. */
  fields?: GraphFieldDefinition[];
  /** Node body width in px. Defaults to 220. */
  width?: number;
}

export interface GraphNodeData extends Record<string, unknown> {
  values: Record<string, unknown>;
}

export type GraphNode = Node<GraphNodeData, string>;
export type GraphEdge = Edge;

export interface GraphValue {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Default type-color palette. Override/extend via the `typeColors` prop —
// unrecognized dataTypes just fall back to a neutral gray dot, so you never
// have to register a color before a new port type "works".
// ---------------------------------------------------------------------------

const DEFAULT_TYPE_COLORS: Record<string, string> = {
  any: "#8b93a1",
  flow: "#e5e7eb",
  number: "#60a5fa",
  boolean: "#f472b6",
  string: "#4ade80",
  text: "#4ade80",
  color: "#c084fc",
  vector: "#2dd4bf",
  texture: "#fb923c",
  audio: "#818cf8",
};

// A small deterministic palette for auto-coloring node headers when a node
// type doesn't specify `color` — keeps categories visually distinct without
// requiring every node type author to pick a hex value.
const CATEGORY_PALETTE = [
  "#3b6ea5", "#a5573b", "#3ba573", "#7a3ba5",
  "#a5953b", "#3b8ea5", "#a53b6e", "#5ba53b",
];

const EDGE_FLOW_KEYFRAMES = `
@keyframes graph-edge-flow {
  to { stroke-dashoffset: -12; }
}
`;

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}

function colorForType(
  dataType: string | undefined,
  typeColors: Record<string, string>
): string {
  if (!dataType) return typeColors.any ?? "#8b93a1";
  return typeColors[dataType] ?? typeColors.any ?? "#8b93a1";
}

// ---------------------------------------------------------------------------
// Context used to hand the registry + mutation callbacks down to the
// generic node renderer without threading them through react-flow's own
// node props (react-flow only gives each node component id/data/type/etc).
// ---------------------------------------------------------------------------

interface NodeRenderContextValue {
  registry: Record<string, GraphNodeTypeDefinition>;
  typeColors: Record<string, string>;
  readOnly: boolean;
  onFieldChange: (nodeId: string, key: string, value: unknown) => void;
  onRemoveNode: (nodeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
}

const NodeRenderContext = createContext<NodeRenderContextValue | null>(null);

// ---------------------------------------------------------------------------
// Generic node renderer — the ONE component used for every node type. What
// it renders is entirely driven by the matching GraphNodeTypeDefinition.
// ---------------------------------------------------------------------------

const GenericGraphNode = memo(function GenericGraphNode({ id, data, selected, type }: NodeProps) {
  const ctx = useContext(NodeRenderContext);
  if (!ctx) return null;

  const def = type ? ctx.registry[type] : undefined;

  if (!def) {
    return (
      <div className="rounded border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-2 py-1 text-xs text-[var(--color-danger)]">
        Unknown node type{type ? `: ${type}` : ""}
      </div>
    );
  }

  const values = (data as GraphNodeData)?.values ?? {};
  const accent = def.color ?? hashColor(def.category ?? def.type);
  const inputs = def.inputs ?? [];
  const outputs = def.outputs ?? [];
  const fields = def.fields ?? [];

  return (
    <div
      className={`rounded-md border text-xs shadow-sm ${selected
          ? "border-[var(--color-accent-secondary)] ring-1 ring-[var(--color-accent-secondary)]"
          : "border-[var(--color-border)]"
        } bg-[var(--color-bg-elevated)]`}
      style={{ width: def.width ?? 220 }}
    >
      <div
        className="flex items-center justify-between gap-2 rounded-t-md px-2 py-1"
        style={{ background: accent }}
        title={def.description}
      >
        <span className="truncate font-medium text-white">{def.label}</span>
        {!ctx.readOnly && (
          <button
            type="button"
            className="nodrag shrink-0 text-white/70 hover:text-white"
            onClick={() => ctx.onRemoveNode(id)}
            aria-label={`Remove ${def.label}`}
            title="Remove node"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {(inputs.length > 0 || outputs.length > 0) && (
        <div className="grid grid-cols-2 gap-2 px-1 py-1.5">
          <div className="space-y-1">
            {inputs.map((port) => (
              <div
                key={port.id}
                className="relative py-0.5 pl-2 text-[var(--color-text-faint)]"
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={port.id}
                  style={{
                    width: 8,
                    height: 8,
                    background: colorForType(port.dataType, ctx.typeColors),
                    border: "1px solid var(--color-bg-elevated)",
                  }}
                />
                {port.label ?? port.id}
              </div>
            ))}
          </div>
          <div className="space-y-1 text-right">
            {outputs.map((port) => (
              <div
                key={port.id}
                className="relative py-0.5 pr-2 text-[var(--color-text-faint)]"
              >
                {port.label ?? port.id}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={port.id}
                  style={{
                    width: 8,
                    height: 8,
                    background: colorForType(port.dataType, ctx.typeColors),
                    border: "1px solid var(--color-bg-elevated)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--color-border)] p-2">
          {fields.map((field) => (
            <GraphFieldEditor
              key={field.key}
              field={field}
              value={values[field.key] ?? field.defaultValue}
              disabled={ctx.readOnly}
              onChange={(v) => ctx.onFieldChange(id, field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Field editor — same field-type vocabulary and look as Inspector.tsx's
// SchemaField, plus "select" (backed by a plain native <select> here so it
// works regardless of whether your own Select component supports a
// controlled `value` prop — swap it in if it does, for visual consistency).
//
// Every interactive element gets the "nodrag" class: without it, react-flow
// treats mousedown-drag inside the node as an attempt to drag the node
// itself, which makes number/vector fields impossible to use.
// ---------------------------------------------------------------------------

function GraphFieldEditor({
  field,
  value,
  disabled,
  onChange,
}: {
  field: GraphFieldDefinition;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const label = field.label ?? field.key;

  if (field.type === "vector") {
    const vec = (value as { x?: number; y?: number }) ?? {};
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--color-text-faint)]">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="nodrag w-12 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-right text-[var(--color-text)]"
            value={vec.x ?? 0}
            disabled={disabled}
            onChange={(e) => onChange({ ...vec, x: Number(e.target.value) })}
          />
          <input
            type="number"
            className="nodrag w-12 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-right text-[var(--color-text)]"
            value={vec.y ?? 0}
            disabled={disabled}
            onChange={(e) => onChange({ ...vec, y: Number(e.target.value) })}
          />
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label className="flex items-center justify-between gap-2">
        <span className="text-[var(--color-text-faint)]">{label}</span>
        <select
          className="nodrag w-28 rounded border border-[var(--color-border)] bg-transparent px-1 py-0.5 text-[var(--color-text)]"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-text-faint)]">{label}</span>
      {field.type === "number" && (
        <input
          type="number"
          className="nodrag w-20 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
          value={value as number}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      {field.type === "boolean" && (
        <input
          type="checkbox"
          className="nodrag"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}
      {field.type === "color" && (
        <input
          type="color"
          className="nodrag h-5 w-8 rounded border border-[var(--color-border)] bg-transparent"
          value={value as string}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.type === "text" && (
        <input
          type="text"
          className="nodrag w-28 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-[var(--color-text)]"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Add-node search menu — a small popover, opened by right-clicking the
// canvas or the toolbar "+" button. Filters by label/category/type as you type.
// ---------------------------------------------------------------------------

interface MenuState {
  /** Position within the wrapper element, for CSS placement of the popover. */
  screenX: number;
  screenY: number;
  /** Position in graph/flow space, for where the new node actually lands. */
  flowX: number;
  flowY: number;
}

function NodeSearchMenu({
  registry,
  menu,
  onPick,
  onClose,
}: {
  registry: Record<string, GraphNodeTypeDefinition>;
  menu: MenuState;
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const defs = Object.values(registry).filter((def) => {
      if (!q) return true;
      return (
        def.label.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        (def.category ?? "").toLowerCase().includes(q)
      );
    });

    const byCategory = new Map<string, GraphNodeTypeDefinition[]>();
    for (const def of defs) {
      const cat = def.category ?? "Other";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(def);
    }
    return Array.from(byCategory.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }, [registry, query]);

  return (
    <div
      className="absolute z-50 flex max-h-80 w-56 flex-col rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg"
      style={{ left: menu.screenX, top: menu.screenY }}
      // Stop react-flow's pane handlers from eating these events.
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-2 py-1.5">
        <Search size={12} className="shrink-0 text-[var(--color-text-faint)]" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter") {
              const first = grouped[0]?.[1]?.[0];
              if (first) onPick(first.type);
            }
          }}
          placeholder="Search nodes…"
          className="w-full bg-transparent text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>

      <div className="overflow-y-auto p-1">
        {grouped.length === 0 && (
          <div className="px-2 py-2 text-xs italic text-[var(--color-text-faint)]">
            No matching nodes
          </div>
        )}
        {grouped.map(([category, defs]) => (
          <div key={category} className="mb-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
              {category}
            </div>
            {defs.map((def) => {
              const accent = def.color ?? hashColor(def.category ?? def.type);
              return (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => onPick(def.type)}
                  title={def.description}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-border)]/40"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: accent }}
                  />
                  <span className="truncate">{def.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const ctx = useContext(NodeRenderContext);
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showControls = (selected || hovered) && !ctx?.readOnly;
  const stroke = (style as React.CSSProperties)?.stroke ?? "var(--color-text-faint)";

  return (
    <>
      {/* Wide, fully transparent path — the actual click/hover target.
          Renders nothing visible; only exists to make the edge easy to
          grab with the mouse, since the visible line below stays thin. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          ctx?.onRemoveEdge(id);
        }}
      />

      {/* The ONE visible line. No BaseEdge here — we render the path
          ourselves so the dash animation applies directly to what's drawn,
          instead of layering an animated dashed line on top of a separate
          static solid one. */}
      <path
        d={edgePath}
        fill="none"
        markerEnd={markerEnd}
        stroke={stroke}
        strokeWidth={selected || hovered ? 2.5 : 1.5}
        strokeLinecap="butt"
        strokeDasharray="8 6"
        opacity={hovered && !selected ? 0.85 : 1}
        className="react-flow__edge-path"
        style={{ pointerEvents: "none" }}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="14"
          to="0"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>

      {showControls && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-faint)] shadow-sm hover:border-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => {
              e.stopPropagation();
              ctx?.onRemoveEdge(id);
            }}
            title="Remove connection"
          >
            <X size={13} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface GraphEditorProps {
  /** The set of node types this editor instance can render/add. Merge core + extension registries before passing this in. */
  nodeTypes: Record<string, GraphNodeTypeDefinition>;
  value: GraphValue;
  onChange: (value: GraphValue) => void;
  /** Extend or override the default port dataType -> color mapping. */
  typeColors?: Record<string, string>;
  /** When true, nodes/fields/handles render but can't be edited, added, or removed. */
  readOnly?: boolean;
  className?: string;
  showMiniMap?: boolean;
  showControls?: boolean;
  /** Shown as a hint in the empty state and the toolbar tooltip. */
  emptyMessage?: string;
  /** Called on Ctrl/Cmd+S. The component has no built-in persistence — you decide what "save" means. */
  onSave?: (value: GraphValue) => void;
  /** Max number of undo steps to retain. Defaults to 100. */
  maxHistory?: number;
}

export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <GraphEditorCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphEditorCanvas({
  nodeTypes: registry,
  value,
  onChange,
  typeColors,
  readOnly = false,
  className,
  showMiniMap = true,
  showControls = true,
  emptyMessage = "Right-click, or use the + button, to add a node",
  onSave,
  maxHistory = 100,
}: GraphEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Undo/redo history. Refs, not state — we don't need a re-render when the
  // stacks change, only when `value` itself (owned by the parent) changes.
  const historyPast = useRef<GraphValue[]>([]);
  const historyFuture = useRef<GraphValue[]>([]);
  // Avoids pushing history from inside undo/redo's own onChange call.
  const isTimeTraveling = useRef(false);

  const pushHistory = useCallback(() => {
    historyPast.current.push(value);
    if (historyPast.current.length > maxHistory) historyPast.current.shift();
    historyFuture.current = [];
  }, [value, maxHistory]);

  const clipboardRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);

  const copySelection = useCallback(() => {
    const selectedNodes = value.nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const relevantEdges = value.edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    clipboardRef.current = {
      nodes: selectedNodes.map((n) => structuredClone(n)),
      edges: relevantEdges.map((e) => structuredClone(e)),
    };
  }, [value]);

  const cutSelection = useCallback(() => {
    if (readOnly) return;
    copySelection();
    const selectedIds = new Set(value.nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    pushHistory();
    onChange({
      nodes: value.nodes.filter((n) => !selectedIds.has(n.id)),
      edges: value.edges.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)),
    });
  }, [value, onChange, readOnly, copySelection, pushHistory]);

  const pasteClipboard = useCallback(() => {
    if (readOnly || !clipboardRef.current) return;
    const { nodes: copiedNodes, edges: copiedEdges } = clipboardRef.current;
    pushHistory();

    const idMap = new Map<string, string>();
    const offset = 40; // px, so pasted nodes are visibly distinct from the source

    const pastedNodes: GraphNode[] = copiedNodes.map((n) => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        selected: true,
        position: { x: n.position.x + offset, y: n.position.y + offset },
      };
    });

    const pastedEdges: GraphEdge[] = copiedEdges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    onChange({
      // deselect existing nodes so only the pasted ones are highlighted
      nodes: [...value.nodes.map((n) => ({ ...n, selected: false })), ...pastedNodes],
      edges: [...value.edges, ...pastedEdges],
    });
  }, [value, onChange, readOnly, pushHistory]);

  const undo = useCallback(() => {
    if (readOnly || historyPast.current.length === 0) return;
    const previous = historyPast.current.pop()!;
    historyFuture.current.push(value);
    isTimeTraveling.current = true;
    onChange(previous);
  }, [value, onChange, readOnly]);

  const redo = useCallback(() => {
    if (readOnly || historyFuture.current.length === 0) return;
    const next = historyFuture.current.pop()!;
    historyPast.current.push(value);
    isTimeTraveling.current = true;
    onChange(next);
  }, [value, onChange, readOnly]);


  const mergedTypeColors = useMemo(
    () => ({ ...DEFAULT_TYPE_COLORS, ...typeColors }),
    [typeColors]
  );

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isEditableTarget(e.target)) return;

      switch (e.key.toLowerCase()) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) redo(); // Ctrl+Shift+Z as a common redo alt
          else undo();
          break;
        case "y":
          e.preventDefault();
          redo();
          break;
        case "x":
          e.preventDefault();
          cutSelection();
          break;
        case "c":
          e.preventDefault();
          copySelection();
          break;
        case "v":
          e.preventDefault();
          pasteClipboard();
          break;
        case "s":
          e.preventDefault();
          onSave?.(value);
          break;
        case "d":
          e.preventDefault();
          copySelection();
          pasteClipboard();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, cutSelection, copySelection, pasteClipboard, onSave, value]);

  // react-flow wants one component per node.type; we only have one
  // component (GenericGraphNode), so map every registry key to it.
  const rfNodeTypes: RFNodeTypes = useMemo(() => {
    const map: RFNodeTypes = {};
    for (const key of Object.keys(registry)) {
      map[key] = GenericGraphNode;
    }
    return map;
  }, [registry]);

  const rfEdgeTypes = useMemo(() => ({ default: DeletableEdge }), []);

  const handleFieldChange = useCallback(
    (nodeId: string, key: string, fieldValue: unknown) => {
      if (readOnly) return;
      pushHistory();
      const nextNodes = value.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, values: { ...n.data.values, [key]: fieldValue } } }
          : n
      );
      onChange({ nodes: nextNodes, edges: value.edges });
    },
    [value, onChange, readOnly, pushHistory]
  );

  const handleRemoveEdge = useCallback(
    (edgeId: string) => {
      if (readOnly) return;
      pushHistory();
      onChange({
        nodes: value.nodes,
        edges: value.edges.filter((e) => e.id !== edgeId),
      });
    },
    [value, onChange, readOnly, pushHistory]
  );

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      pushHistory();
      onChange({
        nodes: value.nodes.filter((n) => n.id !== nodeId),
        edges: value.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      });
    },
    [value, onChange, readOnly, pushHistory]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      pushHistory();
      onChange({
        nodes: value.nodes,
        edges: addEdge({ ...connection, id: crypto.randomUUID() }, value.edges),
      });
    },
    [value, onChange, readOnly, pushHistory]
  );

  const contextValue = useMemo<NodeRenderContextValue>(
    () => ({
      registry,
      typeColors: mergedTypeColors,
      readOnly,
      onFieldChange: handleFieldChange,
      onRemoveNode: handleRemoveNode,
      onRemoveEdge: handleRemoveEdge
    }),
    [registry, mergedTypeColors, readOnly, handleFieldChange, handleRemoveNode, handleRemoveEdge]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (readOnly) return;
      const isSignificant = changes.some(
        (c) => c.type === "remove" || (c.type === "position" && c.dragging === false)
      );
      if (isSignificant) pushHistory();

      const nextNodes = applyNodeChanges(changes, value.nodes) as GraphNode[];

      // Any node ids removed in this batch of changes need their edges
      // cleaned up too — React Flow's own deleteKeyCode path only emits
      // node-remove changes, it doesn't touch edges for us.
      const removedIds = new Set(
        changes.filter((c) => c.type === "remove").map((c) => c.id)
      );
      const nextEdges =
        removedIds.size > 0
          ? value.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target))
          : value.edges;

      onChange({ nodes: nextNodes, edges: nextEdges });
    },
    [value, onChange, readOnly, pushHistory]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (readOnly) return;
      if (changes.some((c) => c.type === "remove")) pushHistory();
      onChange({
        nodes: value.nodes,
        edges: applyEdgeChanges(changes, value.edges),
      });
    },
    [value, onChange, readOnly, pushHistory]
  );


  // Unknown/untagged ports never block a connection — type-checking is a
  // guardrail for the domains that opt into it, not a requirement.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = value.nodes.find((n) => n.id === connection.source);
      const targetNode = value.nodes.find((n) => n.id === connection.target);
      const sourceDef = sourceNode ? registry[sourceNode.type ?? ""] : undefined;
      const targetDef = targetNode ? registry[targetNode.type ?? ""] : undefined;
      const outPort = sourceDef?.outputs?.find(
        (p) => p.id === connection.sourceHandle
      );
      const inPort = targetDef?.inputs?.find(
        (p) => p.id === connection.targetHandle
      );
      if (!outPort || !inPort) return true;
      if (!outPort.dataType || !inPort.dataType) return true;
      if (outPort.dataType === "any" || inPort.dataType === "any") return true;
      return outPort.dataType === inPort.dataType;
    },
    [value.nodes, registry]
  );

  // Color-code edges by their source port's dataType so a connection's
  // "kind" is visible at a glance, same idea as the port dots.
  const nodeTypeById = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const n of value.nodes) map.set(n.id, n.type);
    return map;
  }, [value.nodes.map(n => `${n.id}:${n.type}`).join(",")]); // only changes on add/remove/type change, not drag

  const styledEdges = useMemo(() => {
    return value.edges.map((edge) => {
      const sourceType = nodeTypeById.get(edge.source);
      const sourceDef = sourceType ? registry[sourceType] : undefined;
      const port = sourceDef?.outputs?.find((p) => p.id === edge.sourceHandle);
      const stroke = colorForType(port?.dataType, mergedTypeColors);
      return { ...edge, style: { stroke, strokeWidth: 1.5, ...edge.style } };
    });
  }, [value.edges, nodeTypeById, registry, mergedTypeColors]);

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const def = registry[type];
      if (!def) return;
      pushHistory();
      const initialValues: Record<string, unknown> = {};
      for (const f of def.fields ?? []) initialValues[f.key] = f.defaultValue;
      const newNode: GraphNode = {
        id: crypto.randomUUID(),
        type,
        position,
        data: { values: initialValues },
      };
      onChange({ nodes: [...value.nodes, newNode], edges: value.edges });
    },
    [registry, value, onChange, pushHistory]
  );

  const openMenuAt = useCallback(
    (screenX: number, screenY: number) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const flowPos = screenToFlowPosition({ x: screenX, y: screenY });
      setMenu({
        screenX: screenX - bounds.left,
        screenY: screenY - bounds.top,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [screenToFlowPosition]
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (readOnly) return;
      openMenuAt(event.clientX, event.clientY);
    },
    [openMenuAt, readOnly]
  );

  const handleToolbarAddClick = useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;
    openMenuAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }, [openMenuAt]);

  return (
    <div
      ref={wrapperRef}
      className={`relative h-full w-full ${className ?? ""}`}
      onClick={() => menu && setMenu(null)}
    >
      <style>{EDGE_FLOW_KEYFRAMES}</style>
      <NodeRenderContext.Provider value={contextValue}>
        <ReactFlow
          nodes={value.nodes}
          edges={styledEdges}
          nodeTypes={rfNodeTypes}
          edgeTypes={rfEdgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          onPaneContextMenu={handlePaneContextMenu}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--color-border)"
          />

          {showControls && <Controls showInteractive={false} />}
          {showMiniMap && (
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(0,0,0,0.6)"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            />
          )}

          {!readOnly && (
            <Panel position="top-left">
              <button
                type="button"
                onClick={handleToolbarAddClick}
                title={emptyMessage}
                className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-xs text-[var(--color-text)] hover:border-[var(--color-accent-secondary)]"
              >
                <Plus size={12} />
                Add node
              </button>
            </Panel>
          )}

          {value.nodes.length === 0 && (
            <Panel position="top-center">
              <div className="mt-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs italic text-[var(--color-text-faint)]">
                {emptyMessage}
              </div>
            </Panel>
          )}
        </ReactFlow>

        {menu && (
          <NodeSearchMenu
            registry={registry}
            menu={menu}
            onPick={(type) => {
              addNode(type, { x: menu.flowX, y: menu.flowY });
              setMenu(null);
            }}
            onClose={() => setMenu(null)}
          />
        )}
      </NodeRenderContext.Provider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience helper for creating nodes outside the component, e.g. when
// loading a saved graph or having an extension drop in starter nodes.
// ---------------------------------------------------------------------------

export function createGraphNode(
  def: GraphNodeTypeDefinition,
  position: { x: number; y: number }
): GraphNode {
  const values: Record<string, unknown> = {};
  for (const f of def.fields ?? []) values[f.key] = f.defaultValue;
  return {
    id: crypto.randomUUID(),
    type: def.type,
    position,
    data: { values },
  };
}