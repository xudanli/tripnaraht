import type { LoopRunStatus, LoopType } from './loop-definition.types';

export type LoopEvalCaseKind = 'GOLDEN' | 'FAILURE' | 'REGRESSION' | 'EDGE';

export type LoopEvalApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LoopEvalCaseApproval {
  status: LoopEvalApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
}

/** Context → Options → Decision → Reason → Outcome → Counterfactual */
export interface DecisionLearningSixTuple {
  context: {
    tripId: string;
    loopType: LoopType;
    loopRunId: string;
    triggerEventId?: string;
    triggerType?: string;
    before: Record<string, unknown>;
  };
  options: Array<{
    id: string;
    title: string;
    actionType?: string;
    sequence: number;
    validationPassed?: boolean;
  }>;
  decision: {
    loopStatus: LoopRunStatus;
    chosenOptionId?: string;
    requiresApproval: boolean;
  };
  reason: {
    stopReason?: string;
    diagnoses: Record<string, unknown>[];
  };
  outcome: {
    after: Record<string, unknown>;
    iterationCount: number;
  };
  counterfactual?: {
    rejectedOptionId?: string;
    rejectedTitle?: string;
    note: string;
  };
}

export interface LoopEvalReplayExpectations {
  expectedStatus?: LoopRunStatus;
  maxIterations?: number;
  minReadinessDelta?: number;
  mustImproveBlockers?: boolean;
}

export interface LoopEvalCase {
  id: string;
  kind: LoopEvalCaseKind;
  loopType: LoopType;
  loopRunId: string;
  tripId: string;
  capturedAt: string;
  sixTuple: DecisionLearningSixTuple;
  replayExpectations?: LoopEvalReplayExpectations;
  approval?: LoopEvalCaseApproval;
  metadata?: {
    source: 'loop_engineering_v1';
    tags?: string[];
    priority?: 'P0' | 'P1' | 'P2';
    promotedToApprovedCorpus?: boolean;
  };
}

export interface DecisionLearningLoopResult {
  loopRunId: string;
  status: LoopRunStatus;
  materialized: LoopEvalCase[];
  skipped: Array<{ loopRunId: string; reason: string }>;
  replaySummary?: {
    caseId: string;
    passed: boolean;
    message: string;
  }[];
}
