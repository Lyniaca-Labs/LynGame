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

export const PORT = 3000;
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
  components: Record<string, Record<string, unknown>>;
}

export interface Scene {
  name: string;
  entities: Entity[];
}

export interface SceneResponse extends ApiResult {
  scene: Scene;
}

// ---- Editor snapshot ----

export interface ComponentDefinition {
  // shape of a component schema/definition — tighten once known
  [key: string]: unknown;
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

export type EditableFolder = "scenes" | "components" | "scripts";

export interface FileListResponse extends ApiResult {
  files: string[];
}

export interface FileContentResponse extends ApiResult {
  content: string;
}

export interface OpenScriptResponse extends ApiResult {
  openedWith?: string;
}

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