import type { ExecutionMemoryEvent } from './execution-memory.types';
import {
  pushExecutionMemoryEvent,
  pushExecutionMemorySnapshot,
} from './memory-store';
import type { ExecutionMemorySnapshot } from './execution-memory.types';

export { createExecutionMemoryEventId } from './memory-store';

export function recordExecutionMemory(event: ExecutionMemoryEvent): void {
  pushExecutionMemoryEvent(event);
}

export function appendExecutionSnapshot(snapshot: ExecutionMemorySnapshot): void {
  pushExecutionMemorySnapshot(snapshot);
}
