// context/DialogContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

type PromptRequest = {
  id: string;
  type: "prompt";
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
};

type ConfirmRequest = {
  id: string;
  type: "confirm";
  message: string;
  resolve: (value: boolean) => void;
};

type DialogRequest = PromptRequest | ConfirmRequest;

// Augment the global window type so `await window.prompt(...)` /
// `await window.confirm(...)` type-check as promise-returning.
declare global {
  interface Window {
    prompt(message?: string, defaultValue?: string): Promise<string | null>;
    confirm(message?: string): Promise<boolean>;
  }
}

const DialogContext = createContext<null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const idRef = useRef(0);

  const enqueue = useCallback((req: DialogRequest) => {
    setQueue((q) => [...q, req]);
  }, []);

  // resolves whichever request is currently on top of the queue and
  // advances to the next one, if any
  const resolveCurrent = useCallback((value: string | boolean | null) => {
    setQueue((q) => {
      const [first, ...rest] = q;
      if (!first) return q;
      if (first.type === "prompt") first.resolve(value as string | null);
      else first.resolve(value as boolean);
      return rest;
    });
  }, []);

  // Install the overrides once on mount, and restore the originals on
  // unmount so this doesn't leak outside the provider's lifetime.
  useEffect(() => {
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;

    (window as unknown as { prompt: (message?: string, defaultValue?: string) => Promise<string | null> }).prompt =
      (message?: string, defaultValue?: string) => {
        return new Promise<string | null>((resolve) => {
          idRef.current += 1;
          enqueue({
            id: String(idRef.current),
            type: "prompt",
            message: message ?? "",
            defaultValue: defaultValue ?? "",
            resolve,
          });
        });
      };

    (window as unknown as { confirm: (message?: string) => Promise<boolean> }).confirm =
      (message?: string) => {
        return new Promise<boolean>((resolve) => {
          idRef.current += 1;
          enqueue({ id: String(idRef.current), type: "confirm", message: message ?? "", resolve });
        });
      };

    return () => {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    };
  }, [enqueue]);

  const current = queue[0] ?? null;

  return (
    <DialogContext.Provider value={null}>
      {children}
      {current?.type === "prompt" && (
        <PromptModal
          key={current.id}
          message={current.message}
          defaultValue={current.defaultValue}
          onSubmit={(value) => resolveCurrent(value)}
          onCancel={() => resolveCurrent(null)}
        />
      )}
      {current?.type === "confirm" && (
        <ConfirmModal
          key={current.id}
          message={current.message}
          onConfirm={() => resolveCurrent(true)}
          onCancel={() => resolveCurrent(false)}
        />
      )}
    </DialogContext.Provider>
  );
}

// No hook needed — the whole point is that consumers keep calling
// window.prompt / window.confirm directly, unchanged.

// ---- internal modal components ----

interface PromptModalProps {
  message: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}



interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function PromptModal({ message, defaultValue, onSubmit, onCancel }: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Enter a name"
      description={message}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" onClick={handleSubmit} disabled={!value.trim()}>
            Confirm
          </Button>
        </div>
      }
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
    </Modal>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="Are you sure?"
      description={message}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      }
    >
      <span />
    </Modal>
  );
}