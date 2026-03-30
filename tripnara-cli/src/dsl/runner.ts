import { logger } from "../infra/logger";
import { PlannerAgent } from "../agents/planner.agent";
import { PolicyAgent } from "../agents/policy.agent";
import { MemoryAgent } from "../agents/memory.agent";
import { ExecutorAgent } from "../agents/executor.agent";
import { MemoryStore } from "../context/memory.store";

type DSLStep = {
  agent: string;
  input?: Record<string, unknown>;
};

type DSL = {
  name: string;
  steps: DSLStep[];
};

const memoryStore = new MemoryStore();
const agentRegistry = {
  planner: new PlannerAgent(),
  policy: new PolicyAgent(),
  memory: new MemoryAgent(memoryStore),
  executor: new ExecutorAgent(),
};

export async function runDSL(dsl: DSL): Promise<void> {
  logger.info(`Running DSL: ${dsl.name}`);
  for (const step of dsl.steps) {
    logger.info(`Step -> ${step.agent}`);
    const key = step.agent as keyof typeof agentRegistry;
    const agent = agentRegistry[key];
    if (!agent) {
      logger.warn(`Unknown agent: ${step.agent}`);
      continue;
    }
    const output = await agent.run((step.input ?? {}) as never);
    console.log(JSON.stringify({ agent: step.agent, output }, null, 2));
  }
}
