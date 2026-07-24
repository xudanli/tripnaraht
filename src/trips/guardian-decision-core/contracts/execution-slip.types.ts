/**
 * Slice 3 — Execution Deviation Canonical Closure (E0 frozen contracts).
 */

export type ExecutionDepartureSource =
  | 'USER_REPORT'
  | 'MOBILE_PRESENCE'
  | 'SYSTEM_INFERENCE';

/** E0.1 — Execution Observation */
export interface ExecutionDepartureObservation {
  observationId: string;
  tripId: string;
  planVersionId: string;
  activityId: string;

  plannedDepartAt: string;
  observedAt: string;

  stillAtPoi: boolean;
  source: ExecutionDepartureSource;
  recordedAt: string;
  recordedBy?: string;
}

/** E0.2 — POI Execution Window (minimal first version) */
export interface PoiExecutionWindow {
  poiId: string;
  activityId: string;

  lastEntryAt: string;
  closesAt?: string;
  timezone: string;

  sourceProvider: string;
  confidence: number;
}

/** E0.3 — Traversal / ETA Result */
export interface ExecutionEtaAssessment {
  currentActivityId: string;
  nextActivityId: string;

  plannedDepartAt: string;
  observedAt: string;

  projectedEta: string;
  lastEntryAt: string;

  slipMinutes: number;
  infeasible: boolean;
}

/** Effective plan activity slice used by assessor + pipeline */
export interface EffectivePlanActivity {
  activityId: string;
  poiId?: string;
  title?: string;
  plannedStartAt?: string;
  plannedDepartAt: string;
  plannedEndAt?: string;
  travelDurationMinutes: number;
  remainingStayMinutes: number;
  dayIndex: number;
}

export type ExecutionScheduleResult =
  | 'STILL_FEASIBLE'
  | 'AT_RISK'
  | 'WINDOW_MISSED'
  | 'UNKNOWN';

export type ExecutionScheduleGate =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'REJECT';

/** E4 — Assessor input/output */
export interface ExecutionScheduleInput {
  observation: Pick<
    ExecutionDepartureObservation,
    'activityId' | 'plannedDepartAt' | 'observedAt' | 'stillAtPoi'
  >;
  currentActivity: EffectivePlanActivity;
  nextActivity: EffectivePlanActivity;
  travelDurationMinutes: number;
  nextWindow: PoiExecutionWindow | null;
}

export interface ExecutionScheduleAssessment {
  result: ExecutionScheduleResult;
  projectedEta: string;
  lastEntryAt?: string;
  slipMinutes: number;
  gate: ExecutionScheduleGate;
  reasonCodes: string[];
  infeasible: boolean;
}

export const EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY =
  'EXECUTION_SCHEDULE_INFEASIBLE' as const;

export const EXECUTION_SLIP_CANDIDATE_IDS = {
  SHORTEN_CURRENT_STAY: 'cand_shorten_stay',
  REMOVE_NEXT_ACTIVITY: 'cand_remove_next',
  SUBSTITUTE_NEXT_ACTIVITY: 'cand_substitute_next',
} as const;
