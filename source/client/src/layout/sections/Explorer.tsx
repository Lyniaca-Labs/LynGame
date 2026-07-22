import { useEffect, useState } from "react";
import { Container } from "../../ui/Container";
import { Tabs } from "../../ui/Tabs";
import { useProject } from "../../context/ProjectContext";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";
import { projectsApi, Entity } from "../../api";

export function Explorer() {
  return (
    <Container
      title="Explorer"
      description="Browse project files, scenes, and assets."
      bodyClassName="p-0"
    >
      <Tabs
        tabs={[
          { id: "files", label: "Files", content: <ExplorerFiles /> },
          { id: "assets", label: "Assets", content: <ExplorerAssets /> },
        ]}
      />
    </Container>
  );
}

function ExplorerFiles() {
  const { projectData, currentProject } = useProject();
  const { openScene, openEntity } = useSceneEditor();

  // Lazily-populated cache of each scene's entities, so scene nodes can
  // show them as children in the tree without eagerly loading everything
  // up front on every render.
  const [sceneEntities, setSceneEntities] = useState<Record<string, Entity[]>>({});

  useEffect(() => {
    if (!projectData || !currentProject) return;

    let cancelled = false;

    projectData.scenes.forEach((sceneFile) => {
      const sceneId = sceneFile.replace(".json", "");
      if (sceneEntities[sceneId]) return;

      projectsApi
        .getScene(currentProject, sceneId)
        .then((res) => {
          if (!cancelled) {
            setSceneEntities((prev) => ({ ...prev, [sceneId]: res.scene.entities }));
          }
        })
        .catch(() => {
          // Leave uncached — the scene node just renders without children
          // until this succeeds (e.g. on next project reload).
        });
    });


    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData, currentProject]);

  if (!projectData) {
    return <PlaceholderPanel label="No project loaded" />;
  }

  const startScene = projectData.project.startScene;

  const setStartScene = (sceneId: string) => {
    console.log("set start scene:", sceneId);
    // e.g. projectData.project.startScene = sceneId; then persist/update context
  };

  const sceneBadges = (sceneId: string): TreeNodeBadge[] => {
    const isStart = sceneId.replace(".json", "") === startScene;
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
      children: projectData.scenes.map((sceneFile) => {
        const sceneId = sceneFile.replace(".json", "");
        const entities = sceneEntities[sceneId];

        return {
          id: sceneFile,
          label: sceneId,
          badges: sceneBadges(sceneFile),
          onClick: () => openScene(sceneId),
          children: entities?.map((e) => ({
            id: `${sceneFile}::${e.id}`,
            label: e.id,
            onClick: () => openEntity(sceneId, e.id),
          })),
        };
      }),
    },
    {
      id: "prefabs",
      label: "Prefabs",
      children: projectData.prefabs.map((p) => ({ id: p, label: p })),
    },
    // TODO: codemirror editor for these or vscode open
    {
      id: "scripts",
      label: "Scripts",
      children: projectData.scripts.map((s) => ({ id: s, label: s })),
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
        <FolderTree key={section.id} node={section} getActions={getActions} defaultOpen />
      ))}
    </div>
  );
}

function ExplorerAssets() {
  const { projectData } = useProject();

  if (!projectData) {
    return <PlaceholderPanel label="No project loaded" />;
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