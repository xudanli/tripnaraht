/**
 * ONT-P2-02A — Quality Gate evaluator
 * ONT-P2-02B — Internal Temporal Advisory application (only after 02A PASS)
 */

import { createHash } from 'crypto';
import {
  buildHumanReviewLedger,
  collectQualityDiscrepancies,
  freezeWeatherQualityBaseline,
} from './human-review.ledger';
import { computeWeatherQualityMetrics } from './weather-quality.metrics';
import { buildWeatherQualityCorpus } from './weather-quality.corpus';
import type { WeatherQualityGateReport } from './weather-quality.types';
import { P2_QUALITY_GATE_SCHEMA_ID } from './weather-quality.types';
import { INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS } from '../internal-advisory/authorization';

export { INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS };

export interface InternalTemporalAdvisoryAuthorization {
  schemaId: 'tripnara.ontology_p2_internal_temporal_advisory_authorization@v1';
  workItem: 'ONT-P2-02B';
  title: 'Internal Temporal Advisory Pilot';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'BLOCKED_PENDING_02A';
  submittedAt?: string;
  approvedAt?: string;
  prerequisite: {
    workItem: 'ONT-P2-02A';
    qualityGateVerdict: 'PASS' | 'FAIL' | 'PENDING';
    ledgerComplete: boolean;
  };
  scope: {
    country: 'IS';
    semanticScope: 'WEATHER_DETERIORATION';
    authorityMode: 'SHADOW';
    audience: 'SELECTED_INTERNAL_TRIPS_ONLY';
    tripIds: string[];
  };
  permissions: {
    emitInternalShadowAdvisory: true;
    readTravelWorldFact: true;
    readContextRevision: true;
  };
  prohibitions: {
    mutateConstraintAssessment: true;
    mutatePlanRevision: true;
    controlReady: true;
    controlConfirm: true;
    controlExecute: true;
    callCanonicalApply: true;
    userFacingExternalAdvice: true;
    addFourthContinuousSemantic: true;
  };
  notes: string[];
}

export function buildBlocked02BAuthorization(): InternalTemporalAdvisoryAuthorization {
  return {
    schemaId: 'tripnara.ontology_p2_internal_temporal_advisory_authorization@v1',
    workItem: 'ONT-P2-02B',
    title: 'Internal Temporal Advisory Pilot',
    status: 'BLOCKED_PENDING_02A',
    prerequisite: {
      workItem: 'ONT-P2-02A',
      qualityGateVerdict: 'PENDING',
      ledgerComplete: false,
    },
    scope: {
      country: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      audience: 'SELECTED_INTERNAL_TRIPS_ONLY',
      tripIds: [...INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS],
    },
    permissions: {
      emitInternalShadowAdvisory: true,
      readTravelWorldFact: true,
      readContextRevision: true,
    },
    prohibitions: {
      mutateConstraintAssessment: true,
      mutatePlanRevision: true,
      controlReady: true,
      controlConfirm: true,
      controlExecute: true,
      callCanonicalApply: true,
      userFacingExternalAdvice: true,
      addFourthContinuousSemantic: true,
    },
    notes: ['Blocked until ONT-P2-02A Quality Gate PASS + ledgerComplete'],
  };
}

export function submit02BInternalTemporalAdvisoryApplication(input: {
  qualityGate: WeatherQualityGateReport;
  nowMs?: number;
}): InternalTemporalAdvisoryAuthorization {
  if (input.qualityGate.verdict !== 'PASS' || !input.qualityGate.ledger.ledgerComplete) {
    return {
      ...buildBlocked02BAuthorization(),
      status: 'BLOCKED_PENDING_02A',
      prerequisite: {
        workItem: 'ONT-P2-02A',
        qualityGateVerdict: input.qualityGate.verdict,
        ledgerComplete: input.qualityGate.ledger.ledgerComplete,
      },
      notes: [
        'Cannot submit 02B until 02A PASS and all discrepancies classified + replay frozen',
      ],
    };
  }

  return {
    schemaId: 'tripnara.ontology_p2_internal_temporal_advisory_authorization@v1',
    workItem: 'ONT-P2-02B',
    title: 'Internal Temporal Advisory Pilot',
    status: 'SUBMITTED',
    submittedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    prerequisite: {
      workItem: 'ONT-P2-02A',
      qualityGateVerdict: 'PASS',
      ledgerComplete: true,
    },
    scope: {
      country: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      audience: 'SELECTED_INTERNAL_TRIPS_ONLY',
      tripIds: [...INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS],
    },
    permissions: {
      emitInternalShadowAdvisory: true,
      readTravelWorldFact: true,
      readContextRevision: true,
    },
    prohibitions: {
      mutateConstraintAssessment: true,
      mutatePlanRevision: true,
      controlReady: true,
      controlConfirm: true,
      controlExecute: true,
      callCanonicalApply: true,
      userFacingExternalAdvice: true,
      addFourthContinuousSemantic: true,
    },
    notes: [
      'Internal advisory only — selected internal trips',
      'All advisories marked SHADOW',
      'Does not mutate Assessment / Plan Revision / READY / Confirm / Execute',
      'Does not call Canonical Apply',
      'Awaiting separate approval — not auto-APPROVED by 02A',
    ],
  };
}

export async function evaluateWeatherTemporalPredictionQualityGate(input?: {
  nowMs?: number;
}): Promise<WeatherQualityGateReport> {
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T18:00:00.000Z');
  const { bundles, corpusFingerprint } = await buildWeatherQualityCorpus({
    nowMs,
  });
  const metrics = computeWeatherQualityMetrics(bundles);

  // First freeze baseline from observed metrics
  const provisionalFp = `rp_q_base_${createHash('sha256')
    .update(corpusFingerprint)
    .digest('hex')
    .slice(0, 20)}`;
  const baseline = freezeWeatherQualityBaseline({
    metrics,
    replayFingerprint: provisionalFp,
    nowMs,
  });

  const discrepancies = collectQualityDiscrepancies({
    bundles,
    baseline,
    metrics,
    nowMs,
  });
  const ledger = buildHumanReviewLedger({ discrepancies, nowMs });

  // Re-freeze baseline fingerprint including ledger replay ids
  const ledgerFp = createHash('sha256')
    .update(
      JSON.stringify(
        ledger.entries.map((e) => ({
          id: e.discrepancyId,
          kind: e.kind,
          cls: e.classification,
          rp: e.replayFingerprint,
        })),
      ),
    )
    .digest('hex')
    .slice(0, 24);
  baseline.replayFingerprint = `rp_q_base_${ledgerFp}`;

  const checks: WeatherQualityGateReport['checks'] = [];

  checks.push({
    id: 'BASELINE_FROZEN',
    ok:
      baseline.schemaId === 'tripnara.ontology_p2_weather_quality_baseline@v1' &&
      baseline.authorityMode === 'SHADOW',
    detail: `onsetP95=${baseline.onsetAbsErrorMinutesP95} afnMax=${baseline.maxActionableFalseNegativeRate}`,
  });

  checks.push({
    id: 'METRICS_COVER_REQUIRED_AXES',
    ok:
      metrics.caseCount >= 5 &&
      typeof metrics.falsePositiveRate === 'number' &&
      typeof metrics.actionableFalseNegativeRate === 'number' &&
      typeof metrics.predictionReversalRate === 'number' &&
      typeof metrics.reconciliationCompletionRate === 'number' &&
      typeof metrics.unobservableRate === 'number',
    detail: `cases=${metrics.caseCount} fp=${metrics.falsePositiveCount} afn=${metrics.actionableFalseNegativeCount} rev=${metrics.predictionReversalCount} unobs=${metrics.unobservableCount}`,
  });

  checks.push({
    id: 'WITHIN_FROZEN_BASELINE',
    ok:
      metrics.actionableFalseNegativeRate <=
        baseline.maxActionableFalseNegativeRate &&
      metrics.falsePositiveRate <= baseline.maxFalsePositiveRate &&
      metrics.predictionReversalRate <= baseline.maxPredictionReversalRate &&
      metrics.reconciliationCompletionRate >=
        baseline.minReconciliationCompletionRate &&
      metrics.unobservableRate <= baseline.maxUnobservableRate &&
      (metrics.p95AbsOnsetErrorMinutes == null ||
        metrics.p95AbsOnsetErrorMinutes <= baseline.onsetAbsErrorMinutesP95),
    detail: 'observed metrics within frozen baseline thresholds',
  });

  checks.push({
    id: 'LEDGER_COMPLETE',
    ok: ledger.ledgerComplete && ledger.summary.pendingHumanReview === 0,
    detail: `entries=${ledger.summary.total} pending=${ledger.summary.pendingHumanReview} replayFrozen=${ledger.summary.replayFrozen}`,
  });

  checks.push({
    id: 'ALL_DISCREPANCIES_CLASSIFIED',
    ok: ledger.entries.every((e) => e.classification != null && e.classifiedAt),
    detail: `classified=${ledger.summary.classified}`,
  });

  checks.push({
    id: 'ALL_REPLAYS_FROZEN',
    ok: ledger.entries.every((e) => e.replayFingerprint.startsWith('rp_q_')),
    detail: 'each discrepancy has rp_q_* fingerprint',
  });

  checks.push({
    id: 'NO_BASELINE_BREACH_ROWS',
    ok: !ledger.entries.some((e) => e.kind === 'BASELINE_BREACH'),
    detail: 'aggregate rates within freeze band',
  });

  checks.push({
    id: 'SHADOW_ONLY',
    ok: bundles.every(
      (b) =>
        b.prediction == null ||
        (b.prediction.authorityMode === 'SHADOW' &&
          b.prediction.controlSeals.mayCanonicalApply === false),
    ),
    detail: 'predictions remain SHADOW non-control',
  });

  const verdict = checks.every((c) => c.ok) ? 'PASS' : 'FAIL';

  return {
    schemaId: P2_QUALITY_GATE_SCHEMA_ID,
    workItem: 'ONT-P2-02A',
    generatedAt: new Date(nowMs).toISOString(),
    verdict,
    authorityMode: 'SHADOW',
    baseline,
    metrics,
    ledger,
    checks,
    nextAllowed:
      verdict === 'PASS' && ledger.ledgerComplete
        ? 'APPLY_ONT_P2_02B_INTERNAL_TEMPORAL_ADVISORY'
        : 'NONE',
    nextForbidden: [
      'USER_FACING_TEMPORAL_ADVICE',
      'MUTATE_CANONICAL_ASSESSMENT',
      'CALL_CANONICAL_APPLY',
      'APPROVE_02B_BEFORE_02A_PASS',
    ],
  };
}
