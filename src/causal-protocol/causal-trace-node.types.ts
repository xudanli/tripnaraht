/**
 * Node-level types for Canonical Causal Trace v1 (linear / small DAG).
 */

export type CausalTraceNodeKind =
  | 'WORLD_FACT'
  | 'EFFECT'
  | 'PROBLEM'
  | 'OPTION'
  | 'OUTCOME';

export interface CausalFactRef {
  factId: string;
  factType: string;
  subjectType: string;
  subjectId: string;
  observedAt: string;
  source: string;
  confidence: number;
  /** User-facing narrative context — never expose raw internal variable names in UI */
  attributes?: Record<string, unknown>;
}

export interface CausalEffectV1 {
  effectId: string;
  causeFactIds: string[];
  effectType: string;
  affectedEntityType: string;
  affectedEntityId: string;
  previousValue?: unknown;
  predictedValue: unknown;
  propagationRuleId: string;
  confidence: number;
  explanationKey: string;
}

export interface CausalProblemRef {
  problemId: string;
  problemType?: string;
  severity?: 'INFO' | 'WARNING' | 'BLOCKER';
  assessmentKey?: string;
}

export interface CausalOptionRef {
  optionId: string;
  problemId: string;
  recommended?: boolean;
  metricsBefore?: Record<string, number>;
  metricsAfter?: Record<string, number>;
}

export interface CausalCalibrationV1 {
  outcomeRef: string;
  predictedMinutes?: number;
  actualMinutes?: number;
  predictionErrorMinutes?: number;
  verdict?: string;
  evaluatedAt: string;
}
