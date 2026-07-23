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

// Prefab names are stored/keyed without their file extension throughout
// SceneEditorContext (entity.prefab, prefabCache, openPrefab) — matches
// Inspector.tsx's stripExt.
const stripExt = (name: string) => name.replace(/\.(js|ts|json)$/i, "");

function ExplorerFiles() {
  const { projectData, currentProject } = useProject();
  const {
    target,
    scene: liveScene,
    openScene,
    openEntity,
    openPrefab,
    addEntity,
    deleteEntity,
    createComponent,
    deleteComponent,
    createScript,
    deleteScript,
    createScene,
    deleteScene,
    createPrefab,
    deletePrefab,
  } = useSceneEditor();

  // Lazily-populated cache of each scene's entities, so scene nodes can
  // show them as children in the tree without eagerly loading everything
  // up front on every render. For whichever scene is currently open in the
  // Inspector, we read live data from SceneEditorContext instead (below),
  // so edits made there — renames, adds, deletes — show up immediately.
  const [sceneEntities, setSceneEntities] = useState<Record<string, Entity[]>>({});

  // The script/component file currently open in the CodeFileEditor modal.
  const [openCodeFile, setOpenCodeFile] = useState<OpenCodeFile | null>(null);

  // target now has a "prefab" variant with no sceneId, so pull sceneId out
  // only for the branches that actually have one (scene/entity).
  const activeSceneId = target && target.kind !== "prefab" ? target.sceneId : undefined;

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
        const isActiveScene = activeSceneId === sceneId && liveScene?.name === sceneId;
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
      children: projectData.prefabs.map((p) => ({
        id: p,
        label: p,
        onClick: () => openPrefab(stripExt(p)),
      })),
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
      const isActiveScene = activeSceneId === sceneId;

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
      const isActiveScene = activeSceneId === sceneId;

      const actions: MenuAction[] = [];
      if (isActiveScene) {
        actions.push({ label: "New Entity", icon: Plus, onClick: () => addEntity() });
      }
      actions.push(
        { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
        // deleteScene prompts for the scene name itself rather than taking
        // one as an argument (matches its () => void signature in the
        // context), so this re-prompts rather than deleting sceneId directly.
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteScene() }
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
        // deleteScript prompts for the script name itself, same caveat as above.
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteScript() },
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
        // deleteComponent prompts for the component name itself, same caveat.
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteComponent() },
      ];
    }

    // Prefab node — id is the raw prefab filename (e.g. "Player.json"). This
    // was previously falling through to the generic "everything else" branch
    // below with console.log stubs; broken out here to match the other
    // resource types above.
    if (projectData.prefabs.includes(node.id)) {
      return [
        { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
        // deletePrefab prompts for the prefab name itself, same caveat as above.
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deletePrefab() },
      ];
    }

    // Everything else (section headers: Scenes / Prefabs / Scripts / Components)
    const base: MenuAction[] = [
      { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
      { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) },
    ];
    if (node.children) {
      // Route "New Item" to the right create function per section, instead
      // of the previous console.log stub.
      const newItemHandler = {
        scenes: createScene,
        prefabs: createPrefab,
        scripts: createScript,
        components: createComponent,
      }[node.id];

      return [
        { label: "New Item", icon: Plus, onClick: () => (newItemHandler ?? (() => console.log("new in", node.id)))() },
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
        size="full"
        bodyClassName="h-full"
      >
        {openCodeFile && currentProject && (
          <CodeFileEditor
            project={currentProject}
            folder={openCodeFile.folder}
            filename={openCodeFile.filename}
            onExit={() => setOpenCodeFile(null)}
          />
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