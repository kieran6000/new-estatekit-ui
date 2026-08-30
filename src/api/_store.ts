// Frontend-only persistence: every "table" in this mock app is a JSON blob in
// localStorage, seeded on first read. Nothing here ever leaves the browser.
const PREFIX = "estatekit_mock:";

export function getStore<T>(key: string, seed: T): T {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) {
    localStorage.setItem(PREFIX + key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

export function setStore<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
