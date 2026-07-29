export const DEPTH_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "soft", label: "Soft" },
  { value: "layered", label: "Layered" },
];

const STORAGE_KEY = "lyngame-depth";
const DEFAULT_DEPTH = "soft";

export function getDepth() {
 const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_DEPTH;
 return DEPTH_OPTIONS.map(option => option.value).includes(stored)
  ? stored
  : DEFAULT_DEPTH;
}

export function setDepth(depth: string) {
 if (!DEPTH_OPTIONS.map(option => option.value).includes(depth)) {
  console.warn(`Unknown LynGame depth "${depth}", falling back to ${DEFAULT_DEPTH}`);
  depth = DEFAULT_DEPTH;
 }

 document.documentElement.setAttribute("data-depth", depth);
 localStorage.setItem(STORAGE_KEY, depth);
}

export function initDepth() {
 setDepth(getDepth());
}