const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);

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
  type: "number" | "text" | "boolean" | "color" | "vector";
  defaultValue: unknown;
}

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

export interface ProjectEditorData extends ApiResult {
  project: ProjectInfo;
  components: Record<string, ComponentDefinition>;
  scenes: string[];
  prefabs: string[];
  scripts: string[];
  assets: unknown[];
}

// ---- Folder file listing / editing ----

export type EditableFolder = "scenes" | "components" | "scripts" | "prefabs" | "assets";

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

const withJsExt = (filename: string) => (filename.endsWith(".js") ? filename : `${filename}.js`);
const withJsonExt = (filename: string) => (filename.endsWith(".json") ? filename : `${filename}.json`);

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

// ---- Components ----
// No dedicated endpoints — stored as plain JSON files under "components",
// same pattern as prefabs.

export const componentsApi = {
  create: (project: string, name: string, source: "project" = "project"): Promise<ApiResult> => {
    const def: ComponentDefinition = {
      name,
      source,
      filename: withJsExt(name),
      fields: [],
    };
    return projectsApi.writeFile(project, "components", withJsExt(name), JSON.stringify(def, null, 2));
  },
  remove: (project: string, name: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "components", withJsExt(name)),
};

// ---- Scripts ----
// Plain source files under "scripts" — no JSON wrapper, filename should

export const scriptsApi = {
  create: (project: string, filename: string, content = `// ${filename}\n`): Promise<ApiResult> =>
    projectsApi.writeFile(project, "scripts", withJsExt(filename), content),
  remove: (project: string, filename: string): Promise<ApiResult> =>
    projectsApi.deleteFile(project, "scripts", withJsExt(filename)),
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
};