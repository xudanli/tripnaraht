import { BaseAgent } from "./base.agent";
import { MemoryStore } from "../context/memory.store";

export class MemoryAgent extends BaseAgent<{ key: string; value?: unknown }, { ok: boolean; value?: unknown }> {
  name = "memory";
  constructor(private readonly store: MemoryStore) {
    super();
  }

  async run(input: { key: string; value?: unknown }) {
    if (input.value !== undefined) {
      this.store.set(input.key, input.value);
      return { ok: true, value: input.value };
    }
    return { ok: true, value: this.store.get(input.key) };
  }
}
