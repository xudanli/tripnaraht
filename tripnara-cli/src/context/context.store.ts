export class ContextStore {
  private readonly state = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }
}
