import { BaseAgent } from "./base.agent";
import { Executor } from "../core/executor";

export class ExecutorAgent extends BaseAgent<{ action: string; payload?: unknown }, { status: "OK"; action: string; payload?: unknown }> {
  name = "executor";
  private readonly executor = new Executor();

  async run(input: { action: string; payload?: unknown }) {
    return this.executor.execute(input.action, input.payload);
  }
}
