import { Container } from "../../ui/Container";
import { Tabs } from "../../ui/Tabs";
import { useProject } from "../../context/ProjectContext";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";

function openInspector(node: TreeNode) {
  console.log("Open inspector for node:", node);
  window.dispatchEvent(new CustomEvent("open-inspector", { detail: node }));
}

export function Explorer() {
  const { projectData } = useProject();

  return (
    <Container
      title="Explorer"
      description="Browse project files, scenes, and assets."
      bodyClassName="p-0"
    >
      <Tabs
        tabs={[
          {
            id: "files",
            label: "Files",
            content: (
              <ExplorerFiles />
            ),
          },
          {
            id: "assets",
            label: "Assets",
            content: (
              <ExplorerAssets />
            ),
          },
        ]}
      />
    </Container>
  );
}


function ExplorerFiles() {
  const { projectData } = useProject();

  if (!projectData) {
    return <PlaceholderPanel label="No project loaded" />;
  }

  const StartScene = projectData.project.startScene;

  const setStartScene = (sceneId: string) => {
    console.log("set start scene:", sceneId);
    // e.g. projectData.project.startScene = sceneId; then persist/update context
  };

  const sceneBadges = (sceneId: string): TreeNodeBadge[] => {
    const isStart = sceneId.replace(".json", "") === StartScene;
    return [
      {
        id: "start-scene",
        icon: (
          <Star
            size={11}
            className={
              isStart
                ? "fill-[var(--color-accent-secondary)] text-[var(--color-accent-secondary)]"
                : "text-[var(--color-text-faint)]"
            }
          />
        ),
        tooltip: isStart ? "Start scene" : "Set as start scene",
        onClick: () => setStartScene(sceneId),
        persistent: isStart,
      },
    ];
  };

  const sections: TreeNode[] = [
    {
      id: "scenes",
      label: "Scenes",
      children: projectData.scenes.map((s) => ({
        id: s,
        label: s.replace(".json", ""),
        badges: sceneBadges(s),
        onClick: () => openInspector({ id: s, label: s }),
      })),
    },
    {
      id: "scripts",
      label: "Scripts",
      children: projectData.scripts.map((s) => ({ id: s, label: s })),
    },
    {
      id: "prefabs",
      label: "Prefabs",
      children: projectData.prefabs.map((p) => ({ id: p, label: p })),
    },
    {
      id: "components",
      label: "Components",
      children: Object.keys(projectData.components).map((c) => ({ id: c, label: c })),
    },
  ];

  const getActions = (node: TreeNode): MenuAction[] => {
    const base: MenuAction[] = [
      { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
      { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) },
    ];
    if (node.children) {
      return [
        { label: "New Item", icon: Plus, onClick: () => console.log("new in", node.id) },
        ...base,
      ];
    }
    return base;
  };

  return (
    <div className="p-1">
      {sections.map((section) => (
        <FolderTree
          key={section.id}
          node={section}
          getActions={getActions}
          defaultOpen
        />
      ))}
    </div>
  );
}


function ExplorerAssets() {
  const { projectData } = useProject();

  if (!projectData) {
    return (
      <PlaceholderPanel label="No project loaded" />
    );
  }

  return (
    <div className="p-3 text-xs text-[var(--color-text-faint)]">
      Assets ({projectData.assets.length})
    </div>
  );
}


function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}