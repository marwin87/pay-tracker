// Last-fetched page data, kept for the session so a tab switch shows it instantly
// while the page refetches in the background (no skeleton flash). Cleared on logout.
const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached(key: string, value: unknown): void {
  store.set(key, value);
}

export function clearPageCache(): void {
  store.clear();
}
