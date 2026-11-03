import 'fake-indexeddb/auto';

class TestStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

if (!('window' in globalThis)) Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
if (!('localStorage' in globalThis)) Object.defineProperty(globalThis, 'localStorage', { value: new TestStorage(), configurable: true });
