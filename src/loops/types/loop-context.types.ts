import type { LoopType } from './loop-definition.types';

export interface LoopContext {
  tripId: string;
  loopRunId: string;
  loopType: LoopType;
  triggerEventId?: string;
  requestId?: string;
  userId?: string;
  startedAtMs: number;
  iteration: number;
}
