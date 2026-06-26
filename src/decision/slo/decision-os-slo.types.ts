/**
 * Decision OS SLO — 联席修订 KPI 的可观测类型
 */

export type ValidationGatewayStageId =
  | 'DATA_RELIABILITY'
  | 'RISK_EVENTS'
  | 'AXIOM_PROJECTION'
  | 'PHYSICAL_ONTOLOGY'
  | 'KPU_OUTPUT_CHECK'
  | 'ROUTE_FEASIBILITY'
  | 'SUNSET_TIMELINE'
  | 'ITINERARY_VERIFY_SKILL'
  | 'EXPERIENCE_AGENT';

export type ContingencyPathId =
  | 'KERNEL_REPLAN'
  | 'IN_TRIP_RECOVERY'
  | 'SILENT_HEAL'
  | 'ADVISOR_PLAN_B';

export type SloOutcome = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

export interface ValidationStageMetric {
  stageId: ValidationGatewayStageId;
  durationMs: number;
  issueCount: number;
  fatalCount: number;
  conflictCount: number;
  advisoryCount: number;
  skipped: boolean;
  error?: string;
}

export interface ValidationRunMetric {
  requestId: string;
  tripId?: string | null;
  runAt: string;
  durationMs: number;
  stages: ValidationStageMetric[];
  totalIssues: number;
  hasFatal: boolean;
  hasConflict: boolean;
  confidenceDelta: number;
  /** 无 FATAL/CONFLICT 视为通过 */
  passed: boolean;
  outcome: SloOutcome;
}

export interface ContingencyRunMetric {
  tripId: string;
  pathId: ContingencyPathId;
  reason: string;
  runAt: string;
  durationMs: number;
  outcome: SloOutcome;
  error?: string;
  humanAssisted?: boolean;
}

export interface DecisionOsSloSnapshot {
  generatedAt: string;
  validation: {
    totalRuns: number;
    passedRuns: number;
    passRatePct: number;
    avgDurationMs: number;
    byStage: Partial<Record<ValidationGatewayStageId, { runs: number; avgIssueCount: number }>>;
  };
  contingency: {
    totalRuns: number;
    successRuns: number;
    successRatePct: number;
    byPath: Partial<Record<ContingencyPathId, { runs: number; successRatePct: number }>>;
  };
  /** 联席混合干预成功率（自动成功 + PARTIAL 人工兜底） */
  blendedInterventionSuccessRatePct: number;
}

/** MemoryState v1 overlay shadow diff（dry_run 可观测） */
export interface MemoryStateShadowRecord {
  userId: string;
  recordedAt: string;
  overlayApplied: boolean;
  changedKeys: string[];
}
