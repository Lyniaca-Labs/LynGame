export const SHARPNESS_OPTIONS = [
  // comments are estimates of the radius
  { value: "low", label: "Bubble" },      // 24px radius
  { value: "medium", label: "Smooth" },   // 12px radius
  { value: "balanced", label: "Balanced" }, // 8px radius
  { value: "high", label: "Sharp" },      // 4px radius
  { value: "maximum", label: "Razor" },   // 0px radius
]


const STORAGE_KEY = "lyngame-sharpness";
const DEFAULT_SHARPNESS = "balanced";

export function getSharpness() {
  const stored = localStorage.getItem(STORAGE_KEY) || DEFAULT_SHARPNESS;
  return SHARPNESS_OPTIONS.map(option => option.value).includes(stored) ? stored : DEFAULT_SHARPNESS;
}

export function setSharpness(sharpness: string) {
  if (!SHARPNESS_OPTIONS.map(option => option.value).includes(sharpness)) {
    console.warn(`Unknown LynGame sharpness "${sharpness}", falling back to ${DEFAULT_SHARPNESS}`);
    sharpness = DEFAULT_SHARPNESS;
  }
  document.documentElement.setAttribute("data-sharpness", sharpness);
  localStorage.setItem(STORAGE_KEY, sharpness);
}

export function initSharpness() {
  setSharpness(getSharpness());
}
