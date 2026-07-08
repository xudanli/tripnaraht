/**
 * Formal shadow divergence event contract (ADR-007 Sprint: Shadow Observability + Task D).
 */

import type { DecisionRuntimeMode } from '../constraints/constraint-evaluation.config';
import type {
  FeasibilityStatus,
  TerminationReason,
} from '../contracts/optimization-result';
import type { LexicographicStageTrace } from '../optimization/engines/cp-sat-engine.types';

export type ShadowDivergenceType =
  | 'SAME_WINNER'
  | 'DIFFERENT_WINNER'
  | 'RANKING_DIFFERENCE'
  | 'FEASIBILITY_DIFFERENCE'
  | 'CONSTRAINT_DIFFERENCE'
  | 'POST_VALIDATION_DIFFERENCE'
  | 'OBJECTIVE_SCORE_DIFFERENCE'
  | 'TIE_BREAK_DIFFERENCE'
  | 'NO_SHADOW_RESULT'
  | 'SHADOW_TIMEOUT'
  | 'SHADOW_ERROR'
  | 'INPUT_MISMATCH';

export type DivergenceSeverity =
  | 'NONE'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type ManualReviewVerdict =
  | 'LEX_BETTER'
  | 'LEGACY_BETTER'
  | 'EQUIVALENT'
  | 'BOTH_INVALID'
  | 'INSUFFICIENT_INFORMATION';

export interface ShadowInputFingerprint {
  snapshotId: string;
  snapshotHash: string;
  candidateSetHash: string;
  candidateCount: number;
  constraintReportHash: string;
  constraintReportVersion: string;
  objectiveRegistryVersion: string;
  objectiveConfigHash: string;
  authorityStrategyVersion?: string;
  shadowStrategyVersion?: string;
}

export interface ResultSummary {
  strategyId: string;
  strategyVersion: string;
  solverEngine?: string;
  solverFamily?: string;
  optimizationLevel?: string;
  nativeCpSat?: boolean;
  success: boolean;
  timedOut: boolean;
  error?: string;
  selectedCandidateId?: string;
  feasibilityStatus: FeasibilityStatus;
  terminationReason: TerminationReason;
  hasIncumbent: boolean;
  elapsedMs: number;
  rankedTop3: string[];
  hardViolation: boolean;
  postValidationRejected: boolean;
}

export interface ShadowQualityDeltas {
  l2LoadDelta?: number;
  l3ExperienceDelta?: number;
  l4EfficiencyDelta?: number;
  corePoiDelta?: number;
  travelTimeDelta?: number;
  loadDelta?: number;
  minMemberUtilityDelta?: number;
  budgetDeviationDelta?: number;
}

export interface OptimizationShadowEvent {
  schemaId: 'tripnara.optimization_shadow_event@v1';
  comparisonId: string;
  tripId: string;
  decisionRunId: string;
  problemId: string;
  snapshotId: string;
  runtimeMode: DecisionRuntimeMode;

  authorityStrategyId: string;
  shadowStrategyId: string;

  inputFingerprint: ShadowInputFingerprint;
  inputConsistent: boolean;
  eligibleForStrategyComparison: boolean;

  authorityResult: ResultSummary;
  shadowResult?: ResultSummary;

  divergence: {
    diverged: boolean;
    sameWinner: boolean;
    types: ShadowDivergenceType[];
    severity: DivergenceSeverity;
    top3OverlapRate?: number;
    rankingCorrelation?: number;
    explainability: string[];
    stageTraceComplete: boolean;
  };

  lexicographicStageTraces?: LexicographicStageTrace[];
  qualityDeltas?: ShadowQualityDeltas;

  createdAt: string;

  legacyFinalizeSelectedId?: string;
  strategySelectedId?: string;
  strategyId?: string;
  legacyUtilityWinnerId?: string;
  utilityVsStrategyDiverged?: boolean;
}

export interface OptimizationShadowComparison {
  legacyFinalizeSelectedId?: string;
  strategySelectedId?: string;
  strategyId?: string;
  diverged: boolean;
  legacyUtilityWinnerId?: string;
  utilityVsStrategyDiverged: boolean;
}

export interface OptimizationShadowDashboardSnapshot {
  schemaId: 'tripnara.optimization_shadow_dashboard@v1';
  collectedAt: string;
  runtimeHealth: {
    shadow_run_total: number;
    shadow_success_rate: number;
    shadow_timeout_rate: number;
    shadow_error_rate: number;
    input_mismatch_rate: number;
    shadow_elapsed_ms_p50: number;
    shadow_elapsed_ms_p95: number;
  };
  divergence: {
    top1_divergence_rate: number;
    top3_overlap_rate_avg: number;
    ranking_correlation_avg: number;
    tie_break_divergence_rate: number;
    feasibility_divergence_rate: number;
    constraint_divergence_rate: number;
    divergence_explained_rate: number;
    stage_trace_complete_rate: number;
    by_type: Record<string, number>;
    by_severity: Record<DivergenceSeverity, number>;
  };
  safety: {
    authority_hard_violation_count: number;
    shadow_hard_violation_count: number;
    post_validation_rejection_count: number;
    unknown_to_pass_count: number;
    write_guard_bypass_count: number;
  };
  quality: {
    shadow_core_poi_delta_avg: number;
    shadow_travel_time_delta_avg: number;
    shadow_load_delta_avg: number;
    shadow_min_member_utility_delta_avg: number;
    shadow_budget_deviation_delta_avg: number;
  };
  recentEvents: OptimizationShadowEvent[];
}
