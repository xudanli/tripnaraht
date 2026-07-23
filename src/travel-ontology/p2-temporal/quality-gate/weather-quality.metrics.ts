/**
 * ONT-P2-02A — quality metrics from case bundles
 */

import type { ReconciliationStatus } from '../contracts';
import type {
  QualityCaseBundle,
  WeatherQualityMetrics,
} from './weather-quality.types';

const LEVEL_RANK: Record<string, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

function emptyStatusCounts(): Record<ReconciliationStatus, number> {
  return {
    PENDING: 0,
    CONFIRMED: 0,
    PARTIALLY_CONFIRMED: 0,
    DISCONFIRMED: 0,
    UNOBSERVABLE: 0,
  };
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** Actionable FN: missed ORANGE+ hazard (would have needed intervention) */
export function isActionableFalseNegative(bundle: QualityCaseBundle): boolean {
  const r = bundle.reconciliation;
  if (!r?.errorMetrics?.falseNegative) return false;
  const peak = r.actualOutcome?.peakLevel ?? 'NONE';
  return (LEVEL_RANK[peak] ?? 0) >= LEVEL_RANK.ORANGE;
}

/** Prediction reversal: peak drops ≥2 ranks or hazard→calm across versions */
export function isPredictionReversal(
  prior: QualityCaseBundle['priorPrediction'],
  current: QualityCaseBundle['prediction'],
): boolean {
  if (!prior || !current) return false;
  const a = LEVEL_RANK[prior.temporalImpact.predictedPeakLevel] ?? 0;
  const b = LEVEL_RANK[current.temporalImpact.predictedPeakLevel] ?? 0;
  if (a >= LEVEL_RANK.ORANGE && b <= LEVEL_RANK.YELLOW) return true;
  if (a - b >= 2) return true;
  const onsetA = Date.parse(prior.temporalImpact.predictedOnset);
  const onsetB = Date.parse(current.temporalImpact.predictedOnset);
  if (Number.isFinite(onsetA) && Number.isFinite(onsetB)) {
    // Onset slips later by > 3h while peak still hazardous → temporal flip concern
    if (b >= LEVEL_RANK.ORANGE && onsetB - onsetA > 3 * 3600_000) return true;
  }
  return false;
}

export function computeWeatherQualityMetrics(
  bundles: QualityCaseBundle[],
): WeatherQualityMetrics {
  const withPred = bundles.filter((b) => b.prediction != null);
  const withRecon = bundles.filter((b) => b.reconciliation != null);
  const statusCounts = emptyStatusCounts();
  for (const b of withRecon) {
    statusCounts[b.reconciliation!.status] += 1;
  }

  const unobservableCount = withRecon.filter(
    (b) => b.reconciliation!.status === 'UNOBSERVABLE',
  ).length;

  const fp = withRecon.filter((b) => b.reconciliation!.errorMetrics?.falsePositive)
    .length;
  const afn = withRecon.filter((b) => isActionableFalseNegative(b)).length;

  const versionPairs = bundles.filter((b) => b.priorPrediction && b.prediction);
  const reversals = versionPairs.filter((b) =>
    isPredictionReversal(b.priorPrediction, b.prediction),
  ).length;

  const onsetAbs = withRecon
    .map((b) => b.reconciliation!.errorMetrics?.onsetErrorMinutes)
    .filter((n): n is number => typeof n === 'number')
    .map((n) => Math.abs(n));
  const detAbs = withRecon
    .map((b) => b.reconciliation!.errorMetrics?.deteriorationErrorMinutes)
    .filter((n): n is number => typeof n === 'number')
    .map((n) => Math.abs(n));
  const leads = withRecon
    .map((b) => b.reconciliation!.errorMetrics?.deadlineLeadMinutes)
    .filter((n): n is number => typeof n === 'number');

  const attempted = withPred.length;
  const completed = withRecon.filter(
    (b) =>
      b.reconciliation!.status !== 'PENDING' &&
      b.reconciliation!.status !== 'UNOBSERVABLE',
  ).length;

  const denom = Math.max(1, withRecon.length);
  const predDenom = Math.max(1, withPred.length);
  const pairDenom = Math.max(1, versionPairs.length);

  return {
    caseCount: bundles.length,
    predictionsIssued: withPred.length,
    reconciliationsAttempted: attempted,
    reconciliationsCompleted: completed,
    reconciliationCompletionRate: completed / predDenom,
    unobservableCount,
    unobservableRate: unobservableCount / denom,
    falsePositiveCount: fp,
    falsePositiveRate: fp / denom,
    actionableFalseNegativeCount: afn,
    actionableFalseNegativeRate: afn / denom,
    predictionReversalCount: reversals,
    predictionReversalRate: reversals / pairDenom,
    meanAbsOnsetErrorMinutes:
      onsetAbs.length === 0
        ? null
        : Math.round(onsetAbs.reduce((a, b) => a + b, 0) / onsetAbs.length),
    p95AbsOnsetErrorMinutes: percentile95(onsetAbs),
    meanAbsDeteriorationErrorMinutes:
      detAbs.length === 0
        ? null
        : Math.round(detAbs.reduce((a, b) => a + b, 0) / detAbs.length),
    meanDeadlineLeadMinutes:
      leads.length === 0
        ? null
        : Math.round(leads.reduce((a, b) => a + b, 0) / leads.length),
    statusCounts,
  };
}
