import { createHash } from 'crypto';
import type { ExecutionMemoryEvent, ExecutionMemoryGraph, ExecutionMemorySnapshot } from './execution-memory.types';

const events: ExecutionMemoryEvent[] = [];
const snapshots: ExecutionMemorySnapshot[] = [];
let eventSeq = 0;

export function getExecutionMemoryGraph(): ExecutionMemoryGraph {
  return {
    events: [...events],
    snapshots: [...snapshots],
  };
}

export function clearExecutionMemoryStore(): void {
  events.length = 0;
  snapshots.length = 0;
  eventSeq = 0;
}

export function createExecutionMemoryEventId(dagId: string, type: string, timestamp: number): string {
  eventSeq += 1;
  const payload = `${dagId}|${type}|${timestamp}|${eventSeq}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 24);
}

export function pushExecutionMemoryEvent(event: ExecutionMemoryEvent): void {
  events.push(event);
}

export function pushExecutionMemorySnapshot(snapshot: ExecutionMemorySnapshot): void {
  snapshots.push(snapshot);
}

