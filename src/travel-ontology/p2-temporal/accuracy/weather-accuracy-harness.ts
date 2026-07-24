/**
 * ONT-P2-06 — Offline Accuracy Harness (Weather Deterioration reuse)
 */

import { createHash } from 'crypto';
import type { OutcomeReconciliation, PredictionRecord } from '../contracts';
import { reconcileWeatherPrediction } from '../reconciliation/reconcile-prediction.util';
import { buildShadowWeatherPredictionRecord } from '../weather-shadow/build-shadow-prediction-record';
import type { WeatherOfflineAccuracyCase } from '../weather-shadow/weather-forecast-series.types';
import { WEATHER_OFFLINE_ACCURACY_FIXTURES } from './weather-offline-fixtures';

export const P2_ACCURACY_HARNESS_SCHEMA_ID =
  'tripnara.ontology_p2_weather_accuracy_harness@v1' as const;

export interface AccuracyCaseResult {
  caseId: string;
  prediction: PredictionRecord | null;
  reconciliation: OutcomeReconciliation | null;
  notes: string[];
}

export interface AccuracyHarnessSummary {
  caseCount: number;
  predictionsIssued: number;
  confirmed: number;
  partiallyConfirmed: number;
  disconfirmed: number;
  unobservable: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  meanAbsOnsetErrorMinutes: number | null;
  meanDeadlineLeadMinutes: number | null;
}

export interface AccuracyHarnessReport {
  schemaId: typeof P2_ACCURACY_HARNESS_SCHEMA_ID;
  generatedAt: string;
  semanticScope: 'WEATHER_DETERIORATION';
  authorityMode: 'SHADOW';
  controlSeals: PredictionRecord['controlSeals'];
  summary: AccuracyHarnessSummary;
  cases: AccuracyCaseResult[];
  replayFingerprint: string;
  gate0Assertions: {
    mutatesCanonicalAssessment: false;
    controlsReady: false;
    controlsConfirm: false;
    controlsExecute: false;
    mayCanonicalApply: false;
    fourthSemanticAdded: false;
  };
}

function summarize(cases: AccuracyCaseResult[]): AccuracyHarnessSummary {
  const recs = cases
    .map((c) => c.reconciliation)
    .filter((r): r is OutcomeReconciliation => r != null);

  const onsetErrors = recs
    .map((r) => r.errorMetrics?.onsetErrorMinutes)
    .filter((n): n is number => typeof n === 'number');
  const leads = recs
    .map((r) => r.errorMetrics?.deadlineLeadMinutes)
    .filter((n): n is number => typeof n === 'number');

  return {
    caseCount: cases.length,
    predictionsIssued: cases.filter((c) => c.prediction != null).length,
    confirmed: recs.filter((r) => r.status === 'CONFIRMED').length,
    partiallyConfirmed: recs.filter((r) => r.status === 'PARTIALLY_CONFIRMED')
      .length,
    disconfirmed: recs.filter((r) => r.status === 'DISCONFIRMED').length,
    unobservable: recs.filter((r) => r.status === 'UNOBSERVABLE').length,
    falsePositiveCount: recs.filter((r) => r.errorMetrics?.falsePositive).length,
    falseNegativeCount: recs.filter((r) => r.errorMetrics?.falseNegative).length,
    meanAbsOnsetErrorMinutes:
      onsetErrors.length === 0
        ? null
        : Math.round(
            onsetErrors.reduce((a, b) => a + Math.abs(b), 0) / onsetErrors.length,
          ),
    meanDeadlineLeadMinutes:
      leads.length === 0
        ? null
        : Math.round(leads.reduce((a, b) => a + b, 0) / leads.length),
  };
}

export function runWeatherOfflineAccuracyHarness(input?: {
  cases?: WeatherOfflineAccuracyCase[];
  nowMs?: number;
}): AccuracyHarnessReport {
  const fixtures = input?.cases ?? WEATHER_OFFLINE_ACCURACY_FIXTURES;
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T18:00:00.000Z');
  const cases: AccuracyCaseResult[] = [];

  for (const fixture of fixtures) {
    const notes: string[] = [];
    const prediction = buildShadowWeatherPredictionRecord(fixture, nowMs);

    if (!prediction) {
      cases.push({
        caseId: fixture.caseId,
        prediction: null,
        reconciliation: null,
        notes: ['no_prediction_issued'],
      });
      continue;
    }

    if (prediction.authorityMode !== 'SHADOW') notes.push('authority_mode_violation');
    if (prediction.controlSeals.mayCanonicalApply) notes.push('apply_seal_violation');
    if (prediction.controlSeals.controlsReady) notes.push('ready_seal_violation');
    if (prediction.controlSeals.controlsConfirm) notes.push('confirm_seal_violation');
    if (prediction.controlSeals.controlsExecute) notes.push('execute_seal_violation');

    const reconciliation = reconcileWeatherPrediction({
      prediction,
      case: fixture,
      nowMs,
    });

    cases.push({ caseId: fixture.caseId, prediction, reconciliation, notes });
  }

  const payload = cases.map((c) => ({
    id: c.caseId,
    status: c.reconciliation?.status ?? null,
    fp: c.reconciliation?.errorMetrics?.falsePositive ?? null,
    fn: c.reconciliation?.errorMetrics?.falseNegative ?? null,
    onsetErr: c.reconciliation?.errorMetrics?.onsetErrorMinutes ?? null,
  }));

  return {
    schemaId: P2_ACCURACY_HARNESS_SCHEMA_ID,
    generatedAt: new Date(nowMs).toISOString(),
    semanticScope: 'WEATHER_DETERIORATION',
    authorityMode: 'SHADOW',
    controlSeals: {
      mutatesCanonicalAssessment: false,
      controlsReady: false,
      controlsConfirm: false,
      controlsExecute: false,
      mayCanonicalApply: false,
    },
    summary: summarize(cases),
    cases,
    replayFingerprint: `rp_p2_${createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 24)}`,
    gate0Assertions: {
      mutatesCanonicalAssessment: false,
      controlsReady: false,
      controlsConfirm: false,
      controlsExecute: false,
      mayCanonicalApply: false,
      fourthSemanticAdded: false,
    },
  };
}
