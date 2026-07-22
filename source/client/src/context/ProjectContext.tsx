import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { projectsApi } from "../api";

export interface ProjectField {
  key: string;
  type: string;
  defaultValue: unknown;
}

export interface ComponentDefinition {
  name: string;
  source: "engine" | "project";
  filename: string;
  fields: ProjectField[];
}

export interface ProjectEditorData {
  success: boolean;

  project: {
    name: string;
    startScene: string;
    assets: unknown[];
  };

  components: Record<string, ComponentDefinition>;

  scenes: string[];
  prefabs: string[];
  scripts: string[];
  assets: unknown[];
}

interface ProjectContextValue {
  currentProject: string | null;
  projectData: ProjectEditorData | null;

  loading: boolean;
  error: string | null;

  openProject: (name: string) => Promise<void>;
  deleteProject: () => Promise<void>;
  reloadProject: () => Promise<void>;
  closeProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectEditorData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProject = async (name: string) => {
    if (!name) {
      closeProject();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await projectsApi.get(name);

      setCurrentProject(name);
      setProjectData(data as ProjectEditorData);

      console.log("Loaded project data:", data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load project"
      );
      setProjectData(null);
    } finally {
      setLoading(false);
    }
  };

  const reloadProject = async () => {
    if (!currentProject) return;

    await openProject(currentProject);
  };

  const deleteProject = async () => {
    if (!currentProject) return;

    await projectsApi.remove(currentProject);

    const { projects } = await projectsApi.list();

    if (projects.length > 0) {
      await openProject(projects[0]);
    } else {
      closeProject();
    }
  };

  const closeProject = () => {
    setCurrentProject(null);
    setProjectData(null);
    setError(null);
  };

  return (
    <ProjectContext.Provider
      value={{
        currentProject,
        projectData,

        loading,
        error,

        openProject,
        deleteProject,
        reloadProject,
        closeProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);

  if (!context) {
    throw new Error(
      "useProject must be used inside ProjectProvider"
    );
  }

  return context;
}