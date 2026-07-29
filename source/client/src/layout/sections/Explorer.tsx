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
  Play,
  Pause,
  File,
  Search,
  X,
  WandSparkles,
  Copy,
  ClipboardCopy,
  ClipboardPaste,
  FolderInput,
} from "lucide-react";
import { FolderTree, TreeNode, TreeNodeBadge, DropPosition } from "../../ui/FolderTree";
import { MenuAction } from "../../ui/ActionsMenu";
import { projectsApi, Entity, PrefabData, PrefabChildData, graphScriptsApi, AssetEntry, BASE_URL } from "../../api";
import { CodeFileEditor } from "../../components/CodeFileEditor";
import ScriptGraph from "../../components/graphs/ScriptGraph";
import { GraphValue } from "../../components/graphs/GraphEditor";
import TextureGraph from "../../components/graphs/TextureGraph";
import { renderCompiledTexture } from "../../lib/texturePreview";
import { presentComponentIcons } from "../../lib/entityIcons";

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

// Carried on TreeNode.meta so drop handling can resolve "same parent as
// this node" (for sibling drops) or "this node's own id" (for child drops)
// without re-deriving it from node.id, which only encodes sceneFile+entityId.
type EntityNodeMeta =
  | { kind: "entity"; sceneId: string; entityId: string; parentId: string | null }
  | { kind: "scene"; sceneId: string };

// Small badges marking which "special" components an entity carries (see
// lib/entityIcons.tsx — shared with the scene canvas's entity boxes so both
// places agree on the same icon/tooltip/persistence per component).
function entityBadges(entity: Entity): TreeNodeBadge[] {
  return presentComponentIcons(entity).map((c) => ({
    id: c.key,
    icon: <c.icon size={11} className="text-[var(--color-text-faint)]" />,
    tooltip: c.tooltip,
    persistent: c.persistent,
  }));
}

// Turns a scene's flat entities array (Entity.parentId links) into nested
// TreeNodes for FolderTree — which already has collapse/expand built in, so
// nesting a card's children under it is enough to get a collapsible
// hierarchy row for free. An entity whose parentId doesn't resolve to a
// live sibling (stale reference, e.g. after a partial edit) falls back to
// rendering at the top level rather than disappearing.
function buildEntityTree(
  sceneFile: string,
  sceneId: string,
  entities: Entity[],
  openEntity: (sceneId: string, entityId: string) => void,
  prefabDefs: Record<string, PrefabData>,
  openInstanceChild: (sceneId: string, entityId: string, path: string) => void
): TreeNode[] {
  const ids = new Set(entities.map((e) => e.id));
  const byParent = new Map<string, Entity[]>();
  const roots: Entity[] = [];

  for (const e of entities) {
    if (e.parentId && ids.has(e.parentId)) {
      const list = byParent.get(e.parentId) ?? [];
      list.push(e);
      byParent.set(e.parentId, list);
    } else {
      roots.push(e);
    }
  }

  const buildNode = (e: Entity): TreeNode => {
    const realChildren = byParent.get(e.id);
    const prefabDef = e.prefab ? prefabDefs[e.prefab] : undefined;
    // Ghost children come first, then any manually-added real children —
    // both render under the same node, distinguished only by the ghost
    // dimming, so you can freely mix inherited fields with extra entities.
    const ghostChildren = prefabDef
      ? buildGhostChildTree(sceneFile, e.id, prefabDef.children, "", sceneId, e, openInstanceChild)
      : [];
    const children = [...ghostChildren, ...(realChildren?.map(buildNode) ?? [])];

    const meta: EntityNodeMeta = {
      kind: "entity",
      sceneId,
      entityId: e.id,
      parentId: ids.has(e.parentId ?? "") ? e.parentId! : null,
    };
    return {
      id: `${sceneFile}::${e.id}`,
      label: e.id,
      onClick: () => openEntity(sceneId, e.id),
      children: children.length ? children : undefined,
      badges: entityBadges(e),
      meta,
    };
  };

  return roots.map(buildNode);
}

// A prefab child node's id, distinct from entity node ids ("sceneFile::id")
// so getActions/drag handlers never confuse the two. `owner` is the prefab
// filename ("Card.json") when authoring the prefab itself, or
// "sceneFile::entityId" when it's a ghost child under an instance.
const prefabChildNodeId = (owner: string, path: string) => `${owner}##${path}`;

// Builds the "authoring" tree for a prefab's own `children` definition —
// shown under a Prefabs-section node so Card's icon/name/description can be
// added/renamed/removed directly, same as an entity's real children.
function buildPrefabChildTree(
  prefabFile: string,
  children: Record<string, PrefabChildData> | undefined,
  parentPath: string,
  prefabName: string,
  openPrefabChild: (prefabName: string, path: string) => void
): TreeNode[] {
  return Object.entries(children ?? {}).map(([name, child]) => {
    const path = parentPath ? `${parentPath}.${name}` : name;
    return {
      id: prefabChildNodeId(prefabFile, path),
      label: name,
      onClick: () => openPrefabChild(prefabName, path),
      children: child.children && Object.keys(child.children).length
        ? buildPrefabChildTree(prefabFile, child.children, path, prefabName, openPrefabChild)
        : undefined,
    };
  });
}

// Builds the "ghost" tree of a prefab instance's inherited children — one
// TreeNode per child defined on the prefab, dimmed to read as "inherited,
// not yet a real entity", each carrying an override badge if this instance
// already has field overrides for it. Recurses using the SAME dot-paths the
// override map and Entity.getChild/query use, so what you click here is
// exactly what you'd address in a script.
function buildGhostChildTree(
  sceneFile: string,
  entityId: string,
  children: Record<string, PrefabChildData> | undefined,
  parentPath: string,
  sceneId: string,
  entity: Entity,
  openInstanceChild: (sceneId: string, entityId: string, path: string) => void
): TreeNode[] {
  const owner = `${sceneFile}::${entityId}`;
  return Object.entries(children ?? {}).map(([name, child]) => {
    const path = parentPath ? `${parentPath}.${name}` : name;
    const hasOverride = Boolean(
      entity.overrides?.children?.[path] && Object.keys(entity.overrides.children[path]).length > 0
    );
    return {
      id: prefabChildNodeId(owner, path),
      label: name,
      ghost: true,
      onClick: () => openInstanceChild(sceneId, entityId, path),
      badges: [
        {
          id: "override",
          icon: (
            <span
              className={`h-1.5 w-1.5 rounded-full ${hasOverride ? "bg-[var(--color-accent-secondary)]" : "border border-[var(--color-text-faint)]"}`}
            />
          ),
          tooltip: hasOverride ? "Has instance overrides" : "Inherited from prefab, no overrides",
          persistent: hasOverride,
        },
      ],
      children: child.children && Object.keys(child.children).length
        ? buildGhostChildTree(sceneFile, entityId, child.children, path, sceneId, entity, openInstanceChild)
        : undefined,
    };
  });
}

function ExplorerFiles() {
  const { projectData, currentProject } = useProject();
  const {
    target,
    scene: liveScene,
    prefabCache,
    openScene,
    openEntity,
    openPrefab,
    openPrefabChild,
    openInstanceChild,
    addEntity,
    renameEntity,
    deleteEntity,
    setEntityParent,
    duplicateEntity,
    entityClipboard,
    copyEntity,
    pasteEntity,
    moveEntityToScene,
    addPrefabChild,
    renamePrefabChild,
    removePrefabChild,
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
    createAnimation,
    deleteAnimation,
    prefabDraft,
    openClipEditor,
  } = useSceneEditor();

  const [sceneEntities, setSceneEntities] = useState<Record<string, Entity[]>>({});
  const [openCodeFile, setOpenCodeFile] = useState<OpenCodeFile | null>(null);
  const [openGraphScript, setOpenGraphScript] = useState<string | null>(null);

  const activeSceneId =
    target && (target.kind === "scene" || target.kind === "entity" || target.kind === "instanceChild")
      ? target.sceneId
      : undefined;
  const activePrefabName =
    target && (target.kind === "prefab" || target.kind === "prefabChild") ? target.prefabName : undefined;

  const [graphContent, setGraphContent] = useState<GraphValue | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const [isCodeDirty, setIsCodeDirty] = useState(false);

  // sceneEntities is keyed only by sceneId, and openCodeFile/openGraphScript
  // point at a project-relative path — without this reset, switching to a
  // project with a same-named scene or file keeps showing the previous
  // project's cached/open content.
  useEffect(() => {
    setSceneEntities({});
    setOpenCodeFile(null);
    setOpenGraphScript(null);
    setIsCodeDirty(false);
  }, [currentProject]);

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
    // `sceneEntities` is a dep (not just projectData/currentProject) so that
    // invalidateSceneCache — which deletes a scene's cached entry after
    // moveEntityToScene — actually triggers a re-fetch. Safe against loops:
    // the `if (sceneEntities[sceneId]) return` guard above means a re-run
    // only ever fetches scenes that are still missing from the cache.
  }, [projectData, currentProject, sceneEntities]);

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

  // Prefer the live draft over prefabCache for whichever prefab is currently
  // open in the Inspector, so editing a prefab's children shows up
  // immediately both in its own "Prefabs" node and in any instance's ghost
  // children — same freshness rule buildEntityTree already follows for
  // liveScene vs sceneEntities below. prefabCache itself (from context) is
  // kept fresh on save() and eagerly pre-fetched for every project prefab
  // (see SceneEditorContext) — it's the single source of truth here, not a
  // second Explorer-local cache that could go stale independently of it.
  const livePrefabDefs =
    activePrefabName && prefabDraft ? { ...prefabCache, [activePrefabName]: prefabDraft } : prefabCache;

  const sections: TreeNode[] = [
    {
      id: "scenes",
      label: "Scenes",
      children: projectData.scenes.map((sceneFile) => {
        const sceneId = sceneFile.replace(".json", "");
        const isActiveScene = activeSceneId === sceneId && liveScene?.name === sceneId;
        const entities = isActiveScene ? liveScene.entities : sceneEntities[sceneId];

        const sceneMeta: EntityNodeMeta = { kind: "scene", sceneId };

        return {
          id: sceneFile,
          label: sceneId,
          badges: sceneBadges(sceneFile),
          onClick: () => openScene(sceneId),
          children: entities
            ? buildEntityTree(sceneFile, sceneId, entities, openEntity, livePrefabDefs, openInstanceChild)
            : undefined,
          meta: sceneMeta,
        };
      }),
    },
    {
      id: "prefabs",
      label: "Prefabs",
      children: projectData.prefabs.map((p) => {
        const prefabName = stripExt(p);
        const def = livePrefabDefs[prefabName];
        return {
          id: p,
          label: p,
          onClick: () => openPrefab(prefabName),
          children: def
            ? buildPrefabChildTree(p, def.children, "", prefabName, openPrefabChild)
            : undefined,
        };
      }),
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
      id: "animations",
      label: "Animations",
      children: projectData.animations.map((a) => ({
        id: a,
        label: stripExt(a),
        onClick: () => openClipEditor(stripExt(a)),
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

  // Clears the Explorer's cached entity list for a scene so the next render
  // re-fetches it — needed after moveEntityToScene, which persists straight
  // to disk via the API rather than through the local `scene` draft state,
  // so the cache would otherwise go stale for whichever of the two scenes
  // isn't currently open in the Inspector.
  const invalidateSceneCache = (...sceneIds: string[]) => {
    setSceneEntities((prev) => {
      const next = { ...prev };
      for (const id of sceneIds) delete next[id];
      return next;
    });
  };

  const getActions = (node: TreeNode): MenuAction[] => {
    // Prefab child node, id shape is "<owner>##<dot.path>" — checked before
    // the "::" entity check below since a ghost child's owner embeds
    // "sceneFile::entityId" and would otherwise be misread as an entity node.
    if (node.id.includes("##")) {
      const [owner, path] = node.id.split("##");
      if (owner.includes("::")) {
        // Ghost child of a prefab instance — inherited, override-only (see
        // Inspector's instanceChild view), nothing structural to do here.
        return [];
      }

      const prefabName = stripExt(owner);
      const lastDot = path.lastIndexOf(".");
      const parentPath = lastDot === -1 ? "" : path.slice(0, lastDot);
      const childName = lastDot === -1 ? path : path.slice(lastDot + 1);

      return [
        {
          label: "Add Child",
          icon: Plus,
          onClick: async () => {
            const name = (await window.prompt("New child name:"))?.trim();
            if (name) addPrefabChild(path, name);
          },
        },
        {
          label: "Rename",
          icon: Pencil,
          onClick: async () => {
            const next = (await window.prompt("Rename child:", childName))?.trim();
            if (next && next !== childName) renamePrefabChild(parentPath, childName, next);
          },
        },
        {
          label: "Delete",
          icon: Trash2,
          danger: true,
          onClick: () => removePrefabChild(parentPath, childName),
        },
      ];
    }

    // Entity node, id shape is "sceneFile.json::entityId"
    if (node.id.includes("::")) {
      const [sceneFile, entityId] = node.id.split("::");
      const sceneId = sceneFile.replace(".json", "");
      const isActiveScene = activeSceneId === sceneId;

      const actions: MenuAction[] = [
        {
          label: "Rename",
          icon: Pencil,
          onClick: async () => {
            // renameEntity only mutates the currently-loaded scene draft, so
            // entities from a scene that isn't open yet just get opened —
            // same as every other mutating action here (Duplicate/Delete/etc).
            if (!isActiveScene) {
              openEntity(sceneId, entityId);
              return;
            }
            const next = (await window.prompt("Rename entity:", entityId))?.trim();
            if (!next || next === entityId) return;
            renameEntity(entityId, next);
          },
        },
      ];

      if (isActiveScene) {
        actions.push(
          { label: "Add Child Entity", icon: Plus, onClick: () => addEntity(entityId) },
          { label: "Duplicate", icon: Copy, onClick: () => duplicateEntity(entityId) },
          { label: "Copy", icon: ClipboardCopy, onClick: () => copyEntity(entityId) }
        );

        if (entityClipboard?.length) {
          actions.push({
            label: "Paste as Child",
            icon: ClipboardPaste,
            onClick: () => pasteEntity(entityId),
          });
        }

        for (const otherSceneFile of projectData.scenes) {
          if (otherSceneFile === sceneFile) continue;
          const otherSceneId = otherSceneFile.replace(".json", "");
          actions.push({
            label: `Move to "${otherSceneId}"`,
            icon: FolderInput,
            onClick: () =>
              moveEntityToScene(entityId, otherSceneId, () =>
                invalidateSceneCache(sceneId, otherSceneId)
              ),
          });
        }

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
        if (entityClipboard?.length) {
          actions.push({ label: "Paste Entity", icon: ClipboardPaste, onClick: () => pasteEntity(null) });
        }
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
      const prefabName = stripExt(node.id);
      return [
        {
          label: "Add Child",
          icon: Plus,
          onClick: async () => {
            if (activePrefabName !== prefabName) openPrefab(prefabName);
            const name = (await window.prompt("New child name:"))?.trim();
            if (name) addPrefabChild("", name);
          },
        },
        { label: "Rename", icon: Pencil, onClick: () => console.log("rename", node.id) },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deletePrefab(node.id) },
      ];
    }

    // Animation clip node — id is the raw filename (e.g. "hover.json")
    if (projectData.animations.includes(node.id)) {
      return [
        { label: "Edit", icon: Pencil, onClick: () => openClipEditor(stripExt(node.id)) },
        { label: "Delete", icon: Trash2, danger: true, onClick: () => deleteAnimation(stripExt(node.id)) },
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
        animations: createAnimation,
      }[node.id];

      return [
        { label: "New Item", icon: Plus, onClick: () => (newItemHandler ?? (() => console.log("new in", node.id)))() },
        ...base,
      ];
    }
    return base;
  };

  // Drag-and-drop on the Scenes tree (entity + scene nodes). The source
  // entity must be in the currently-open (active) scene — that's the only
  // scene whose entities live in mutable local state; other scenes are just
  // cached snapshots for display. Where the cursor lands on the target row
  // decides the outcome (see FolderTree's DropPosition/resolveDropPosition):
  //   - dropped in the top/bottom ~30% of a row  -> sibling, at that
  //     position, same parent as the target
  //   - dropped in the middle ~40% of an entity row -> child of the target
  //   - dropped anywhere on a scene row -> top-level in that scene
  // Dropping on a DIFFERENT scene than the dragged entity's own goes through
  // moveEntityToScene (persists both scene files immediately) instead of
  // setEntityParent (local draft only) — same rule the "Move to Scene"
  // context-menu action already follows.
  const getEntityDragId = (node: TreeNode) => (node.id.includes("::") ? node.id : undefined);

  const handleEntityDrop = (draggedId: string, targetNode: TreeNode, position: DropPosition) => {
    if (draggedId === targetNode.id) return;
    const [draggedSceneFile, draggedEntityId] = draggedId.split("::");
    if (!draggedEntityId) return;

    const sourceSceneId = draggedSceneFile.replace(".json", "");
    if (activeSceneId !== sourceSceneId) return; // only the open scene's entities are mutable via drag

    const meta = targetNode.meta as EntityNodeMeta | undefined;
    if (!meta) return; // dropped on something outside the entity hierarchy (shouldn't happen, defensive)

    let targetSceneId: string;
    let desiredParentId: string | null;
    let referenceId: string | undefined;
    let refPosition: "before" | "after" | undefined;

    if (meta.kind === "scene") {
      targetSceneId = meta.sceneId;
      desiredParentId = null;
    } else {
      targetSceneId = meta.sceneId;
      if (position === "inside") {
        desiredParentId = meta.entityId;
      } else {
        desiredParentId = meta.parentId;
        referenceId = meta.entityId;
        refPosition = position;
      }
    }

    if (draggedEntityId === desiredParentId) return; // can't become its own parent

    if (targetSceneId === sourceSceneId) {
      setEntityParent(draggedEntityId, desiredParentId, referenceId, refPosition);
    } else {
      moveEntityToScene(
        draggedEntityId,
        targetSceneId,
        () => invalidateSceneCache(sourceSceneId, targetSceneId),
        desiredParentId
      );
    }
  };

  return (
    <div className="p-1">
      {sections.map((section) => (
        <FolderTree
          key={section.id}
          node={section}
          getActions={getActions}
          defaultOpen
          getDragId={section.id === "scenes" ? getEntityDragId : undefined}
          onDropNode={section.id === "scenes" ? handleEntityDrop : undefined}
        />
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
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (asset.type !== "texture" || !project) return;
    let cancelled = false;
    projectsApi.readFile(project, "assets", asset.relativePath)
      .then((response) => renderCompiledTexture(project, (JSON.parse(response.content) as { graph: GraphValue }).graph, assets, 128))
      .then((dataUrl) => { if (!cancelled) setTexturePreview(dataUrl); })
      .catch(() => { if (!cancelled) setPreviewFailed(true); });
    return () => { cancelled = true; };
  }, [asset, project]);

  // Stop playback if the card unmounts (e.g. asset deleted/renamed) while a preview is still going.
  useEffect(() => () => audioRef.current?.pause(), []);

  const assetUrl = project ? `${BASE_URL}/api/projects/${encodeURIComponent(project)}/assets/raw/${encodeURIComponent(asset.relativePath)}` : "";

  const icon = asset.type === "texture" ? (
    <WandSparkles size={22} className="text-[var(--color-accent-secondary)]" />
  ) : asset.type === "audio" ? (
    <Music size={22} />
  ) : (
    <File size={22} />
  );

  const hasVisual = (asset.type === "image") || (asset.type === "texture" && texturePreview);

  const toggleAudioPreview = () => {
    if (!assetUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(assetUrl);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/lyngame-asset", asset.key);
        event.dataTransfer.setData("text/plain", asset.key);
      }}
      // onDoubleClick={onOpen}
      onClick={asset.type === "audio" ? toggleAudioPreview : onOpen}
      title={asset.type === "audio" ? `Click to preview · call from a script with engine.audio.play("${asset.key}")` : undefined}
      className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-inset)] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-accent-secondary)] hover:shadow-lg"
    >
      {/* Visual layer */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/25">
        {asset.type === "image" ? (
          <img src={assetUrl} alt={asset.key} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
        ) : asset.type === "texture" && texturePreview ? (
          <img src={texturePreview} alt={`${asset.key} preview`} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
        ) : asset.type === "texture" && !previewFailed ? (
          <div className="h-6 w-6 animate-pulse rounded-full bg-[var(--color-accent-secondary)]/30" />
        ) : asset.type === "audio" ? (
          <div className="flex flex-col items-center gap-1.5 text-[var(--color-text-faint)]">
            {playing ? <Pause size={22} className="text-[var(--color-accent-secondary)]" /> : <Play size={22} />}
            <span className="text-[9px] font-medium uppercase tracking-wide">{playing ? "playing" : "audio"}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-[var(--color-text-faint)]">
            {icon}
            <span className="text-[9px] font-medium uppercase tracking-wide">{asset.type}</span>
          </div>
        )}
      </div>

      {/* Bottom info scrim */}
      <div className={`absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 ${hasVisual ? "bg-gradient-to-t from-black/80 via-black/40 to-transparent" : "bg-gradient-to-t from-black/50 to-transparent"}`}>
        <div className={`truncate text-[10px] font-medium ${hasVisual ? "text-white" : "text-[var(--color-text)]"}`} title={asset.relativePath}>
          {asset.key}
        </div>
        <div className={`mt-0.5 truncate text-[9px] ${hasVisual ? "text-white/70" : "text-[var(--color-text-faint)]"}`}>
          {asset.type} · {formatBytes(asset.size)}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={<Pencil size={11} />}
          title="Rename"
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
          className="bg-black/50 backdrop-blur-sm hover:bg-black/70"
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          iconLeft={<Trash2 size={11} />}
          title="Delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="bg-black/50 backdrop-blur-sm hover:bg-black/70"
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
