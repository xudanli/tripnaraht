export class MemoryStore {
  private readonly memory = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.memory.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.memory.get(key) as T | undefined;
  }
}
