import { AsyncLocalStorage } from 'async_hooks';
import type { DecisionOsExecutionContext } from './decision-os-execution-context';

/**
 * ALS 承载 Decision OS 上下文宪法；编排/governance/planner 优先从此读取，禁止回写 request.options。
 */
export class DecisionOsExecutionContextStore {
  private readonly als = new AsyncLocalStorage<DecisionOsExecutionContext>();

  run<T>(ctx: DecisionOsExecutionContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  runPromise<T>(ctx: DecisionOsExecutionContext, fn: () => Promise<T>): Promise<T> {
    return this.als.run(ctx, fn);
  }

  get(): DecisionOsExecutionContext | undefined {
    return this.als.getStore();
  }
}
