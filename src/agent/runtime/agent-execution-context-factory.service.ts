// src/agent/runtime/agent-execution-context-factory.service.ts
import { Injectable } from '@nestjs/common';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { AgentExecutionContext } from './agent-execution-context.interface';

@Injectable()
export class AgentExecutionContextFactoryService {
  createFromFrozenMemory(memory: AgentMemoryContext): AgentExecutionContext {
    return {
      requestId: memory.requestId,
      snapshotId: memory.snapshotId,
      snapshotVersion: memory.snapshotVersion,
      executionBinding: {
        snapshot_id: memory.snapshotId,
        snapshot_version: memory.snapshotVersion,
        request_id: memory.requestId,
      },
      activeParentSpanId: null,
    };
  }
}
