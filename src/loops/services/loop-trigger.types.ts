import type { InTripRecoveryLoopResult } from '../types/in-trip-recovery.types';
import type { ReadinessRepairLoopResult } from '../types/loop-run.types';

export type LoopTriggerOutcome =
  | { action: 'started'; result: ReadinessRepairLoopResult }
  | { action: 'skipped'; reason: string };

export type InTripLoopTriggerOutcome =
  | { action: 'started'; result: InTripRecoveryLoopResult }
  | { action: 'skipped'; reason: string };

export interface InTripLoopTriggerInput {
  tripId: string;
  userId: string;
  triggerType: import('../events/loop-travel-event.types').LoopTriggerType;
  triggerEventId?: string;
  externalEventId?: string;
  environmentEventId?: string;
  force?: boolean;
  allowInternal?: boolean;
  /** 内部：经 ContingencyOrchestrator 路由时跳过二次编排 */
  _viaContingencyOrchestrator?: boolean;
}
