/**
 * Travel ETA prediction reconciliation — base vs planning vs actual.
 * Schema: tripnara/travel-eta-reconciliation/v1
 */

import type {
  TravelEtaAdjustmentReason,
  TravelEtaAuthority,
  TravelEtaEnvelopeV1,
  TravelEtaProviderTraceStatus,
  TravelEtaRouteProvider,
} from './travel-eta.contract';

export const TRAVEL_ETA_RECONCILIATION_SCHEMA = 'tripnara/travel-eta-reconciliation/v1' as const;

export type TravelEtaReconciliationPhase =
  | 'PLANNING_SHADOW'
  | 'PLANNING_AUTHORITATIVE'
  | 'ACTUAL';

export interface TravelEtaReconciliationEventV1 {
  schema: typeof TRAVEL_ETA_RECONCILIATION_SCHEMA;
  eventId: string;
  recordedAt: string;
  phase: TravelEtaReconciliationPhase;
  tripId?: string;
  fromItemId?: string;
  toItemId?: string;
  segmentKey?: string;

  baseDurationMin: number;
  planningDurationMin: number;
  actualDurationMin?: number;

  /** actual − base (positive = provider under-estimated) */
  baseErrorMin?: number;
  /** actual − planning */
  planningErrorMin?: number;

  uncertaintyMin: number;
  /** actual within [planning, planning + uncertainty] */
  bufferHit?: boolean;
  /** actual < planning (over-buffered) */
  overBuffered?: boolean;
  /** actual > planning + uncertainty */
  underBuffered?: boolean;

  adjustmentReasons: TravelEtaAdjustmentReason[];
  provider: TravelEtaRouteProvider;
  providerTraceStatus: TravelEtaProviderTraceStatus;
  authority: TravelEtaAuthority;
  decision?: string;
  gateReasons?: string[];
  /** From travel-eta-actual — only VALID enters MAE calibration */
  sampleQuality?: import('./travel-eta-actual.contract').TravelEtaSampleQuality;
}

export interface TravelEtaReconciliationMetricsV1 {
  sampleCount: number;
  withActualCount: number;
  baseMaeMin: number | null;
  planningMaeMin: number | null;
  bufferHitRate: number | null;
  overBufferRate: number | null;
  underBufferRate: number | null;
  providerKnownRate: number;
  demProvenanceRate: number | null;
}

export function buildPlanningReconciliationEvent(input: {
  eta: TravelEtaEnvelopeV1;
  tripId?: string;
  fromItemId?: string;
  toItemId?: string;
  decision?: string;
  eventId?: string;
}): TravelEtaReconciliationEventV1 {
  const eta = input.eta;
  const phase: TravelEtaReconciliationPhase =
    eta.authority === 'AUTHORITATIVE' ? 'PLANNING_AUTHORITATIVE' : 'PLANNING_SHADOW';
  const segmentKey =
    input.fromItemId && input.toItemId
      ? `${input.fromItemId}->${input.toItemId}`
      : undefined;

  return {
    schema: TRAVEL_ETA_RECONCILIATION_SCHEMA,
    eventId: input.eventId ?? `eta-recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: new Date().toISOString(),
    phase,
    tripId: input.tripId,
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    segmentKey,
    baseDurationMin: eta.baseDurationMin,
    planningDurationMin: eta.planningDurationMin,
    uncertaintyMin: eta.uncertaintyMin,
    adjustmentReasons: eta.adjustmentReasons ?? [],
    provider: eta.provenance.provider,
    providerTraceStatus: eta.providerTraceStatus ?? (eta.provenance.provider === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED'),
    authority: eta.authority ?? 'SHADOW',
    decision: input.decision,
    gateReasons: eta.gateReasons,
  };
}

export function attachActualDuration(
  planning: TravelEtaReconciliationEventV1,
  actualDurationMin: number,
  opts?: {
    sampleQuality?: import('./travel-eta-actual.contract').TravelEtaSampleQuality;
  },
): TravelEtaReconciliationEventV1 {
  const actual = Math.max(0, Math.round(actualDurationMin));
  const baseErrorMin = actual - planning.baseDurationMin;
  const planningErrorMin = actual - planning.planningDurationMin;
  const lo = Math.max(0, planning.planningDurationMin - planning.uncertaintyMin);
  const hi = planning.planningDurationMin + planning.uncertaintyMin;
  const bufferHit = actual >= lo && actual <= hi;
  const overBuffered = actual < planning.planningDurationMin;
  const underBuffered = actual > hi;

  return {
    ...planning,
    phase: 'ACTUAL',
    recordedAt: new Date().toISOString(),
    actualDurationMin: actual,
    baseErrorMin,
    planningErrorMin,
    bufferHit,
    overBuffered,
    underBuffered,
    sampleQuality: opts?.sampleQuality ?? planning.sampleQuality,
  };
}

/**
 * ETA-L2-EXECUTION-ACTUAL-01 — VALID sample reconciliation (ops / MAE).
 * planningVsBaseImprovementMin > 0 ⇒ Planning closer to Actual than Base.
 */
export interface ExecutionEtaReconciliationV1 {
  tripId: string;
  segmentId: string;
  planVersionId: string;

  baseDurationMin: number;
  planningDurationMin: number;
  actualDrivingDurationMin: number;

  baseAbsoluteErrorMin: number;
  planningAbsoluteErrorMin: number;
  /** baseAbsErr − planningAbsErr; positive = Planning better */
  planningVsBaseImprovementMin: number;

  bufferLowerBoundMin?: number;
  bufferUpperBoundMin?: number;
  withinPlanningBuffer?: boolean;

  adjustments: Array<{ type: string; durationDeltaMin: number }>;
  sampleQuality: 'VALID';
}

export function buildExecutionEtaReconciliation(input: {
  tripId: string;
  segmentId: string;
  planVersionId: string;
  baseDurationMin: number;
  planningDurationMin: number;
  actualDrivingDurationMin: number;
  uncertaintyMin?: number;
  adjustments?: Array<{ type: string; durationDeltaMin: number }>;
}): ExecutionEtaReconciliationV1 {
  const actual = Math.max(0, Math.round(input.actualDrivingDurationMin));
  const baseAbsoluteErrorMin = Math.abs(actual - input.baseDurationMin);
  const planningAbsoluteErrorMin = Math.abs(actual - input.planningDurationMin);
  const uncertainty = Math.max(0, Math.round(input.uncertaintyMin ?? 0));
  const bufferLowerBoundMin =
    uncertainty > 0 ? Math.max(0, input.planningDurationMin - uncertainty) : undefined;
  const bufferUpperBoundMin =
    uncertainty > 0 ? input.planningDurationMin + uncertainty : undefined;
  const withinPlanningBuffer =
    bufferLowerBoundMin != null && bufferUpperBoundMin != null
      ? actual >= bufferLowerBoundMin && actual <= bufferUpperBoundMin
      : undefined;

  return {
    tripId: input.tripId,
    segmentId: input.segmentId,
    planVersionId: input.planVersionId,
    baseDurationMin: input.baseDurationMin,
    planningDurationMin: input.planningDurationMin,
    actualDrivingDurationMin: actual,
    baseAbsoluteErrorMin,
    planningAbsoluteErrorMin,
    planningVsBaseImprovementMin: baseAbsoluteErrorMin - planningAbsoluteErrorMin,
    bufferLowerBoundMin,
    bufferUpperBoundMin,
    withinPlanningBuffer,
    adjustments: input.adjustments ?? [],
    sampleQuality: 'VALID',
  };
}

export function computeReconciliationMetrics(
  events: TravelEtaReconciliationEventV1[],
  opts?: { demAttachedCount?: number; demExpectedCount?: number },
): TravelEtaReconciliationMetricsV1 {
  const withActual = events.filter((e) => e.actualDurationMin != null);
  const abs = (n: number) => Math.abs(n);
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

  const baseMae = mean(withActual.map((e) => abs(e.baseErrorMin ?? 0)));
  const planningMae = mean(withActual.map((e) => abs(e.planningErrorMin ?? 0)));
  const bufferHitRate =
    withActual.length === 0
      ? null
      : withActual.filter((e) => e.bufferHit).length / withActual.length;
  const overBufferRate =
    withActual.length === 0
      ? null
      : withActual.filter((e) => e.overBuffered).length / withActual.length;
  const underBufferRate =
    withActual.length === 0
      ? null
      : withActual.filter((e) => e.underBuffered).length / withActual.length;

  const providerKnownRate =
    events.length === 0
      ? 1
      : events.filter((e) => e.providerTraceStatus === 'CONFIRMED' && e.provider !== 'UNKNOWN')
          .length / events.length;

  const demProvenanceRate =
    opts?.demExpectedCount && opts.demExpectedCount > 0
      ? (opts.demAttachedCount ?? 0) / opts.demExpectedCount
      : null;

  return {
    sampleCount: events.length,
    withActualCount: withActual.length,
    baseMaeMin: baseMae,
    planningMaeMin: planningMae,
    bufferHitRate,
    overBufferRate,
    underBufferRate,
    providerKnownRate,
    demProvenanceRate,
  };
}
