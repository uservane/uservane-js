/**
 * Node 25+ / some jsdom builds leave window.localStorage undefined.
 * Provide an in-memory Storage so anon-device keys work in unit tests.
 */
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.#map.set(String(key), String(value));
  }
}

const store = new MemoryStorage();

if (typeof globalThis !== "undefined") {
  try {
    const g = globalThis as typeof globalThis & { localStorage?: Storage; window?: Window };
    if (!g.localStorage || typeof g.localStorage.getItem !== "function") {
      Object.defineProperty(g, "localStorage", {
        value: store,
        configurable: true,
        writable: true,
      });
    }
    if (
      g.window &&
      (!g.window.localStorage || typeof g.window.localStorage.getItem !== "function")
    ) {
      Object.defineProperty(g.window, "localStorage", {
        value: store,
        configurable: true,
        writable: true,
      });
    }
  } catch {
    // ignore
  }
}
