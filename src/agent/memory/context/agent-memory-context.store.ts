// src/agent/memory/context/agent-memory-context.store.ts
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

/**
 * route_and_run 异步链路内共享只读 AgentMemoryContext（后续阶段只读 get()）。
 */
@Injectable()
export class AgentMemoryContextStore {
  private readonly als = new AsyncLocalStorage<AgentMemoryContext>();

  run<T>(memory: AgentMemoryContext, fn: () => T): T {
    return this.als.run(memory, fn);
  }

  runPromise<T>(memory: AgentMemoryContext, fn: () => Promise<T>): Promise<T> {
    return this.als.run(memory, fn);
  }

  get(): AgentMemoryContext | undefined {
    return this.als.getStore();
  }
}
