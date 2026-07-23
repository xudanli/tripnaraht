/**
 * ONT-P2-02A Weather Temporal Prediction Quality Gate
 * + ONT-P2-02B application gated on 02A PASS
 */

import {
  evaluateWeatherTemporalPredictionQualityGate,
  submit02BInternalTemporalAdvisoryApplication,
  emitInternalShadowTemporalAdvisory,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
  approveInternalTemporalAdvisoryPilot,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-02A Weather Temporal Prediction Quality Gate', () => {
  it('freezes baseline axes and completes human review ledger with replay fingerprints', async () => {
    const gate = await evaluateWeatherTemporalPredictionQualityGate({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });

    expect(gate.workItem).toBe('ONT-P2-02A');
    expect(gate.authorityMode).toBe('SHADOW');
    expect(gate.baseline.onsetAbsErrorMinutesP95).toBeGreaterThan(0);
    expect(gate.baseline.maxActionableFalseNegativeRate).toBeGreaterThan(0);
    expect(gate.baseline.maxFalsePositiveRate).toBeGreaterThan(0);
    expect(gate.baseline.maxPredictionReversalRate).toBeGreaterThanOrEqual(0);
    expect(gate.baseline.minReconciliationCompletionRate).toBeGreaterThanOrEqual(0);
    expect(gate.baseline.maxUnobservableRate).toBeGreaterThanOrEqual(0);

    expect(gate.metrics.falsePositiveCount).toBeGreaterThanOrEqual(1);
    expect(gate.metrics.actionableFalseNegativeCount).toBeGreaterThanOrEqual(1);
    expect(gate.metrics.predictionReversalCount).toBeGreaterThanOrEqual(1);
    expect(gate.metrics.unobservableCount).toBeGreaterThanOrEqual(1);

    expect(gate.ledger.ledgerComplete).toBe(true);
    expect(gate.ledger.summary.pendingHumanReview).toBe(0);
    expect(
      gate.ledger.entries.every((e) => e.replayFingerprint.startsWith('rp_q_')),
    ).toBe(true);
    expect(gate.ledger.entries.every((e) => e.classification != null)).toBe(true);

    expect(gate.verdict).toBe('PASS');
    expect(gate.nextAllowed).toBe(
      'APPLY_ONT_P2_02B_INTERNAL_TEMPORAL_ADVISORY',
    );
  });

  it('after 02A PASS, submits 02B application as SUBMITTED (not auto-APPROVED)', async () => {
    const gate = await evaluateWeatherTemporalPredictionQualityGate({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });
    expect(gate.verdict).toBe('PASS');

    const app = submit02BInternalTemporalAdvisoryApplication({
      qualityGate: gate,
      nowMs: Date.parse('2026-07-23T18:30:00.000Z'),
    });
    expect(app.workItem).toBe('ONT-P2-02B');
    expect(app.status).toBe('SUBMITTED');
    expect(app.scope.authorityMode).toBe('SHADOW');
    expect(app.scope.audience).toBe('SELECTED_INTERNAL_TRIPS_ONLY');
    expect(app.prohibitions.callCanonicalApply).toBe(true);
    expect(app.prohibitions.mutateConstraintAssessment).toBe(true);
    expect(app.prohibitions.controlReady).toBe(true);
    expect(app.prohibitions.userFacingExternalAdvice).toBe(true);

    const pred = buildShadowWeatherPredictionRecord(
      WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
    )!;
    const blocked = emitInternalShadowTemporalAdvisory({
      authorization: app,
      prediction: pred,
    });
    expect('skipped' in blocked).toBe(true);

    // Approved path uses v2 status
    const approved = approveInternalTemporalAdvisoryPilot({
      submittedAt: app.submittedAt!,
      nowMs: Date.parse('2026-07-23T19:00:00.000Z'),
    });
    expect(approved.status).toBe('APPROVED_INTERNAL_ADVISORY_ONLY');
    const emitted = emitInternalShadowTemporalAdvisory({
      authorization: approved,
      prediction: { ...pred, tripId: 'ont_p2_is_weather_shadow_01' },
      nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
    });
    expect('skipped' in emitted).toBe(false);
    if (!('skipped' in emitted)) {
      expect(emitted.authorityMode).toBe('SHADOW');
      expect(emitted.shadowBanner).toBe('SHADOW_PREDICTION_NOT_AUTHORITATIVE');
      expect(emitted.controlSeals.mayCanonicalApply).toBe(false);
      expect(emitted.controlSeals.mutatesCanonicalAssessment).toBe(false);
    }
  });

  it('02B stays blocked when quality gate fails ledgerComplete=false path', async () => {
    const gate = await evaluateWeatherTemporalPredictionQualityGate();
    const blocked = submit02BInternalTemporalAdvisoryApplication({
      qualityGate: {
        ...gate,
        verdict: 'FAIL',
        ledger: { ...gate.ledger, ledgerComplete: false },
      },
    });
    expect(blocked.status).toBe('BLOCKED_PENDING_02A');
  });
});
