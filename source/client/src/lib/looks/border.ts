export const BORDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "standard", label: "Standard" },
  { value: "strong", label: "Strong" },
];

const STORAGE_KEY = "lyngame-border";
const DEFAULT_BORDER = "minimal";

export function getBorder() {
 const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_BORDER;
 return BORDER_OPTIONS.map(option => option.value).includes(stored)
  ? stored
  : DEFAULT_BORDER;
}

export function setBorder(border: string) {
 if (!BORDER_OPTIONS.map(option => option.value).includes(border)) {
  console.warn(`Unknown LynGame border "${border}", falling back to ${DEFAULT_BORDER}`);
  border = DEFAULT_BORDER;
 }

 document.documentElement.setAttribute("data-border", border);
 localStorage.setItem(STORAGE_KEY, border);
}

export function initBorder() {
 setBorder(getBorder());
}