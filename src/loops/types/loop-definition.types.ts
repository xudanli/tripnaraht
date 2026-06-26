/** Declarative loop definitions — registry-backed, not a generic DSL engine (Phase 1). */

export type LoopType =
  | 'PLAN_GENERATION'
  | 'READINESS_REPAIR'
  | 'IN_TRIP_RECOVERY'
  | 'PRODUCT_IMPROVEMENT';

export type LoopRunStatus =
  | 'RUNNING'
  | 'WAITING_FOR_HUMAN'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED';

export type TripRuntimeState =
  | 'IDLE'
  | 'OBSERVING'
  | 'DIAGNOSING'
  | 'PROPOSING'
  | 'VALIDATING'
  | 'WAITING_FOR_HUMAN'
  | 'COMMITTING'
  | 'MONITORING'
  | 'DEGRADED'
  | 'PAUSED'
  | 'FAILED';

export type LoopIterationDecision =
  | 'CONTINUE'
  | 'COMMIT'
  | 'WAIT_FOR_HUMAN'
  | 'ABORT';

export interface LoopSuccessCriteria {
  hardBlockersMax?: number;
  readinessScoreMin?: number;
  completionRateP10Min?: number;
  unresolvedHumanDecisionsMax?: number;
}

export interface LoopBudgetPolicy {
  maxIterations: number;
  maxTokenCostUsd?: number;
  timeBudgetMs?: number;
}

export interface LoopDefinition {
  loopType: LoopType;
  triggerEventTypes: string[];
  allowedSkills: string[];
  verifierSet: string[];
  stopPolicy: string;
  humanApprovalPolicy: string;
  budgetPolicy: LoopBudgetPolicy;
  successCriteria: LoopSuccessCriteria;
}
