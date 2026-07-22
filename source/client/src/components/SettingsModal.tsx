// ui/SettingsModal.tsx
import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { getTheme, setTheme, THEMES } from "../lib/theme";

const THEME_LABELS: Record<string, string> = {
  "retro-violet": "Retro Violet",
  "terminal-green": "Terminal Green",
  "sunset-pixel": "Sunset Pixel",
  "ice-blue": "Ice Blue",
  "crimson-noir": "Crimson Noir",
  "cream-paper": "Cream Paper",
  "cream-paper-dark": "Cream Paper Dark",
  "neon-arcade": "Neon Arcade",
  "wealth": "Wealth",
  "wealth-dark": "Wealth Dark",
};

const themeOptions = THEMES.map((t) => ({
  value: t,
  label: THEME_LABELS[t] ?? t,
}));

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [theme, setThemeState] = useState(getTheme());

  function handleThemeChange(value: string) {
    setThemeState(value);
    setTheme(value);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      description="Editor preferences."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Theme</span>
        <Select
          options={themeOptions}
          value={theme}
          onChange={handleThemeChange}
          placeholder="Select a theme…"
          align="end"
        />
      </div>
    </Modal>
  );
}