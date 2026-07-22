// ActionsMenu.tsx
import { LucideIcon, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownItem } from "./Dropdown";

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ActionsMenu({
  actions,
  align = "end",
}: {
  actions: MenuAction[];
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu
      align={align}
      trigger={
        <button
          type="button"
          className="rounded p-1 text-[var(--color-text-faint)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
        >
          <MoreVertical size={14} />
        </button>
      }
    >
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <DropdownItem
            key={i}
            icon={Icon ? <Icon size={14} /> : undefined}
            danger={action.danger}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </DropdownItem>
        );
      })}
    </DropdownMenu>
  );
}