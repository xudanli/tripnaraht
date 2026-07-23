/**
 * ONT-P2-00 — Gate 0 offline validation (Charter / contracts / Accuracy Harness)
 * Does NOT start production Shadow Pilot.
 */

import {
  INTERVENTION_DEADLINE_SCHEMA_ID,
  OUTCOME_RECONCILIATION_SCHEMA_ID,
  PREDICTION_RECORD_SCHEMA_ID,
  TEMPORAL_IMPACT_SCHEMA_ID,
  evaluateP2Gate0Offline,
  runWeatherOfflineAccuracyHarness,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
  WEATHER_OFFLINE_CASE_FALSE_NEGATIVE,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-00 Temporal Prediction Gate 0 (offline / SHADOW)', () => {
  it('exports stable contract schemaIds', () => {
    expect(TEMPORAL_IMPACT_SCHEMA_ID).toBe('tripnara.temporal_impact@v1');
    expect(INTERVENTION_DEADLINE_SCHEMA_ID).toBe(
      'tripnara.intervention_deadline@v1',
    );
    expect(PREDICTION_RECORD_SCHEMA_ID).toBe('tripnara.prediction_record@v1');
    expect(OUTCOME_RECONCILIATION_SCHEMA_ID).toBe(
      'tripnara.outcome_reconciliation@v1',
    );
  });

  it('SHADOW prediction seals block Canonical / READY / Confirm / Execute', () => {
    const pred = buildShadowWeatherPredictionRecord(
      WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
    );
    expect(pred).toBeTruthy();
    expect(pred!.authorityMode).toBe('SHADOW');
    expect(pred!.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(pred!.controlSeals).toEqual({
      mutatesCanonicalAssessment: false,
      controlsReady: false,
      controlsConfirm: false,
      controlsExecute: false,
      mayCanonicalApply: false,
    });
    expect(pred!.temporalImpact.predictedOnset).toBe(
      '2026-07-23T09:00:00.000Z',
    );
    expect(pred!.temporalImpact.predictedDeterioration).toBe(
      '2026-07-23T11:00:00.000Z',
    );
    expect(pred!.interventionDeadline.interventionDeadline < pred!.temporalImpact.predictedOnset).toBe(
      true,
    );
  });

  it('accuracy harness computes FP/FN and stable replay fingerprint', () => {
    const a = runWeatherOfflineAccuracyHarness();
    const b = runWeatherOfflineAccuracyHarness();
    expect(a.replayFingerprint).toBe(b.replayFingerprint);
    expect(a.summary.falsePositiveCount).toBeGreaterThanOrEqual(1);
    expect(a.summary.falseNegativeCount).toBeGreaterThanOrEqual(1);
    expect(a.summary.meanAbsOnsetErrorMinutes).not.toBeNull();
    expect(a.gate0Assertions.fourthSemanticAdded).toBe(false);

    const fn = a.cases.find((c) => c.caseId === WEATHER_OFFLINE_CASE_FALSE_NEGATIVE.caseId);
    expect(fn?.reconciliation?.errorMetrics?.falseNegative).toBe(true);
  });

  it('Gate 0 offline evaluation PASSes without production pilot', () => {
    const report = evaluateP2Gate0Offline({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });
    expect(report.phase).toBe('CHARTER_CONTRACTS_OFFLINE_ONLY');
    expect(report.verdict).toBe('PASS');
    expect(report.nextAllowed).toBe('APPLY_FOR_PRODUCTION_SHADOW_PILOT');
    expect(report.nextForbidden).toContain(
      'PRODUCTION_SHADOW_PILOT_WITHOUT_APPROVAL',
    );
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });
});
