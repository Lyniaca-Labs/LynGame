import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";
import { ActionsMenu, MenuAction } from "./ActionsMenu";

export interface TreeNodeBadge {
  id: string;
  icon: React.ReactNode;
  onClick?: (node: TreeNode) => void;
  tooltip?: string;
  className?: string;
  persistent?: boolean; // if true, always visible; otherwise only shows on row hover
}

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[]; // absence of children = leaf/file
  onClick?: (node: TreeNode) => void; // per-node click handler, leaf nodes only
  badges?: TreeNodeBadge[]; // small icons rendered next to the label (e.g. "start scene" star)
  // Marks a node as inherited-but-not-real — e.g. a prefab's child shown
  // under an instance before any override has been made for it. Renders
  // dimmed/italic so it reads as "not a real entity yet" at a glance.
  ghost?: boolean;
  // Free-form data a tree instance can stash on a node and read back out of
  // the node passed to onDropNode — e.g. Explorer.tsx uses this to carry
  // an entity's sceneId/parentId so drop targeting can resolve "same parent
  // as this node" for sibling drops without re-deriving it from node.id.
  meta?: unknown;
}

// Where a drag was released relative to the target row: "before"/"after"
// mean "as a sibling of the target, at that position"; "inside" means "as
// a child of the target". Computed from cursor Y within the row's own
// bounding box (top ~30% / middle ~40% / bottom ~30%).
export type DropPosition = "before" | "inside" | "after";

// MIME-ish key used for native HTML5 drag-and-drop of tree rows, matching
// the pattern already used for asset drag (see Explorer.tsx's AssetCard /
// Inspector.tsx's field drop target) — a plain dataTransfer string, no DnD
// library involved.
const DRAG_MIME = "application/x-lyngame-tree-node";

function resolveDropPosition(e: React.DragEvent<Element>): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect();
  const fraction = (e.clientY - rect.top) / rect.height;
  if (fraction < 0.3) return "before";
  if (fraction > 0.7) return "after";
  return "inside";
}

interface FolderTreeProps {
  node: TreeNode;
  depth?: number;
  defaultOpen?: boolean;
  getActions?: (node: TreeNode) => MenuAction[];
  onSelect?: (node: TreeNode) => void;
  selectedId?: string;
  // Drag-and-drop, opt-in per tree instance. If either prop is omitted,
  // rows render exactly as before (not draggable, not a drop target) — safe
  // to leave both unset for trees that don't need it (scenes/prefabs/
  // scripts/components sections).
  getDragId?: (node: TreeNode) => string | undefined; // undefined = this node can't be dragged
  onDropNode?: (draggedId: string, targetNode: TreeNode, position: DropPosition) => void;
}

export function FolderTree({
  node,
  depth = 0,
  defaultOpen = false,
  getActions,
  onSelect,
  selectedId,
  getDragId,
  onDropNode,
}: FolderTreeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = !!node.children?.length;
  const isSelected = selectedId === node.id;

  const dragId = getDragId?.(node);
  const canDrag = dragId !== undefined;
  const canDrop = !!onDropNode;

  const handleRowClick = () => {
    node.onClick?.(node);
    onSelect?.(node);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!dragId) return;
    e.dataTransfer.setData(DRAG_MIME, dragId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canDrop || !e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Only touch state when the computed position actually changes — the
    // browser fires dragover continuously (many times a second) as the
    // cursor moves, and re-setting the same value every time was the main
    // cause of the drop-indicator flicker.
    const next = resolveDropPosition(e);
    setDropPosition((prev) => (prev === next ? prev : next));
  };

  // dragenter/dragleave fire for every child element inside the row too
  // (the chevron button, label, badges), which — without this containment
  // check — toggled the highlight on/off dozens of times per second as the
  // cursor crossed those internal boundaries. `relatedTarget` is the
  // element being entered on dragleave; if it's still inside this row,
  // it's an internal hop, not a real "left the row" event.
  const handleDragLeave = (e: React.DragEvent) => {
    if (!canDrop) return;
    if (rowRef.current && e.relatedTarget instanceof Node && rowRef.current.contains(e.relatedTarget)) return;
    setDropPosition(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canDrop) return;
    const draggedId = e.dataTransfer.getData(DRAG_MIME);
    const position = dropPosition ?? resolveDropPosition(e);
    setDropPosition(null);
    if (!draggedId) return;
    e.preventDefault();
    e.stopPropagation();
    onDropNode!(draggedId, node, position);
  };

  return (
    <div>
      <div
        ref={rowRef}
        className={cn(
          "group relative flex items-center gap-1 rounded px-1 py-1 cursor-pointer select-none",
          isSelected
            ? "bg-(--color-accent)/20"
            : "hover:bg-(--color-border)",
          dropPosition === "inside" && "ring-1 ring-inset ring-(--color-accent)"
        )}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={handleRowClick}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dropPosition === "before" && (
          <div className="pointer-events-none absolute inset-x-1 top-0 h-0.5 -translate-y-px bg-(--color-accent)" />
        )}
        {dropPosition === "after" && (
          <div className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 translate-y-px bg-(--color-accent)" />
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggleClick}
            className="flex shrink-0 items-center justify-center"
          >
            <ChevronRight
              size={18}
              className={cn(
                "text-(--color-text-faint) transition-transform",
                open && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span
          className={cn(
            "flex flex-1 items-center gap-1 truncate font-mono text-xs text-(--color-text)",
            node.ghost && "italic text-(--color-text-faint) opacity-70"
          )}
        >
          <span className="truncate">{node.label}</span>
          <div className="flex items-center gap-1 pl-1">
            {node.badges?.map((badge) => (
              <button
                key={badge.id}
                type="button"
                title={badge.tooltip}
                onClick={(e) => {
                  e.stopPropagation();
                  badge.onClick?.(node);
                }}
                className={cn(
                  "flex shrink-0 items-center justify-center",
                  badge.onClick && "cursor-pointer",
                  !badge.persistent && "opacity-0 group-hover:opacity-100",
                  badge.className
                )}
              >
                {badge.icon}
              </button>
            ))}
          </div>
          {hasChildren && (
            <span className="ml-1 text-(--color-text-faint)">
              ({node.children!.length})
            </span>
          )}
        </span>

        {getActions && (
          <span
            className="opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsMenu actions={getActions(node)} />
          </span>
        )}
      </div>

      {/* Recursive part: FolderTree renders FolderTree for each child */}
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <FolderTree
              key={child.id}
              node={child}
              depth={depth + 1}
              getActions={getActions}
              onSelect={onSelect}
              selectedId={selectedId}
              getDragId={getDragId}
              onDropNode={onDropNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}