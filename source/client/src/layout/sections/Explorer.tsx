// Explorer.tsx — full file

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import { Container } from "../../ui/Container";
import { Tabs } from "../../ui/Tabs";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { useProject } from "../../context/ProjectContext";
import { useSceneEditor } from "../../context/SceneEditorContext";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  Waypoints,
  FileCode,
  Upload,
  Music,
  File,
  WandSparkles,
} from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";
import { projectsApi, Entity, graphScriptsApi, AssetEntry, BASE_URL } from "../../api";
import { CodeFileEditor } from "../../components/CodeFileEditor";
import ScriptGraph from "../../components/graphs/scripting/ScriptGraph";
import { GraphValue } from "../../components/graphs/GraphEditor";
import TextureGraph from "../../components/graphs/TextureGraph";

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

const isGraphScript = (name: string) => name.endsWith(".lgscript.json");
const isGeneratedGraphOutput = (name: string) => name.endsWith(".lgscript.js");
const textureName = (filename: string) => filename.replace(/\.json$/i, "");
const textureFilename = (name: string) => {
  const withoutJson = name.replace(/\.json$/i, "");
  const withTexture = withoutJson.endsWith(".texture")
    ? withoutJson
    : `${withoutJson}.texture`;
  return `${withTexture}.json`;
};

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
    createGraphScript,
    deleteGraphScript,
    createScene,
    deleteScene,
    createPrefab,
    deletePrefab,
  } = useSceneEditor();

  const [sceneEntities, setSceneEntities] = useState<Record<string, Entity[]>>({});
  const [openCodeFile, setOpenCodeFile] = useState<OpenCodeFile | null>(null);
  const [openGraphScript, setOpenGraphScript] = useState<string | null>(null);

  const activeSceneId = target && target.kind !== "prefab" ? target.sceneId : undefined;

  const [graphContent, setGraphContent] = useState<GraphValue | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const [isCodeDirty, setIsCodeDirty] = useState(false);


  useEffect(() => {
    if (!openGraphScript || !currentProject) {
      setGraphContent(null);
      return;
    }

    let cancelled = false;
    setGraphLoading(true);

    projectsApi
      .readFile(currentProject, "scripts", openGraphScript)
      .then((res) => {
        if (!cancelled) setGraphContent(JSON.parse(res.content) as GraphValue);
      })
      .catch(() => {
        if (!cancelled) setGraphContent({ nodes: [], edges: [] }); // fresh/missing file
      })
      .finally(() => {
        if (!cancelled) setGraphLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openGraphScript, currentProject]);

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
      // Generated .lgscript.js siblings are build output, not a separate
      // asset — keep them out of the tree so each graph script shows once.
      children: projectData.scripts
        .filter((s) => !isGeneratedGraphOutput(s))
        .map((s) => ({
          id: s,
          label: s,
          icon: isGraphScript(s) ? Waypoints : FileCode,
          onClick: () =>
            isGraphScript(s)
              ? setOpenGraphScript(s)
              : setOpenCodeFile({ folder: "scripts", filename: s }),
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
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteScene(sceneId) }
      );
      return actions;
    }

    // Script node — id is the raw filename (e.g. "LogScript.js" or "Foo.lgscript.json")
    if (projectData.scripts.includes(node.id)) {
      return isGraphScript(node.id)
        ? [
          {
            label: "Open in Graph Editor",
            icon: Waypoints,
            onClick: () => setOpenGraphScript(node.id),
          },
          { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteGraphScript(node.id) },
        ]
        : [
          {
            label: "Open in Editor",
            icon: Pencil,
            onClick: () => setOpenCodeFile({ folder: "scripts", filename: node.id }),
          },
          { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteScript(node.id) },
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
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteComponent(node.id) },
      ];
    }

    // Prefab node — id is the raw prefab filename (e.g. "Player.json")
    if (projectData.prefabs.includes(node.id)) {
      return [
        { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deletePrefab(node.id) },
      ];
    }

    // Everything else (section headers: Scenes / Prefabs / Scripts / Components)
    const base: MenuAction[] = [
      { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
      { label: "Delete", icon: Trash2, danger: true, onClick: () => console.log("delete", node.id) },
    ];

    if (node.id === "scripts") {
      return [
        { label: "New Script", icon: Plus, onClick: () => createScript() },
        { label: "New Visual Script", icon: Waypoints, onClick: () => createGraphScript() },
        ...base,
      ];
    }

    if (node.children) {
      const newItemHandler = {
        scenes: createScene,
        prefabs: createPrefab,
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
        confirmClose={isCodeDirty}
      >
        {openCodeFile && currentProject && (
          <CodeFileEditor
            onSave={() => setIsCodeDirty(false)}
            onChange={() => setIsCodeDirty(true)}
            project={currentProject}
            folder={openCodeFile.folder}
            filename={openCodeFile.filename}
            onExit={() => {
              setOpenCodeFile(null);
              setIsCodeDirty(false);
            }}
          />
        )}
      </Modal>

      {openGraphScript && !graphLoading && (
        <ScriptGraph
          key={openGraphScript}
          open={openGraphScript !== null}
          onClose={() => setOpenGraphScript(null)}
          title={openGraphScript}
          initialValue={graphContent ?? undefined}
          onSave={(graph) => {
            if (openGraphScript && currentProject) {
              graphScriptsApi
                .save(currentProject, openGraphScript, JSON.stringify(graph, null, 2))
                .catch((err) => console.error("graph save failed:", err));
            }
          }}
          onCompile={(graph) => {
            if (openGraphScript && currentProject) {
              return graphScriptsApi.compile(currentProject, openGraphScript);
            }
            return Promise.resolve({ success: false, code: "", errors: ["No project selected"] });
          }}
        />
      )}
    </div>
  );
}

function ExplorerAssets() {
  const { projectData, currentProject, reloadProject } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texture, setTexture] = useState<{ name: string; graph?: GraphValue } | null>(null);
  const [rename, setRename] = useState<AssetEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragging, setDragging] = useState(false);

  if (!projectData) {
    return <PlaceholderPanel label="No project loaded" />;
  }

  const importFiles = async (files: FileList | File[]) => {
    if (!currentProject) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();

      await new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const filename = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
            await projectsApi.importAsset(currentProject, filename, String(reader.result));
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    await reloadProject();
  };

  const openAsset = async (asset: AssetEntry) => {
    if (!currentProject) return;
    if (asset.type !== "texture") return;

    try {
      const response = await projectsApi.readFile(
        currentProject,
        "assets",
        asset.relativePath,
      );
      const parsed = JSON.parse(response.content);
      setTexture({ name: asset.relativePath, graph: parsed.graph });
    } catch {
      setTexture({ name: asset.relativePath });
    }
  };

  const handleDelete = async (asset: AssetEntry) => {
    if (!currentProject) return;
    if (!(await window.confirm(`Delete ${asset.relativePath}?`))) return;

    await projectsApi.deleteFile(currentProject, "assets", asset.relativePath);
    await reloadProject();
  };

  const handleRename = async () => {
    if (!currentProject || !rename || !renameValue.trim()) return;

    const nextName = rename.type === "texture"
      ? textureFilename(renameValue.trim())
      : renameValue.trim();

    await projectsApi.renameAsset(currentProject, rename.relativePath, nextName);
    setRename(null);
    await reloadProject();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void importFiles(event.dataTransfer.files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) void importFiles(files);
  };

  return (
    <div
      className={`flex h-full flex-col gap-2 p-2 ${
        dragging ? "ring-2 ring-inset ring-[var(--color-accent)]" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void importFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex items-center gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">
          Assets ({projectData.assets.length})
        </span>
        <Button
          className="ml-auto"
          size="sm"
          iconOnly
          iconLeft={<Upload size={14} />}
          title="Import files"
          onClick={() => inputRef.current?.click()}
        />
        <Button
          size="sm"
          iconOnly
          iconLeft={<WandSparkles size={14} />}
          title="New texture"
          onClick={() => setTexture({ name: "texture.texture.json" })}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-auto">
        {projectData.assets.map((asset) => (
          <AssetCard
            key={asset.relativePath}
            asset={asset}
            project={currentProject}
            onOpen={() => void openAsset(asset)}
            onRename={() => {
              setRename(asset);
              setRenameValue(
                asset.type === "texture"
                  ? textureName(asset.relativePath)
                  : asset.relativePath,
              );
            }}
            onDelete={() => void handleDelete(asset)}
          />
        ))}
      </div>

      {projectData.assets.length === 0 && (
        <div className="text-center text-[10px] text-[var(--color-text-faint)]">
          Drop files here, paste an image, or import from File Explorer.
        </div>
      )}

      <Modal
        open={rename !== null}
        onClose={() => setRename(null)}
        title="Rename Asset"
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRename(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRename()}>
              Rename
            </Button>
          </div>
        </div>
      </Modal>

      {texture && currentProject && (
        <TextureGraph
          open
          onClose={() => setTexture(null)}
          project={currentProject}
          filename={texture.name}
          assets={projectData.assets}
          initialValue={texture.graph}
          onSave={async (graph) => {
            const name = texture.name.endsWith(".texture.json")
              ? texture.name
              : `${texture.name}.texture.json`;
            await projectsApi.writeFile(
              currentProject,
              "assets",
              name,
              JSON.stringify({ version: 1, graph }, null, 2),
            );
            setTexture(null);
            await reloadProject();
          }}
        />
      )}
    </div>
  );
}

interface AssetCardProps {
  asset: AssetEntry;
  project: string | null;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function AssetCard({ asset, project, onOpen, onRename, onDelete }: AssetCardProps) {
  const assetUrl = project
    ? `${BASE_URL}/api/projects/${encodeURIComponent(project)}/assets/raw/${encodeURIComponent(asset.relativePath)}`
    : "";

  const icon = asset.type === "texture" ? (
    <WandSparkles size={24} className="text-[var(--color-accent-secondary)]" />
  ) : asset.type === "audio" ? (
    <Music size={24} />
  ) : (
    <File size={24} />
  );

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/lyngame-asset", asset.key);
        event.dataTransfer.setData("text/plain", asset.key);
      }}
      className="group relative cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg-inset)] p-1 hover:border-[var(--color-accent-secondary)]"
      onDoubleClick={onOpen}
    >
      <div className="flex h-10 items-center justify-center overflow-hidden rounded bg-black/20 opacity-70">
        {asset.type === "image" ? (
          <img src={assetUrl} alt={asset.key} className="max-h-full max-w-full object-contain" />
        ) : (
          icon
        )}
      </div>
      <div className="truncate pt-1 text-[9px]" title={asset.relativePath}>
        {asset.key}
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-1 rounded bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={<Pencil size={11} />}
          title="Rename"
          onClick={onRename}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={<Trash2 size={11} />}
          title="Delete"
          onClick={onDelete}
        />
      </div>
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
