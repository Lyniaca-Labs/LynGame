import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Trash2 } from "lucide-react";
import { DeleteProjectModal } from "./DeleteProjectModal";

export interface ProjectSettingsModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  onDelete: () => Promise<void>;
}

export function ProjectSettingsModal({
  open,
  onClose,
  projectName,
  onDelete,
}: ProjectSettingsModalProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    await onDelete();
    setDeleteOpen(false);
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Project Settings"
        description={`Configuration for "${projectName}".`}
        footer={
          <div className="flex justify-between w-full">
            <Button
              variant="danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
              Delete Project
            </Button>

            <Button onClick={onClose}>Done</Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-text-faint)]">
          No project-level settings are wired up yet — the server doesn't expose
          a route to read or write{" "}
          <span className="font-mono">project.lg</span> yet.
        </p>
      </Modal>

      <DeleteProjectModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        projectName={projectName}
        onConfirmDelete={handleDelete}
      />
    </>
  );
}