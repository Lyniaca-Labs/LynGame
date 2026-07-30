// LynGame Editor — remembers the last opened project across sessions

const STORAGE_KEY = "lyngame-last-project";

export function getLastProject(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setLastProject(name: string) {
  localStorage.setItem(STORAGE_KEY, name);
}
