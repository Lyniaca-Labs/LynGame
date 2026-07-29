import { SelectOption } from "./ui/Select";

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  let response = null;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Request failed: ${error}`);
  }

  if (!response.ok) {
    // surface the server's { error: "..." } message when it sends one,
    // instead of just "status 400"
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
    } catch {
      // not JSON, fall back to the generic message
    }
    alert(message);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

export const PORT = 5664;
export const BASE_URL = `http://localhost:${PORT}`;

export const api = {
  get: <T>(url: string) => request<T>(`${BASE_URL}/${url}`),
  post: <T>(url: string, body?: unknown) =>
    request<T>(`${BASE_URL}/${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(`${BASE_URL}/${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(url: string) => request<T>(`${BASE_URL}/${url}`, { method: "DELETE" }),
};

// ---- Shared response shapes ----

export interface ProjectListResponse {
  success: boolean;
  projects: string[];
}

export interface ApiResult {
  success: boolean;
  error?: string;
}

export interface BuildResponse extends ApiResult {
  url?: string;
}

export interface GraphNodeTypeDefinition {
  type: string;
  label: string;
  category?: string;
  description?: string;
  inputs?: { id: string; label?: string; dataType?: string }[];
  outputs?: { id: string; label?: string; dataType?: string }[];
  fields?: {
    key: string;
    label?: string;
    type: "number" | "boolean" | "color" | "text" | "vector" | "select";
    defaultValue?: unknown;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
  }[];
}

export interface ScriptNodeTypesResponse {
  success: boolean;
  nodes: Record<string, TextureNodeMetadata>;
}

export interface GraphCompileResponse extends ApiResult {
  code: string;
  errors?: string[];
}

// ---- Scene / entity shapes ----
// Component data is intentionally loose (Record<string, unknown>) since new
// component types can be added without changing the client.

export interface Entity {
  id: string;
  components?: Record<string, Record<string, unknown>>;
  scripts?: string[];
  prefab?: string;
  // used in place of components when the entity is a prefab instance
  overrides?: Record<string, Record<string, unknown>>;
  // id of this entity's parent within the same scene, or absent/null for a
  // top-level entity. Mirrors Entity.addChild()/parent in the engine
  // (source/engine/types/Entity.js) — the compiler wires these up into real
  // addChild() calls when building the scene (see ProjectHandler.ts).
  parentId?: string | null;
}

export interface Scene {
  name: string;
  entities: Entity[];
}

export interface SceneResponse extends ApiResult {
  scene: Scene;
}

// ---- Editor snapshot ----

export interface ComponentFieldDefinition {
  key: string;
  type: "number" | "text" | "string" | "boolean" | "color" | "vector" | "code" | "select" | "animationRefs";
  defaultValue: unknown;
  description?: string;
  options?: SelectOption[];
}

// ---- Animator keyframe clips ----
// Mirrors the runtime shape read by source/engine/components/Animator.js.

export interface AnimatorKeyframe {
  time: number; // normalized 0-1
  value: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface AnimatorTrack {
  target: string; // component name on the entity, e.g. "Transform"
  property: string; // property on that component, e.g. "y"
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
  keyframes: AnimatorKeyframe[];
  mode?: "fixed" | "additive"; // "fixed" (default) sets the absolute value; "additive" adds keyframe values to the value the property had when the clip started
}

export interface AnimatorClip {
  duration: number; // seconds
  loop: boolean;
  tracks: Record<string, AnimatorTrack>;
}

export type AnimatorClips = Record<string, AnimatorClip>;

export interface ComponentDefinition {
  name: string;
  source: "engine" | "project";
  filename: string;
  fields: ComponentFieldDefinition[];
}

export interface ProjectInfo {
  name: string;
  startScene: string;
  assets: unknown[];
}

export interface AssetEntry {
  key: string;
  relativePath: string;
  type: "image" | "audio" | "texture" | "other";
  size?: number;
}

export interface ProjectEditorData extends ApiResult {
  project: ProjectInfo;
  components: Record<string, ComponentDefinition>;
  scenes: string[];
  prefabs: string[];
  scripts: string[];
  animations: string[];
  assets: AssetEntry[];
}

// ---- Folder file listing / editing ----

export type EditableFolder = "scenes" | "components" | "scripts" | "prefabs" | "assets" | "animations";

export interface FileListResponse extends ApiResult {
  files: string[];
}

export interface FileContentResponse extends ApiResult {
  content: string;
}

export interface OpenScriptResponse extends ApiResult {
  openedWith?: string;
}

// ---- Prefabs ----
// Prefabs don't have their own dedicated endpoints like scenes do — they're
// stored as plain JSON files under the generic "prefabs" folder, so we build
// get/save on top of the generic readFile/writeFile.

const stripExt = (filename: string) => filename.replace(/\.[^/.]+$/, "");
const withJsExt = (filename: string) => (filename.endsWith(".js") ? filename : `${filename}.js`);
const withJsonExt = (filename: string) => (filename.endsWith(".json") ? filename : `${filename}.json`);
const stripGraphExt = (filename: string) =>
  filename.replace(/\.lgscript\.(json|js)$/, "");

const withGraphExt = (filename: string) => `${stripGraphExt(filename)}.lgscript.json`;
const withCompiledExt = (filename: string) => `${stripGraphExt(filename)}.lgscript.js`;

export interface PrefabData {
  components: Record<string, Record<string, unknown>>;
  scripts: string[];
}

export const prefabsApi = {
  get: async (project: string, prefab: string): Promise<PrefabData> => {
    const res = await projectsApi.readFile(project, "prefabs", withJsonExt(prefab));
    return JSON.parse(res.content) as PrefabData;
  },
  save: async (project: string, prefab: string, data: PrefabData): Promise<ApiResult> => {
    return projectsApi.writeFile(project, "prefabs", withJsonExt(prefab), JSON.stringify(data, null, 2));
  },
  remove: (project: string, prefab: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "prefabs", withJsonExt(prefab)),
};

// ---- Animation clips ----
// Same story as prefabs — plain JSON files under "animations", get/save
// built on the generic readFile/writeFile. Referenced by name from an
// Animator component's `clips` field and resolved at runtime against
// engine.animations (see source/engine/components/Animator.js).

export const animationsApi = {
  get: async (project: string, clip: string): Promise<AnimatorClip> => {
    const res = await projectsApi.readFile(project, "animations", withJsonExt(clip));
    return JSON.parse(res.content) as AnimatorClip;
  },
  save: async (project: string, clip: string, data: AnimatorClip): Promise<ApiResult> => {
    return projectsApi.writeFile(project, "animations", withJsonExt(clip), JSON.stringify(data, null, 2));
  },
  remove: (project: string, clip: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "animations", withJsonExt(clip)),
};

// ---- Components ----
// No dedicated endpoints — stored as plain JSON files under "components",
// same pattern as prefabs.

export const componentsApi = {
  create: (project: string, name: string, source: "project" = "project"): Promise<ApiResult> => {
    return projectsApi.writeFile(
      project,
      "components",
      withJsExt(name),
      `import { Component } from "@types/Component.js";
import { Transform } from "@components/Transform.js";
  
export class ${name} extends Component {
  static schema = {
    // width: { type: "number", default: 32 },
    // label: { type: "string", default: "" },
    // color: { type: "color", default: "#ffffff" },
    // enabled: { type: "boolean", default: true },
  };
  
  constructor(data = {}) {
    super(data); // assigns any fields declared in static schema
  }
  
  onSpawn(entity, engine) {}
  
  onTick(entity, engine, dt) {
    const transform = entity.getComponent("Transform");
    if (!transform) return;
  }
  
  onDestroy(entity, engine) {}
}
  `
    );
  },
  remove: (project: string, name: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "components", withJsExt(name)),
};

// ---- Scripts ----
// Plain source files under "scripts" — no JSON wrapper, filename should

export const scriptsApi = {
  create: (project: string, filename: string, content = `// ${filename}\n
export function ${filename}(entity, engine, dt) {
  // these are the base arguments when attaching a script to an entity
  // you may call this manually with engine.callScript("${filename}", ...args) if you want to invoke it from another script
  // entity is the entity instance, engine is the game engine instance, dt is the delta time since last frame
  
  // your script logic here (will be called every tick)
}\n`): Promise<ApiResult> =>
    projectsApi.writeFile(project, "scripts", withJsExt(filename), content),
  remove: (project: string, filename: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "scripts", withJsExt(filename)),
};

const emptyGraph = JSON.stringify({ nodes: [], edges: [] }, null, 2);
export const graphScriptsApi = {
  save: (project: string, filename: string, content: string): Promise<ApiResult> =>
    projectsApi.writeFile(project, "scripts", withGraphExt(filename), content),
  create: (project: string, filename: string, content = emptyGraph): Promise<ApiResult> =>
    projectsApi.writeFile(project, "scripts", withGraphExt(filename), content),
  remove: async (project: string, filename: string): Promise<ApiResult> => {
    const result = await projectsApi.deleteFile(project, "scripts", withGraphExt(filename));
    try {
      // Compiled sibling may not exist yet (graph was never compiled) — ignore.
      await projectsApi.deleteFile(project, "scripts", withCompiledExt(filename));
    } catch {
      // no-op
    }
    return result;
  },
  nodeTypes: (): Promise<ScriptNodeTypesResponse> => api.get("api/scripts/nodes"),
  compile: (project: string, filename: string): Promise<GraphCompileResponse> =>
    api.post(`api/projects/${enc(project)}/scripts/${enc(withGraphExt(filename))}/compile`),
};

export interface TextureNodeField {
  key: string;
  type: "number" | "color" | "text" | "select";
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}
export interface TextureNodePort {
  id: string;
  label: string;
  dataType: "texture";
}
export interface TextureNodeDefinition {
  type: string;
  label: string;
  category: string;
  color: string;
  inputs?: TextureNodePort[];
  outputs?: TextureNodePort[];
  fields?: TextureNodeField[];
  compile: (args: { values: Record<string, unknown>; inputs: Record<string, string> }) => string;
}
export type TextureNodeMetadata = Omit<TextureNodeDefinition, "compile">;

export const texturesApi = {
  compile: (project: string, filename: string, graph: unknown): Promise<GraphCompileResponse> =>
    api.post(`api/projects/${enc(project)}/assets/${enc(filename)}/compile`, { graph }),
  getNodeTypes: async (): Promise<Record<string, TextureNodeMetadata>> => {
    const res = await fetch(`${BASE_URL}/api/textures/nodes`);
    const data: ScriptNodeTypesResponse = await res.json();
    return data.nodes;
  },
};
// ---- Scenes (delete only — create/save already covered by saveScene) ----

export const scenesApi = {
  remove: (project: string, name: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "scenes", withJsonExt(name)),
};

const enc = encodeURIComponent;

export const projectsApi = {
  list: () => api.get<ProjectListResponse>("api/projects"),
  create: (name: string) => api.post<ApiResult>(`api/projects/${enc(name)}`),
  remove: (name: string) => api.del<ApiResult>(`api/projects/${enc(name)}`),
  build: (name: string) => api.post<BuildResponse>(`api/build/${enc(name)}`),

  get: (name: string) => api.get<ProjectEditorData>(`api/projects/${enc(name)}/editor`),

  // -- scenes (dedicated endpoints) --
  getScene: (project: string, scene: string) =>
    api.get<SceneResponse>(`api/projects/${enc(project)}/scenes/${enc(scene)}`),

  saveScene: (project: string, scene: string, sceneData: Scene) =>
    api.put<ApiResult>(`api/projects/${enc(project)}/scenes/${enc(scene)}`, { scene: sceneData }),

  // -- open a script file in VS Code --
  openScript: (project: string, filename: string) =>
    api.post<OpenScriptResponse>(`api/projects/${enc(project)}/open-script`, { filename }),

  // -- generic folder file access (scenes / components / scripts) --
  listFiles: (project: string, folder: EditableFolder) =>
    api.get<FileListResponse>(`api/projects/${enc(project)}/${enc(folder)}`),

  readFile: (project: string, folder: EditableFolder, filename: string) =>
    api.get<FileContentResponse>(`api/projects/${enc(project)}/${enc(folder)}/${enc(filename)}`),

  writeFile: (project: string, folder: EditableFolder, filename: string, content: string) =>
    api.put<ApiResult>(`api/projects/${enc(project)}/${enc(folder)}/${enc(filename)}`, { content }),

  deleteFile: (project: string, folder: EditableFolder, filename: string) =>
    api.del<ApiResult>(`api/projects/${enc(project)}/${enc(folder)}/${enc(filename)}`),

  importAsset: (project: string, filename: string, data: string) =>
    api.post<ApiResult>(`api/projects/${enc(project)}/assets/import`, { filename, data }),

  renameAsset: (project: string, from: string, to: string) =>
    api.post<ApiResult>(`api/projects/${enc(project)}/assets/rename`, { from, to }),
};

// ---- Extensions ----
// See source/server/manager/ExtensionHandler.ts for how these are loaded
// server-side, and docs/changelogs/changelog2.md for the overall design.

export interface ExtensionManifest {
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  activation?: string[];
  view?: {
    type?: "modal" | "panel";
    size?: "md" | "lg" | "full";
    entry?: string;
  };
  hasFrontend: boolean;
}

export interface ExtensionListResponse extends ApiResult {
  extensions: ExtensionManifest[];
}

export const extensionsApi = {
  list: () => api.get<ExtensionListResponse>("api/extensions"),
};
