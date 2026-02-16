/**
 * Phase 2 数据飞轮类型定义
 * 参考: docs/PHASE2_DATA_FLYWHEEL_DESIGN.md
 */

import { ObjectiveFunctionWeights } from '../optimization/objective-function.interface';

// ========== Layer 1: Decision Log ==========

export interface FlywheelDecisionContextSnapshot {
  worldModelVersion?: string;
  humanState?: Record<string, unknown>;
  routePhilosophy?: string;
}

export interface FlywheelDecisionLogInput {
  userId: string;
  tripId: string;
  decisionLogId?: string;
  contextSnapshot: FlywheelDecisionContextSnapshot;
  utilityWeights: ObjectiveFunctionWeights | Record<string, number>;
  candidatePlans?: Array<{ planId: string; score: number }>;
  selectedPlan?: Record<string, unknown>;
}

// ========== Layer 2: Behavior Log ==========

export type FlywheelBehaviorEventType =
  | 'PLAN_EDIT'
  | 'DAY_DELETE'
  | 'DAY_SHORTEN'
  | 'POI_REMOVE'
  | 'ROUTE_CHANGE'
  | 'ADOPT'
  | 'EXPORT'
  | 'ABANDON';

export interface FlywheelBehaviorLogInput {
  userId: string;
  tripId: string;
  planId?: string;
  eventType: FlywheelBehaviorEventType;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  deltaDistance?: number;
  deltaElevation?: number;
  deltaTime?: number;
  metadata?: Record<string, unknown>;
}

// ========== Layer 3: Outcome Capture ==========

export interface SubjectiveFeedback {
  fatigueLevel?: number;
  satisfaction?: number;
  paceFeeling?: string;
  budgetFeeling?: string;
}

export interface ObjectiveExecution {
  actualDuration?: number;
  actualCost?: number;
  actualDistance?: number;
  weatherDeviation?: string;
  delayEvents?: string[];
}

export interface FailureSignals {
  planAbandoned?: boolean;
  daySkipped?: string[];
  earlyReturn?: boolean;
}

export interface FlywheelOutcomeInput {
  tripId: string;
  userId: string;
  subjectiveFeedback?: SubjectiveFeedback;
  objectiveExecution?: ObjectiveExecution;
  failureSignals?: FailureSignals;
}

// ========== Layer 4: Parameter Set ==========

export type ParameterScope = 'global' | 'segment' | 'personal';

export interface FlywheelParameterSetInput {
  version: string;
  scope: ParameterScope;
  scopeId?: string;
  trainingDataRange: { start: string; end: string };
  metrics?: Record<string, number>;
  weights: ObjectiveFunctionWeights | Record<string, number>;
  isActive?: boolean;
}
