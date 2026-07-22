// src/components/ProjectSelector.tsx
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { projectsApi } from "../api";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
// import { DeleteProjectModal } from "./DeleteProjectModal";

interface ProjectSelectorProps {
  currentProject: string | null;
  onSelect: (project: string) => void;
}

export function ProjectSelector({ currentProject, onSelect }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await projectsApi.list();
      setProjects(data.projects);
      if (!currentProject && data.projects.length > 0) {
        onSelect(data.projects[0]);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // intentionally mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError("Enter a project name");
      return;
    }
    setCreateError(null);
    try {
      await projectsApi.create(name);
      setNewName("");
      setCreating(false);
      await refresh();
      onSelect(name);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  // const handleDeleteConfirmed = async () => {
  //   if (!currentProject) return;
  //   await projectsApi.remove(currentProject);
  //   // pick a sensible next project so the app doesn't dangle on a deleted one
  //   const remaining = projects.filter((p) => p !== currentProject);
  //   setProjects(remaining);
  //   onSelect(remaining[0] ?? "");
  //   await refresh();
  // };

  const selectOptions = projects.map((p) => ({ value: p, label: p }));

  return (
    <div className="flex items-center gap-2">
      {projects.length > 0 && (
        <Select
          options={selectOptions}
          value={currentProject ?? undefined}
          onChange={onSelect}
          placeholder="Select a project…"
          emptyMessage="No projects"
          disabled={loading}
        />
      )}

      {listError && <span className="text-xs text-red-500">{listError}</span>}

      {creating ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="project name"
            error={createError ?? undefined}
          />
          <Button onClick={handleCreate}>Add</Button>
          <Button
            onClick={() => {
              setCreating(false);
              setNewName("");
              setCreateError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button onClick={() => setCreating(true)} aria-label="New project">
          <Plus size={16} />
        </Button>
      )}

      {/* {currentProject && (
        <Button onClick={() => setDeleteOpen(true)} aria-label="Delete project">
          <Trash2 size={16} />
        </Button>
      )} */}

      {/* {currentProject && (
        <DeleteProjectModal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          projectName={currentProject}
          onConfirmDelete={handleDeleteConfirmed}
        />
      )} */}
    </div>
  );
}