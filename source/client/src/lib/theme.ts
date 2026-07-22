// LynGame Editor — theme switcher
// Usage:
//   import { setTheme, getTheme, THEMES } from "./theme.js";
//   setTheme("terminal-green");

export const THEMES = [
  "retro-violet",
  "terminal-green",
  "sunset-pixel",
  "ice-blue",
  "crimson-noir",
  "cream-paper",
  "cream-paper-dark",
  "neon-arcade",
];

const STORAGE_KEY = "lyngame-theme";
const DEFAULT_THEME = "retro-violet";

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  return THEMES.includes(stored) ? stored : DEFAULT_THEME;
}

export function setTheme(theme: string) {
  if (!THEMES.includes(theme)) {
    console.warn(`Unknown LynGame theme "${theme}", falling back to ${DEFAULT_THEME}`);
    theme = DEFAULT_THEME;
  }
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme() {
  setTheme(getTheme());
}

// Call once on app start, e.g. in your editor's entry point:
// initTheme();