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
  Search,
  X,
  WandSparkles,
} from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";
import { projectsApi, Entity, graphScriptsApi, AssetEntry, BASE_URL } from "../../api";
import { CodeFileEditor } from "../../components/CodeFileEditor";
import ScriptGraph from "../../components/graphs/scripting/ScriptGraph";
import { GraphValue } from "../../components/graphs/GraphEditor";
import TextureGraph from "../../components/graphs/TextureGraph";
import { renderCompiledTexture } from "../../lib/texturePreview";

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
  const [search, setSearch] = useState("");

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

  const visibleAssets = projectData.assets.filter((asset) =>
    `${asset.key} ${asset.relativePath} ${asset.type}`.toLowerCase().includes(search.toLowerCase().trim()),
  );
  const imageCount = projectData.assets.filter((asset) => asset.type === "image").length;
  const textureCount = projectData.assets.filter((asset) => asset.type === "texture").length;

  return (
    <div
      className={`flex h-full flex-col gap-3 p-3 ${
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

      <div className="flex items-center gap-2">
        <div>
          <div className="text-xs font-semibold text-[var(--color-text)]">Asset Library</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-text-faint)]">
            {projectData.assets.length} assets · {imageCount} images · {textureCount} textures
          </div>
        </div>
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

      <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-inset)] px-2 py-1.5">
        <Search size={13} className="text-[var(--color-text-faint)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search assets..."
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
        {search && <button className="text-[var(--color-text-faint)] hover:text-[var(--color-text)]" onClick={() => setSearch("")}><X size={13} /></button>}
      </div>

      <div className={`rounded border border-dashed px-3 py-2 text-[10px] transition-colors ${dragging ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10" : "border-[var(--color-border)] text-[var(--color-text-faint)]"}`}>
        <div className="flex items-center gap-2"><Upload size={13} /><span>Drop files here or paste from your clipboard to import.</span></div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-auto pr-0.5">
        {visibleAssets.map((asset) => (
          <AssetCard
            key={asset.relativePath}
            asset={asset}
            project={currentProject}
            assets={projectData.assets}
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

      {visibleAssets.length === 0 && (
        <div className="text-center text-[10px] text-[var(--color-text-faint)]">
          {search ? "No matching assets." : "Your asset library is empty."}
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
  assets: AssetEntry[];
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function AssetCard({ asset, project, assets, onOpen, onRename, onDelete }: AssetCardProps) {
  const [texturePreview, setTexturePreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (asset.type !== "texture" || !project) return;
    let cancelled = false;
    projectsApi.readFile(project, "assets", asset.relativePath)
      .then((response) => renderCompiledTexture(project, (JSON.parse(response.content) as { graph: GraphValue }).graph, assets, 128))
      .then((dataUrl) => { if (!cancelled) setTexturePreview(dataUrl); })
      .catch(() => { if (!cancelled) setPreviewFailed(true); });
    return () => { cancelled = true; };
  }, [asset, project]);

  const assetUrl = project ? `${BASE_URL}/api/projects/${encodeURIComponent(project)}/assets/raw/${encodeURIComponent(asset.relativePath)}` : "";

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
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-inset)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent-secondary)] hover:shadow-md"
      onDoubleClick={onOpen}
    >
      <div className="flex h-24 items-center justify-center overflow-hidden bg-black/20">
        {asset.type === "image" ? (
          <img src={assetUrl} alt={asset.key} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        ) : asset.type === "texture" && texturePreview ? (
          <img src={texturePreview} alt={`${asset.key} preview`} className="h-full w-full object-cover" />
        ) : asset.type === "texture" && !previewFailed ? (
          <div className="h-5 w-5 animate-pulse rounded bg-[var(--color-accent-secondary)]/30" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--color-text-faint)]">{icon}<span className="text-[9px] uppercase">{asset.type}</span></div>
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-[10px] font-medium text-[var(--color-text)]" title={asset.relativePath}>{asset.key}</div>
        <div className="mt-0.5 truncate text-[9px] text-[var(--color-text-faint)]">{asset.type} · {formatBytes(asset.size)}</div>
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

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-xs text-[var(--color-text-faint)]">
      {label}
    </div>
  );
}
