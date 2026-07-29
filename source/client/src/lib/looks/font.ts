export const FONT_OPTIONS = [
  { value: "modern", label: "Modern" },
  { value: "clean", label: "Clean" },
  { value: "classic", label: "Classic" },
  { value: "technical", label: "Technical" },
  { value: "retro", label: "Retro" },
];

const STORAGE_KEY = "lyngame-font";
const DEFAULT_FONT = "modern";

export function getFont() {
  const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_FONT;
  return FONT_OPTIONS.map(option => option.value).includes(stored)
    ? stored
    : DEFAULT_FONT;
}

export function setFont(font: string) {
  if (!FONT_OPTIONS.map(option => option.value).includes(font)) {
    console.warn(`Unknown LynGame font "${font}", falling back to ${DEFAULT_FONT}`);
    font = DEFAULT_FONT;
  }

  document.documentElement.setAttribute("data-font", font);
  localStorage.setItem(STORAGE_KEY, font);
}

export function initFont() {
  setFont(getFont());
}