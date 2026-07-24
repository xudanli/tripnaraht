/**
 * ETA-L2-CANARY-01 — outcome metrics, rule verdicts, iceland_default suggested thresholds.
 *
 * Thresholds are FIRST DRAFT for review — not empirically validated facts.
 */

import type { TravelEtaAdjustmentReason } from '../contracts/travel-eta.contract';
import type { TravelEtaSampleQuality } from '../contracts/travel-eta-actual.contract';
import { isEligibleForMaeCalibration } from '../contracts/travel-eta-actual.contract';
import type { TravelEtaReconciliationEventV1 } from '../contracts/travel-eta-reconciliation.contract';
import { computeReconciliationMetrics } from '../contracts/travel-eta-reconciliation.contract';

export type TravelEtaL2RolloutStage =
  | 'shadow'
  | 'selected_trips'
  | 'iceland_canary_5%'
  | 'iceland_canary_20%'
  | 'iceland_default';

export type TravelEtaAdjustmentRuleVerdict =
  | 'KEEP'
  | 'TUNE'
  | 'DISABLE'
  | 'INSUFFICIENT_EVIDENCE';

export type TravelEtaDefaultGateDecision = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';

/**
 * First-round Gate Review before iceland_canary_5% (directional, not full stats).
 * HARD safety + data completeness must pass; effect checks are directional only.
 */
export const ICELAND_CANARY_5_FIRST_ROUND_THRESHOLDS = {
  validSegmentSampleMin: 20,
  validSegmentSampleTarget: 30,
  etaSnapshotCompleteRateMin: 0.98,
  providerKnownRateMin: 0.98,
  requiredTerrainCoverageMin: 1.0,
  pavedAndFRoadCoverageRequired: true,
  closedScheduledMax: 0,
  twoWdOnForced4WdMax: 0,
  requiredTerrainSkippedMax: 0,
  unknownProviderAuthoritativeMax: 0,
  killSwitchRollbackFailuresMax: 0,
} as const;

/** Suggested first-freeze thresholds for iceland_default — tune with real VALID samples. */
export const ICELAND_DEFAULT_SUGGESTED_THRESHOLDS = {
  providerKnownRateMin: 0.98,
  requiredTerrainCoverageMin: 1.0,
  icelandDem20mHitRateMin: 0.95,
  provenanceCompleteRateMin: 0.98,
  validSegmentSampleMin: 30,
  planningMaeImprovementMin: 0.15,
  severeUnderestimateRateMax: 0.1,
  bufferHitRateMin: 0.8,
  pavedFalseBufferRateMax: 0.05,
  highConfidenceOverBufferRateMax: 0.2,
  severeUnderestimateMinMin: 15,
} as const;

export interface TravelEtaCanarySafetyCounters {
  closedScheduledCount: number;
  twoWdOnForced4WdCount: number;
  requiredTerrainSkippedCount: number;
  unknownProviderAuthoritativeCount: number;
  killSwitchRollbackFailures: number;
}

export interface TravelEtaCanaryDashboardSnapshotV1 {
  schemaId: 'tripnara.travel_eta_l2_canary_dashboard@v1';
  stage: TravelEtaL2RolloutStage;
  generatedAt: string;

  authoritativeTripCount: number;
  authoritativeSegmentCount: number;
  validActualSampleCount: number;
  partialActualSampleCount: number;
  invalidActualSampleCount: number;

  providerKnownRate: number | null;
  dem20mHitRate: number | null;
  requiredTerrainCoverage: number | null;

  baseMaeMin: number | null;
  planningMaeMin: number | null;
  /** (baseMae − planningMae) / baseMae when both defined */
  maeImprovementRatio: number | null;
  underestimateRate: number | null;
  severeUnderestimateRate: number | null;
  overBufferRate: number | null;
  bufferHitRate: number | null;

  safety: TravelEtaCanarySafetyCounters;
  killSwitchActive: boolean;
}

export interface TravelEtaDefaultGateReviewV1 {
  schemaId: 'tripnara.travel_eta_l2_default_gate_review@v1';
  decision: TravelEtaDefaultGateDecision;
  generatedAt: string;
  /** Suggested thresholds used — not claimed as validated */
  thresholdsRef: 'ICELAND_DEFAULT_SUGGESTED_THRESHOLDS';
  checks: Array<{
    id: string;
    pass: boolean;
    actual?: number | string | boolean | null;
    threshold?: number | string;
    layer: 'integrity' | 'effect' | 'safety';
  }>;
  blockedReasons: string[];
  notes: string;
}

export function filterEventsForMae(
  events: Array<TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }>,
): TravelEtaReconciliationEventV1[] {
  return events.filter(
    (e) =>
      e.actualDurationMin != null &&
      isEligibleForMaeCalibration(e.sampleQuality ?? 'VALID'),
  );
}

export function computeMaeImprovementRatio(
  baseMae: number | null,
  planningMae: number | null,
): number | null {
  if (baseMae == null || planningMae == null || baseMae <= 0) return null;
  return (baseMae - planningMae) / baseMae;
}

export function computeSevereUnderestimateRate(
  events: TravelEtaReconciliationEventV1[],
  severeMin = ICELAND_DEFAULT_SUGGESTED_THRESHOLDS.severeUnderestimateMinMin,
): number | null {
  const withActual = events.filter((e) => e.actualDurationMin != null);
  if (withActual.length === 0) return null;
  const severe = withActual.filter(
    (e) => (e.actualDurationMin as number) - e.planningDurationMin > severeMin,
  );
  return severe.length / withActual.length;
}

/**
 * Draft default-gate review from canary snapshot.
 * Safety zeros are hard fails → NO_GO.
 */
export function evaluateIcelandDefaultGateReview(input: {
  snapshot: TravelEtaCanaryDashboardSnapshotV1;
}): TravelEtaDefaultGateReviewV1 {
  const t = ICELAND_DEFAULT_SUGGESTED_THRESHOLDS;
  const s = input.snapshot;
  const safety = s.safety;

  const checks: TravelEtaDefaultGateReviewV1['checks'] = [
    {
      id: 'provider_known_rate',
      pass: (s.providerKnownRate ?? 0) >= t.providerKnownRateMin,
      actual: s.providerKnownRate,
      threshold: t.providerKnownRateMin,
      layer: 'integrity',
    },
    {
      id: 'required_terrain_coverage',
      pass: (s.requiredTerrainCoverage ?? 0) >= t.requiredTerrainCoverageMin,
      actual: s.requiredTerrainCoverage,
      threshold: t.requiredTerrainCoverageMin,
      layer: 'integrity',
    },
    {
      id: 'dem_20m_hit_rate',
      pass: (s.dem20mHitRate ?? 0) >= t.icelandDem20mHitRateMin,
      actual: s.dem20mHitRate,
      threshold: t.icelandDem20mHitRateMin,
      layer: 'integrity',
    },
    {
      id: 'valid_sample_count',
      pass: s.validActualSampleCount >= t.validSegmentSampleMin,
      actual: s.validActualSampleCount,
      threshold: t.validSegmentSampleMin,
      layer: 'integrity',
    },
    {
      id: 'mae_improvement',
      pass: (s.maeImprovementRatio ?? -1) >= t.planningMaeImprovementMin,
      actual: s.maeImprovementRatio,
      threshold: t.planningMaeImprovementMin,
      layer: 'effect',
    },
    {
      id: 'severe_underestimate',
      pass: (s.severeUnderestimateRate ?? 1) <= t.severeUnderestimateRateMax,
      actual: s.severeUnderestimateRate,
      threshold: t.severeUnderestimateRateMax,
      layer: 'effect',
    },
    {
      id: 'buffer_hit_rate',
      pass: (s.bufferHitRate ?? 0) >= t.bufferHitRateMin,
      actual: s.bufferHitRate,
      threshold: t.bufferHitRateMin,
      layer: 'effect',
    },
    {
      id: 'safety_closed',
      pass: safety.closedScheduledCount === 0,
      actual: safety.closedScheduledCount,
      threshold: 0,
      layer: 'safety',
    },
    {
      id: 'safety_2wd',
      pass: safety.twoWdOnForced4WdCount === 0,
      actual: safety.twoWdOnForced4WdCount,
      threshold: 0,
      layer: 'safety',
    },
    {
      id: 'safety_terrain_required',
      pass: safety.requiredTerrainSkippedCount === 0,
      actual: safety.requiredTerrainSkippedCount,
      threshold: 0,
      layer: 'safety',
    },
    {
      id: 'safety_unknown_provider_auth',
      pass: safety.unknownProviderAuthoritativeCount === 0,
      actual: safety.unknownProviderAuthoritativeCount,
      threshold: 0,
      layer: 'safety',
    },
    {
      id: 'safety_kill_switch',
      pass: safety.killSwitchRollbackFailures === 0,
      actual: safety.killSwitchRollbackFailures,
      threshold: 0,
      layer: 'safety',
    },
  ];

  const safetyFail = checks.filter((c) => c.layer === 'safety' && !c.pass);
  const integrityFail = checks.filter((c) => c.layer === 'integrity' && !c.pass);
  const effectFail = checks.filter((c) => c.layer === 'effect' && !c.pass);
  const blockedReasons = checks.filter((c) => !c.pass).map((c) => c.id);

  let decision: TravelEtaDefaultGateDecision = 'GO';
  if (safetyFail.length > 0) decision = 'NO_GO';
  else if (integrityFail.length > 0 || effectFail.length > 0) decision = 'CONDITIONAL_GO';

  return {
    schemaId: 'tripnara.travel_eta_l2_default_gate_review@v1',
    decision,
    generatedAt: new Date().toISOString(),
    thresholdsRef: 'ICELAND_DEFAULT_SUGGESTED_THRESHOLDS',
    checks,
    blockedReasons,
    notes:
      'Thresholds are suggested first-freeze values for canary review — not empirically validated.',
  };
}

export function buildCanaryMetricsFromEvents(
  events: Array<TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }>,
): Pick<
  TravelEtaCanaryDashboardSnapshotV1,
  | 'validActualSampleCount'
  | 'partialActualSampleCount'
  | 'invalidActualSampleCount'
  | 'baseMaeMin'
  | 'planningMaeMin'
  | 'maeImprovementRatio'
  | 'bufferHitRate'
  | 'overBufferRate'
  | 'underestimateRate'
  | 'severeUnderestimateRate'
  | 'providerKnownRate'
> {
  const valid = events.filter((e) => (e.sampleQuality ?? 'VALID') === 'VALID' && e.actualDurationMin != null);
  const partial = events.filter((e) => e.sampleQuality === 'PARTIAL');
  const invalid = events.filter((e) => e.sampleQuality === 'INVALID');
  const maeEvents = filterEventsForMae(events);
  const m = computeReconciliationMetrics(maeEvents);
  const underestimateRate =
    maeEvents.length === 0
      ? null
      : maeEvents.filter((e) => (e.actualDurationMin as number) > e.planningDurationMin).length /
        maeEvents.length;

  return {
    validActualSampleCount: valid.length,
    partialActualSampleCount: partial.length,
    invalidActualSampleCount: invalid.length,
    baseMaeMin: m.baseMaeMin,
    planningMaeMin: m.planningMaeMin,
    maeImprovementRatio: computeMaeImprovementRatio(m.baseMaeMin, m.planningMaeMin),
    bufferHitRate: m.bufferHitRate,
    overBufferRate: m.overBufferRate,
    underestimateRate,
    severeUnderestimateRate: computeSevereUnderestimateRate(maeEvents),
    providerKnownRate: m.providerKnownRate,
  };
}

export type AdjustmentRuleVerdictRow = {
  reason: TravelEtaAdjustmentReason;
  verdict: TravelEtaAdjustmentRuleVerdict;
  evidenceNote?: string;
};
