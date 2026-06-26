import type { TripLoopUiViewDto } from '../adapters/trip-loop-ui.adapter';
import type { LoopIterationDecision, LoopRunStatus, LoopType, TripRuntimeState } from './loop-definition.types';
import type { LoopIterationRecord } from './loop-iteration.types';

export interface LoopRunRecord {
  id: string;
  tripId: string;
  loopType: LoopType;
  status: LoopRunStatus;
  triggerEventId?: string;
  currentIteration: number;
  tokenBudget?: number;
  costBudgetUsd?: number;
  timeBudgetMs?: number;
  startedAt: string;
  completedAt?: string;
  finalOutcome?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ReadinessRepairSnapshot {
  readinessScore: number;
  hardBlockers: number;
  mustHandleCount: number;
  suggestAdjustCount: number;
  canStartExecute: boolean;
  verdictStatus: string;
  completionRateP10?: number;
  checklist?: Partial<
    Record<
      string,
      {
        result: 'passed' | 'pending' | 'failed' | 'deferred';
        detail?: string;
      }
    >
  >;
}

export interface ReadinessRepairIterationView {
  sequence: number;
  issueId: string;
  blockerId: string;
  issueTitle: string;
  proposal: {
    optionId: string;
    title: string;
    actionType: string;
  };
  validation: {
    passed: boolean;
    previewStatus: string;
    wouldDefer?: boolean;
    feasibilityScoreBefore?: number;
    feasibilityScoreAfter?: number;
    completionRateP10?: number;
  };
  decision: LoopIterationDecision;
  attemptedOptions: string[];
}

export interface ReadinessRepairLoopResult {
  loopRunId: string;
  status: LoopRunStatus;
  runtimeState: TripRuntimeState;
  before: ReadinessRepairSnapshot;
  after: ReadinessRepairSnapshot;
  iterations: ReadinessRepairIterationView[];
  recommendedPatches: Array<{
    issueId: string;
    blockerId: string;
    optionId: string;
    title: string;
    actionType: string;
    previewStatus: string;
  }>;
  requiresApproval: boolean;
  stopReason?: string;
  /** C 端决策闭环 UI 视图（Phase 2） */
  ui?: TripLoopUiViewDto;
}

export interface LoopRunDetail extends LoopRunRecord {
  iterations: LoopIterationRecord[];
}
