// src/agent/runtime/agent-execution-context.store.ts
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { AgentExecutionContext } from './agent-execution-context.interface';

@Injectable()
export class AgentExecutionContextStore {
  private readonly als = new AsyncLocalStorage<AgentExecutionContext>();

  run<T>(ctx: AgentExecutionContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  runPromise<T>(ctx: AgentExecutionContext, fn: () => Promise<T>): Promise<T> {
    return this.als.run(ctx, fn);
  }

  get(): AgentExecutionContext | undefined {
    return this.als.getStore();
  }
}
