import { AsyncLocalStorage } from 'async_hooks';

/**
 * Implicit trace context for LLM usage logging (route_and_run and descendants).
 * Avoids threading tokenContext through every Skill / Sub-Agent call site.
 */
export interface LlmTraceContext {
  requestId: string;
  stepName?: string;
  subAgent?: string;
  /** route_and_run 通路：LIGHTWEIGHT | STATE_MACHINE | CLAUDE_DYNAMIC | REDIRECT 等 */
  routePath?: string;
}

export const llmTraceContextStorage = new AsyncLocalStorage<LlmTraceContext>();

export function runWithLlmTraceContext<T>(
  context: LlmTraceContext,
  fn: () => T,
): T {
  return llmTraceContextStorage.run(context, fn);
}

export function getLlmTraceContext(): LlmTraceContext | undefined {
  return llmTraceContextStorage.getStore();
}

export function setLlmTraceStepName(stepName: string): void {
  const store = llmTraceContextStorage.getStore();
  if (store) {
    store.stepName = stepName;
  }
}

export function setLlmTraceSubAgent(subAgent: string): void {
  const store = llmTraceContextStorage.getStore();
  if (store) {
    store.subAgent = subAgent;
  }
}

export function setLlmTraceRoutePath(routePath: string): void {
  const store = llmTraceContextStorage.getStore();
  if (store) {
    store.routePath = routePath;
  }
}
