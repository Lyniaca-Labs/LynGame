export const DENSITY_OPTIONS = [
 { value: "compact", label: "Compact" },
 { value: "balanced", label: "Balanced" },
 { value: "comfortable", label: "Comfortable" },
];

const STORAGE_KEY = "lyngame-density";
const DEFAULT_DENSITY = "balanced";

export function getDensity() {
 const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_DENSITY;
 return DENSITY_OPTIONS.map(option => option.value).includes(stored)
  ? stored
  : DEFAULT_DENSITY;
}

export function setDensity(density: string) {
 if (!DENSITY_OPTIONS.map(option => option.value).includes(density)) {
  console.warn(`Unknown LynGame density "${density}", falling back to ${DEFAULT_DENSITY}`);
  density = DEFAULT_DENSITY;
 }

 document.documentElement.setAttribute("data-density", density);
 localStorage.setItem(STORAGE_KEY, density);
}

export function initDensity() {
 setDensity(getDensity());
}