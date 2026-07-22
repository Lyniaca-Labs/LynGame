import type { EditorSnapshot, Scene } from "./types";
const request = async <T>(url: string, options?: RequestInit): Promise<T> => { const res = await fetch(url, options); const data = await res.json(); if (!res.ok || data.success === false) throw new Error(data.error || "Request failed"); return data; };
export const api = {
  projects: () => request<{ projects: string[] }>("/api/projects"),
  createProject: (name: string) => request(`/api/projects/${encodeURIComponent(name)}`, { method: "POST" }),
  deleteProject: (name: string) => request(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" }),
  editor: (project: string) => request<EditorSnapshot>(`/api/projects/${encodeURIComponent(project)}/editor`),
  scene: (project: string, scene: string) => request<{ scene: Scene }>(`/api/projects/${project}/scenes/${scene}`),
  saveScene: (project: string, scene: string, value: Scene) => request(`/api/projects/${project}/scenes/${scene}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: value }) }),
  openScript: (project: string, filename: string) => request(`/api/projects/${project}/open-script`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename }) }),
  readFile: (project: string, folder: string, filename: string) => request<{ content: string }>(`/api/projects/${project}/${folder}/${filename}`),
  writeFile: (project: string, folder: string, filename: string, content: string) => request(`/api/projects/${project}/${folder}/${filename}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }),
  build: (project: string) => request<{ url: string }>(`/api/build/${project}`, { method: "POST" }),
};
