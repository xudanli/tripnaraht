export class Executor {
  async execute(action: string, payload?: unknown): Promise<{ status: "OK"; action: string; payload?: unknown }> {
    return {
      status: "OK",
      action,
      payload,
    };
  }
}
