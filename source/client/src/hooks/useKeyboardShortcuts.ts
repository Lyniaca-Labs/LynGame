import { useEffect, useRef } from "react";

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  disabled?: boolean;
}

interface ShortcutEvent {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function isMod(e: KeyboardEvent) {
  return e.ctrlKey || e.metaKey;
}

function matches(s: Shortcut, e: ShortcutEvent) {
  return (
    s.key.toLowerCase() === e.key.toLowerCase() &&
    !!s.ctrl === e.ctrl &&
    !!s.shift === e.shift &&
    !!s.alt === e.alt
  );
}

/**
 * Registers global keyboard shortcuts for as long as the component using
 * this hook is mounted. Listens on two sources:
 *  - native `keydown` on window, for when focus is in the editor itself
 *  - `message` events of type EDITOR_KEYDOWN, forwarded by the game
 *    iframe (see GameEngine.js) — needed because keydowns fired while
 *    focus is inside the iframe belong to a different document and
 *    never bubble up to this window.
 * Both paths run through the same matcher so shortcuts only need to be
 * defined once.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const dispatch = (se: ShortcutEvent, isEditable: boolean) => {
      for (const s of shortcutsRef.current) {
        if (!matches(s, se)) continue;
        if (isEditable && !s.ctrl) return; // let bare keys type normally
        if (!s.disabled) s.handler();
        return;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      const se: ShortcutEvent = {
        key: e.key,
        ctrl: isMod(e),
        shift: e.shiftKey,
        alt: e.altKey,
      };

      const matched = shortcutsRef.current.find((s) => matches(s, se));
      if (matched && !(isEditable && !matched.ctrl)) {
        e.preventDefault();
        e.stopPropagation();
      }

      dispatch(se, !!isEditable);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "EDITOR_KEYDOWN") return;
      dispatch(
        { key: e.data.key, ctrl: !!e.data.ctrl, shift: !!e.data.shift, alt: !!e.data.alt },
        false
      );
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, []);
}