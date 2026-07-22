// ui/DeleteProjectModal.tsx
import React, { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

const WAIT_SECONDS = 5;

export interface DeleteProjectModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  onConfirmDelete: () => Promise<void>;
}

export function DeleteProjectModal({
  open,
  onClose,
  projectName,
  onConfirmDelete,
}: DeleteProjectModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset the whole modal's local state every time it opens, and start the
  // countdown fresh — otherwise closing/reopening would keep a stale timer
  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setError(null);
    setDeleting(false);
    setSecondsLeft(WAIT_SECONDS);

    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const nameMatches = confirmText === projectName;
  const waitElapsed = secondsLeft === 0;
  const canDelete = nameMatches && waitElapsed && !deleting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirmDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete Project"
      description={`This permanently deletes "${projectName}" and everything in it. This cannot be undone.`}
      footer={
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={!canDelete}>
            {deleting
              ? "Deleting…"
              : !waitElapsed
                ? `Delete (${secondsLeft}s)`
                : "Delete"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[var(--color-text)]">
          Type <span className="font-mono font-semibold">{projectName}</span> to confirm.
        </span>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={projectName}
          monospace
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </Modal>
  );
}