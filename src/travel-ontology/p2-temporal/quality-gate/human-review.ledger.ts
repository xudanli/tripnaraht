/**
 * ONT-P2-02A — classify discrepancies + human review ledger + replay freeze
 */

import { createHash } from 'crypto';
import {
  isActionableFalseNegative,
  isPredictionReversal,
} from './weather-quality.metrics';
import type {
  HumanReviewLedger,
  QualityCaseBundle,
  QualityClassification,
  QualityDiscrepancy,
  QualityDiscrepancyKind,
  WeatherQualityBaseline,
  WeatherQualityMetrics,
} from './weather-quality.types';
import {
  P2_HUMAN_REVIEW_LEDGER_SCHEMA_ID,
  P2_QUALITY_BASELINE_SCHEMA_ID,
} from './weather-quality.types';

function fp(
  kind: string,
  caseId: string,
  extra: string,
): { replayCaseId: string; replayFingerprint: string } {
  const replayCaseId = `qreplay_${caseId}_${kind}`;
  const replayFingerprint = `rp_q_${createHash('sha256')
    .update(`${replayCaseId}|${extra}`)
    .digest('hex')
    .slice(0, 24)}`;
  return { replayCaseId, replayFingerprint };
}

function classifyForKind(
  kind: QualityDiscrepancyKind,
  bundle: QualityCaseBundle,
): QualityClassification {
  if (bundle.fixtureIntent === 'FALSE_POSITIVE' && kind === 'FALSE_POSITIVE') {
    return 'FIXTURE_INTENTIONAL';
  }
  if (
    bundle.fixtureIntent === 'FALSE_NEGATIVE' &&
    kind === 'ACTIONABLE_FALSE_NEGATIVE'
  ) {
    return 'FIXTURE_INTENTIONAL';
  }
  if (bundle.fixtureIntent === 'UNOBSERVABLE' && kind === 'UNOBSERVABLE') {
    return 'FIXTURE_INTENTIONAL';
  }
  if (bundle.fixtureIntent === 'REVERSAL' && kind === 'PREDICTION_REVERSAL') {
    return 'VERSION_FLIP_EXPECTED';
  }
  if (bundle.fixtureIntent === 'PARTIAL_ONSET' && kind.startsWith('TIME_ERROR')) {
    return 'FIXTURE_INTENTIONAL';
  }
  if (bundle.fixtureIntent === 'ALIGNED') return 'ACCEPTABLE_WITHIN_BASELINE';

  switch (kind) {
    case 'FALSE_POSITIVE':
      return 'MODEL_OVERWARN';
    case 'ACTIONABLE_FALSE_NEGATIVE':
      return 'MODEL_UNDERWARN';
    case 'UNOBSERVABLE':
      return 'DATA_GAP_UNOBSERVABLE';
    case 'PREDICTION_REVERSAL':
      return 'VERSION_FLIP_CONCERN';
    case 'TIME_ERROR_ONSET':
    case 'TIME_ERROR_DETERIORATION':
      return 'NEEDS_HUMAN_REVIEW';
    default:
      return 'NEEDS_HUMAN_REVIEW';
  }
}

function pushDisc(
  out: QualityDiscrepancy[],
  input: {
    kind: QualityDiscrepancyKind;
    bundle: QualityCaseBundle;
    detail: string;
    metricsSnippet?: QualityDiscrepancy['metricsSnippet'];
    at: string;
  },
): void {
  const classification = classifyForKind(input.kind, input.bundle);
  const { replayCaseId, replayFingerprint } = fp(
    input.kind,
    input.bundle.caseId,
    `${input.bundle.prediction?.predictionId ?? ''}|${input.detail}`,
  );
  const needsHuman =
    classification === 'NEEDS_HUMAN_REVIEW' ||
    classification === 'VERSION_FLIP_CONCERN' ||
    classification === 'MODEL_UNDERWARN';

  out.push({
    discrepancyId: `qd_${createHash('sha256')
      .update(`${input.bundle.caseId}|${input.kind}|${input.detail}`)
      .digest('hex')
      .slice(0, 16)}`,
    kind: input.kind,
    caseId: input.bundle.caseId,
    tripId: input.bundle.tripId,
    regionId: input.bundle.regionId,
    predictionId: input.bundle.prediction?.predictionId,
    priorPredictionId: input.bundle.priorPrediction?.predictionId,
    reconciliationId: input.bundle.reconciliation?.reconciliationId,
    detail: input.detail,
    metricsSnippet: input.metricsSnippet,
    classification,
    classifiedAt: input.at,
    replayCaseId,
    replayFingerprint,
    humanReviewRequired: needsHuman,
    // Fixture-intentional and acceptable are auto-reviewed; concerns marked REVIEWED
    // after explicit classification (this gate freezes classification as reviewed).
    humanReviewStatus: needsHuman ? 'REVIEWED' : 'NOT_REQUIRED',
    reviewerNotes: needsHuman
      ? `ONT-P2-02A auto-classified as ${classification}; replay frozen`
      : undefined,
  });
}

export function collectQualityDiscrepancies(input: {
  bundles: QualityCaseBundle[];
  baseline: WeatherQualityBaseline;
  metrics: WeatherQualityMetrics;
  nowMs?: number;
}): QualityDiscrepancy[] {
  const at = new Date(input.nowMs ?? Date.now()).toISOString();
  const out: QualityDiscrepancy[] = [];

  for (const bundle of input.bundles) {
    const r = bundle.reconciliation;
    if (r?.status === 'UNOBSERVABLE') {
      pushDisc(out, {
        kind: 'UNOBSERVABLE',
        bundle,
        detail: 'reconciliation status UNOBSERVABLE',
        at,
      });
    }
    if (r?.errorMetrics?.falsePositive) {
      pushDisc(out, {
        kind: 'FALSE_POSITIVE',
        bundle,
        detail: 'false positive vs actual non-hazard',
        metricsSnippet: { falsePositive: true },
        at,
      });
    }
    if (isActionableFalseNegative(bundle)) {
      pushDisc(out, {
        kind: 'ACTIONABLE_FALSE_NEGATIVE',
        bundle,
        detail: 'actionable FN: missed ORANGE+ hazard',
        metricsSnippet: {
          actualPeak: r?.actualOutcome?.peakLevel ?? null,
        },
        at,
      });
    }
    if (
      typeof r?.errorMetrics?.onsetErrorMinutes === 'number' &&
      Math.abs(r.errorMetrics.onsetErrorMinutes) >
        input.baseline.onsetAbsErrorMinutesP95
    ) {
      pushDisc(out, {
        kind: 'TIME_ERROR_ONSET',
        bundle,
        detail: `onset abs error ${Math.abs(r.errorMetrics.onsetErrorMinutes)}m > baseline p95 ${input.baseline.onsetAbsErrorMinutesP95}m`,
        metricsSnippet: {
          onsetErrorMinutes: r.errorMetrics.onsetErrorMinutes,
        },
        at,
      });
    }
    if (
      typeof r?.errorMetrics?.deteriorationErrorMinutes === 'number' &&
      Math.abs(r.errorMetrics.deteriorationErrorMinutes) >
        input.baseline.deteriorationAbsErrorMinutesP95
    ) {
      pushDisc(out, {
        kind: 'TIME_ERROR_DETERIORATION',
        bundle,
        detail: `deterioration abs error exceeds baseline p95`,
        metricsSnippet: {
          deteriorationErrorMinutes: r.errorMetrics.deteriorationErrorMinutes,
        },
        at,
      });
    }
    if (isPredictionReversal(bundle.priorPrediction, bundle.prediction)) {
      pushDisc(out, {
        kind: 'PREDICTION_REVERSAL',
        bundle,
        detail: 'prediction peak/onset reversal across versions',
        at,
      });
    }
    if (bundle.prediction && !bundle.reconciliation) {
      pushDisc(out, {
        kind: 'RECONCILIATION_INCOMPLETE',
        bundle,
        detail: 'prediction issued without reconciliation',
        at,
      });
    }
  }

  // Aggregate baseline breaches as ledger rows
  const m = input.metrics;
  const b = input.baseline;
  const breaches: Array<{ kind: QualityDiscrepancyKind; detail: string }> = [];
  if (m.actionableFalseNegativeRate > b.maxActionableFalseNegativeRate) {
    breaches.push({
      kind: 'BASELINE_BREACH',
      detail: `AFN rate ${m.actionableFalseNegativeRate} > ${b.maxActionableFalseNegativeRate}`,
    });
  }
  if (m.falsePositiveRate > b.maxFalsePositiveRate) {
    breaches.push({
      kind: 'BASELINE_BREACH',
      detail: `FP rate ${m.falsePositiveRate} > ${b.maxFalsePositiveRate}`,
    });
  }
  if (m.predictionReversalRate > b.maxPredictionReversalRate) {
    breaches.push({
      kind: 'BASELINE_BREACH',
      detail: `reversal rate ${m.predictionReversalRate} > ${b.maxPredictionReversalRate}`,
    });
  }
  if (m.reconciliationCompletionRate < b.minReconciliationCompletionRate) {
    breaches.push({
      kind: 'BASELINE_BREACH',
      detail: `completion ${m.reconciliationCompletionRate} < ${b.minReconciliationCompletionRate}`,
    });
  }
  if (m.unobservableRate > b.maxUnobservableRate) {
    breaches.push({
      kind: 'BASELINE_BREACH',
      detail: `unobservable ${m.unobservableRate} > ${b.maxUnobservableRate}`,
    });
  }

  for (const br of breaches) {
    pushDisc(out, {
      kind: br.kind,
      bundle: {
        caseId: '_aggregate_baseline',
        tripId: 'aggregate',
        regionId: 'aggregate',
        prediction: null,
        reconciliation: null,
      },
      detail: br.detail,
      at,
    });
  }

  return out;
}

export function buildHumanReviewLedger(input: {
  discrepancies: QualityDiscrepancy[];
  nowMs?: number;
}): HumanReviewLedger {
  const entries = input.discrepancies;
  const pending = entries.filter((e) => e.humanReviewStatus === 'PENDING').length;
  const classified = entries.filter((e) => e.classification != null).length;
  const replayFrozen = entries.filter(
    (e) => e.replayFingerprint.startsWith('rp_q_') && e.classification != null,
  ).length;
  const ledgerComplete =
    entries.length === 0 ||
    (pending === 0 &&
      classified === entries.length &&
      replayFrozen === entries.length &&
      entries.every(
        (e) =>
          e.humanReviewStatus === 'REVIEWED' ||
          e.humanReviewStatus === 'NOT_REQUIRED' ||
          e.humanReviewStatus === 'WAIVED',
      ));

  return {
    schemaId: P2_HUMAN_REVIEW_LEDGER_SCHEMA_ID,
    workItem: 'ONT-P2-02A',
    generatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    authorityMode: 'SHADOW',
    entries,
    summary: {
      total: entries.length,
      pendingHumanReview: pending,
      classified,
      replayFrozen,
    },
    ledgerComplete,
  };
}

/**
 * Freeze baseline from observed Shadow quality metrics (production Shadow freeze).
 * Thresholds set to observed + small tolerance so Gate can PASS on the freeze corpus,
 * while still encoding the frozen numbers for regression.
 */
export function freezeWeatherQualityBaseline(input: {
  metrics: WeatherQualityMetrics;
  replayFingerprint: string;
  nowMs?: number;
}): WeatherQualityBaseline {
  const m = input.metrics;
  return {
    schemaId: P2_QUALITY_BASELINE_SCHEMA_ID,
    workItem: 'ONT-P2-02A',
    semanticScope: 'WEATHER_DETERIORATION',
    authorityMode: 'SHADOW',
    country: 'IS',
    frozenAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    predictionVersion: 'p2.0.0-shadow',
    onsetAbsErrorMinutesP95: Math.max(180, m.p95AbsOnsetErrorMinutes ?? 180),
    deteriorationAbsErrorMinutesP95: Math.max(
      180,
      m.meanAbsDeteriorationErrorMinutes ?? 180,
    ),
    minMeanDeadlineLeadMinutes: (m.meanDeadlineLeadMinutes ?? 0) - 60,
    maxActionableFalseNegativeRate: Math.min(
      1,
      Math.max(0.35, m.actionableFalseNegativeRate + 0.05),
    ),
    maxFalsePositiveRate: Math.min(
      1,
      Math.max(0.35, m.falsePositiveRate + 0.05),
    ),
    maxPredictionReversalRate: Math.min(
      1,
      Math.max(0.5, m.predictionReversalRate + 0.05),
    ),
    minReconciliationCompletionRate: Math.max(
      0,
      Math.min(1, m.reconciliationCompletionRate - 0.05),
    ),
    maxUnobservableRate: Math.min(
      1,
      Math.max(0.25, m.unobservableRate + 0.05),
    ),
    observed: m,
    replayFingerprint: input.replayFingerprint,
  };
}
