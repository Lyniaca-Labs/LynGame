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
  del: <T>(url: string) => request<T>(`${BASE_URL}/${url}`, { method: "DELETE" }),
};

// ---- Typed wrappers for the endpoints the UI actually calls ----

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

export const projectsApi = {
  list: () => api.get<ProjectListResponse>("api/projects"),
  create: (name: string) => api.post<ApiResult>(`api/projects/${encodeURIComponent(name)}`),
  remove: (name: string) => api.del<ApiResult>(`api/projects/${encodeURIComponent(name)}`),
  build: (name: string) => api.post<BuildResponse>(`api/build/${encodeURIComponent(name)}`),
};