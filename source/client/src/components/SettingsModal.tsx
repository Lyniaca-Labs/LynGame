// ui/SettingsModal.tsx
import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { getTheme, setTheme, THEMES } from "../lib/looks/theme";
import { getSharpness, setSharpness, SHARPNESS_OPTIONS } from "../lib/looks/sharpness";
import { getFont, setFont, FONT_OPTIONS } from "../lib/looks/font";
import { getDensity, setDensity, DENSITY_OPTIONS } from "../lib/looks/density";
import { getDepth, setDepth, DEPTH_OPTIONS } from "../lib/looks/depth";
import { getBorder, setBorder, BORDER_OPTIONS } from "../lib/looks/border";

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
  const [sharpness, setSharpnessState] = useState(getSharpness());
  const [font, setFontState] = useState(getFont());
  const [density, setDensityState] = useState(getDensity());
  const [depth, setDepthState] = useState(getDepth());
  const [border, setBorderState] = useState(getBorder());

  function handleDepthChange(value: string) {
    setDepthState(value);
    setDepth(value);
  }

  function handleBorderChange(value: string) {
    setBorderState(value);
    setBorder(value);
  }

  function handleDensityChange(value: string) {
    setDensityState(value);
    setDensity(value);
  }

  function handleFontChange(value: string) {
    setFontState(value);
    setFont(value);
  }

  function handleSharpnessChange(value: string) {
    setSharpnessState(value);
    setSharpness(value);
  }

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
      <br />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Sharpness</span>
        <Select
          options={SHARPNESS_OPTIONS}
          value={sharpness}
          onChange={handleSharpnessChange}
          placeholder="Select sharpness…"
          align="end"
        />
      </div>
      <br />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Font</span>
        <Select
          options={FONT_OPTIONS}
          value={font}
          onChange={handleFontChange}
          placeholder="Select a font…"
          align="end"
        />
      </div>
      <br />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Border</span>
        <Select
          options={BORDER_OPTIONS}
          value={border}
          onChange={handleBorderChange}
          placeholder="Select a border…"
          align="end"
        />
      </div>
      {/* <br />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Depth</span>
        <Select
          options={DEPTH_OPTIONS}
          value={depth}
          onChange={handleDepthChange}
          placeholder="Select a depth…"
          align="end"
        />
      </div>
      <br /> */}
      {/* <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[var(--color-text)]">Density</span>
        <Select
          options={DENSITY_OPTIONS}
          value={density}
          onChange={handleDensityChange}
          placeholder="Select a density…"
          align="end"
        />
      </div> */}
    </Modal>
  );
}