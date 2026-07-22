// Explorer.tsx — full file

import { useEffect, useState } from "react";
import { Container } from "../../ui/Container";
import { Tabs } from "../../ui/Tabs";
import { Modal } from "../../ui/Modal";
import { useProject } from "../../context/ProjectContext";
import { useSceneEditor } from "../../context/SceneEditorContext";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";
import { projectsApi, Entity } from "../../api";
import { CodeFileEditor } from "../../components/CodeFileEditor";

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

// Which code file (if any) is currently open in the editor modal.
interface OpenCodeFile {
  folder: "scripts" | "components";
  filename: string;
}

function ExplorerFiles() {
  const { projectData, currentProject } = useProject();
  const { target, scene: liveScene, openScene, openEntity, addEntity, deleteEntity } = useSceneEditor();

  // Lazily-populated cache of each scene's entities, so scene nodes can
  // show them as children in the tree without eagerly loading everything
  // up front on every render. For whichever scene is currently open in the
  // Inspector, we read live data from SceneEditorContext instead (below),
  // so edits made there — renames, adds, deletes — show up immediately.
  const [sceneEntities, setSceneEntities] = useState<Record<string, Entity[]>>({});

  // The script/component file currently open in the CodeFileEditor modal.
  const [openCodeFile, setOpenCodeFile] = useState<OpenCodeFile | null>(null);

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
        const isActiveScene = target?.sceneId === sceneId && liveScene?.name === sceneId;
        const entities = isActiveScene ? liveScene.entities : sceneEntities[sceneId];

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
    {
      id: "scripts",
      label: "Scripts",
      children: projectData.scripts.map((s) => ({
        id: s,
        label: s,
        onClick: () => setOpenCodeFile({ folder: "scripts", filename: s }),
      })),
    },
    {
      id: "components",
      label: "Components",
      children: Object.entries(projectData.components)
        .filter(([, def]) => def.source !== "engine")
        .map(([c, def]) => {
          const filename = def.filename ?? `${c}.js`;

          return {
            id: c,
            label: c,
            onClick: () => setOpenCodeFile({
              folder: "components",
              filename,
            }),
          };
        }),
    },
  ];

  const getActions = (node: TreeNode): MenuAction[] => {
    // Entity node, id shape is "sceneFile.json::entityId"
    if (node.id.includes("::")) {
      const [sceneFile, entityId] = node.id.split("::");
      const sceneId = sceneFile.replace(".json", "");
      const isActiveScene = target?.sceneId === sceneId;

      const actions: MenuAction[] = [
        // Renaming an entity needs the id-uniqueness check that lives in
        // the Inspector, so route there rather than duplicating it here.
        { label: "Rename", icon: Pencil, onClick: () => openEntity(sceneId, entityId) },
      ];
      if (isActiveScene) {
        actions.push({
          label: "Delete",
          icon: Trash2,
          danger: true,
          onClick: () => deleteEntity(entityId),
        });
      }
      return actions;
    }

    // Scene node
    if (projectData.scenes.includes(node.id)) {
      const sceneId = node.id.replace(".json", "");
      const isActiveScene = target?.sceneId === sceneId;

      const actions: MenuAction[] = [];
      if (isActiveScene) {
        actions.push({ label: "New Entity", icon: Plus, onClick: () => addEntity() });
      }
      actions.push(
        { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) }
      );
      return actions;
    }

    // Script node — id is the raw filename (e.g. "LogScript.js")
    if (projectData.scripts.includes(node.id)) {
      return [
        {
          label: "Open in Editor",
          icon: Pencil,
          onClick: () => setOpenCodeFile({ folder: "scripts", filename: node.id }),
        },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) },
      ];
    }

    // Component node — id is the component name (e.g. "Movement")
    if (Object.keys(projectData.components).includes(node.id)) {
      const filename = projectData.components[node.id]?.filename ?? `${node.id}.js`;
       
      return [
        {
          label: "Open in Editor",
          icon: Pencil,
          onClick: () => setOpenCodeFile({ folder: "components", filename }),
        },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) },
      ];
    }

    // Everything else (prefabs, section headers)
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

      <Modal
        open={openCodeFile !== null}
        onClose={() => setOpenCodeFile(null)}
        title={openCodeFile?.filename}
        className="max-w-3xl"
      >
        {/* Modal's content area has fixed px-4 py-3 padding and no height
            of its own; CodeFileEditor needs a sized parent since CodeMirror
            is set to height="100%". Cancel that padding with negative
            margins and give this wrapper an explicit height instead. */}
        {openCodeFile && currentProject && (
          <div className="-m-3 -mx-4 h-[70vh]">
            <CodeFileEditor
              project={currentProject}
              folder={openCodeFile.folder}
              filename={openCodeFile.filename}
            />
          </div>
        )}
      </Modal>
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