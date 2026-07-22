import { useState } from "react";
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
}

interface FolderTreeProps {
  node: TreeNode;
  depth?: number;
  defaultOpen?: boolean;
  getActions?: (node: TreeNode) => MenuAction[];
  onSelect?: (node: TreeNode) => void;
  selectedId?: string;
}

export function FolderTree({
  node,
  depth = 0,
  defaultOpen = false,
  getActions,
  onSelect,
  selectedId,
}: FolderTreeProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = !!node.children?.length;
  const isSelected = selectedId === node.id;

  const handleRowClick = () => {
    node.onClick?.(node);
    onSelect?.(node);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded px-1 py-1 cursor-pointer select-none",
          isSelected
            ? "bg-(--color-accent)/20"
            : "hover:bg-(--color-border)"
        )}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={handleRowClick}
      >
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

        <span className="flex flex-1 items-center gap-1 truncate font-mono text-xs text-(--color-text)">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}