// components/CodeStringEditorModal.tsx
import { useState } from "react";
import { Modal } from "../ui/Modal";
import { CodeStringEditor, CodeStringEditorProps } from "./CodeStringEditor";

type CodeStringEditorModalProps = Omit<CodeStringEditorProps, "className" | "onDirtyChange"> & {
  open: boolean;
};

export function CodeStringEditorModal({ open, title, onClose, ...editorProps }: CodeStringEditorModalProps) {
  const [dirty, setDirty] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      bodyClassName="p-0"
      confirmClose={dirty}
    >
      <CodeStringEditor
        {...editorProps}
        title={title}
        onClose={onClose}
        onDirtyChange={setDirty}
        className="h-full"
      />
    </Modal>
  );
}