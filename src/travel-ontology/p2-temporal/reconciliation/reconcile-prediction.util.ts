/**
 * ONT-P2-05 — Reconcile SHADOW prediction vs actual / P1 replay
 */

import { createHash } from 'crypto';
import {
  OUTCOME_RECONCILIATION_SCHEMA_ID,
  type OutcomeReconciliation,
  type PredictionRecord,
  type ReconciliationStatus,
  type TemporalRiskLevel,
} from '../contracts';
import type {
  WeatherActualPoint,
  WeatherOfflineAccuracyCase,
} from '../weather-shadow/weather-forecast-series.types';

const LEVEL_RANK: Record<TemporalRiskLevel, number> = {
  NONE: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

function minutesBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return undefined;
  return Math.round((da - db) / 60_000);
}

export function findActualOnset(
  series: WeatherActualPoint[],
): { at: string; level: TemporalRiskLevel } | null {
  const sorted = [...series].sort((a, b) => a.at.localeCompare(b.at));
  for (const p of sorted) {
    if (LEVEL_RANK[p.actualLevel] >= LEVEL_RANK.ORANGE) {
      return { at: p.at, level: p.actualLevel };
    }
  }
  return null;
}

export function findActualPeak(series: WeatherActualPoint[]): TemporalRiskLevel {
  let peak: TemporalRiskLevel = 'NONE';
  for (const p of series) {
    if (LEVEL_RANK[p.actualLevel] > LEVEL_RANK[peak]) peak = p.actualLevel;
  }
  return peak;
}

export function findActualDeterioration(
  series: WeatherActualPoint[],
  onsetAt: string,
  onsetLevel: TemporalRiskLevel,
): string | undefined {
  const sorted = [...series]
    .filter((p) => p.at > onsetAt)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const p of sorted) {
    if (LEVEL_RANK[p.actualLevel] > LEVEL_RANK[onsetLevel]) return p.at;
  }
  return undefined;
}

function classifyStatus(input: {
  predictedAffect: boolean;
  actualAffect: boolean;
  onsetErrorMinutes?: number;
}): ReconciliationStatus {
  if (!input.predictedAffect && !input.actualAffect) return 'CONFIRMED';
  if (input.predictedAffect && !input.actualAffect) return 'DISCONFIRMED';
  if (!input.predictedAffect && input.actualAffect) return 'DISCONFIRMED';
  const err = Math.abs(input.onsetErrorMinutes ?? 9999);
  if (err <= 60) return 'CONFIRMED';
  if (err <= 180) return 'PARTIALLY_CONFIRMED';
  return 'DISCONFIRMED';
}

export function reconcileWeatherPrediction(input: {
  prediction: PredictionRecord;
  case: WeatherOfflineAccuracyCase;
  nowMs?: number;
}): OutcomeReconciliation {
  const actualOnset =
    input.case.p1ReplayAnchors?.onsetAt != null
      ? {
          at: input.case.p1ReplayAnchors.onsetAt,
          level: (input.case.p1ReplayAnchors.peakLevel ??
            findActualOnset(input.case.actualSeries)?.level ??
            'ORANGE') as TemporalRiskLevel,
        }
      : findActualOnset(input.case.actualSeries);

  const actualPeak =
    input.case.p1ReplayAnchors?.peakLevel ??
    findActualPeak(input.case.actualSeries);

  const actualDeterioration =
    input.case.p1ReplayAnchors?.deterioratedAt ??
    (actualOnset
      ? findActualDeterioration(
          input.case.actualSeries,
          actualOnset.at,
          actualOnset.level,
        )
      : undefined);

  const predictedAffect =
    LEVEL_RANK[input.prediction.temporalImpact.predictedPeakLevel] >=
    LEVEL_RANK.ORANGE;
  const actualAffect = LEVEL_RANK[actualPeak] >= LEVEL_RANK.ORANGE;

  const noActualObserved =
    input.case.actualSeries.length === 0 && !input.case.p1ReplayAnchors;

  const onsetErrorMinutes = noActualObserved
    ? undefined
    : minutesBetween(
        input.prediction.temporalImpact.predictedOnset,
        actualOnset?.at,
      );
  const deteriorationErrorMinutes = noActualObserved
    ? undefined
    : minutesBetween(
        input.prediction.temporalImpact.predictedDeterioration,
        actualDeterioration,
      );
  const deadlineLeadMinutes = noActualObserved
    ? undefined
    : minutesBetween(
        actualOnset?.at,
        input.prediction.interventionDeadline.interventionDeadline,
      );

  const falsePositive =
    !noActualObserved && predictedAffect && !actualAffect;
  const falseNegative =
    !noActualObserved && !predictedAffect && actualAffect;

  const status = noActualObserved
    ? 'UNOBSERVABLE'
    : actualOnset == null && actualPeak === 'NONE' && !predictedAffect
      ? 'CONFIRMED'
      : actualOnset == null &&
          predictedAffect &&
          LEVEL_RANK[actualPeak] < LEVEL_RANK.ORANGE
        ? 'DISCONFIRMED'
        : actualOnset == null && predictedAffect
          ? 'UNOBSERVABLE'
          : classifyStatus({
              predictedAffect,
              actualAffect,
              onsetErrorMinutes,
            });

  const reconciliationId = `rec_${createHash('sha256')
    .update(`${input.prediction.predictionId}|${status}`)
    .digest('hex')
    .slice(0, 16)}`;

  return {
    schemaId: OUTCOME_RECONCILIATION_SCHEMA_ID,
    reconciliationId,
    predictionId: input.prediction.predictionId,
    predictedOutcome: {
      onsetAt: input.prediction.temporalImpact.predictedOnset,
      deteriorationAt: input.prediction.temporalImpact.predictedDeterioration,
      interventionDeadline:
        input.prediction.interventionDeadline.interventionDeadline,
      peakLevel: input.prediction.temporalImpact.predictedPeakLevel,
      wouldAffectPlan: predictedAffect,
    },
    actualOutcome: {
      onsetAt: actualOnset?.at,
      deteriorationAt: actualDeterioration,
      peakLevel: actualPeak,
      planAffected: actualAffect,
      source: noActualObserved
        ? 'UNOBSERVED'
        : input.case.p1ReplayAnchors
          ? 'P1_REPLAY'
          : 'HISTORICAL_ACTUAL',
    },
    status,
    errorMetrics: {
      onsetErrorMinutes,
      deteriorationErrorMinutes,
      deadlineLeadMinutes,
      falsePositive,
      falseNegative,
    },
    reconciledAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    evidenceRefs: [
      ...input.prediction.evidenceRefs,
      ...input.case.actualSeries.map(
        (p) => `act:${p.at}:${p.actualLevel}`,
      ),
    ],
    authorityMode: 'SHADOW',
  };
}
