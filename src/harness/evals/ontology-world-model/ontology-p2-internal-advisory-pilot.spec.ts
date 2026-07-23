/**
 * ONT-P2-02B — approve Internal Temporal Advisory Pilot + fault injection + observation freeze
 */

import {
  approveInternalTemporalAdvisoryPilot,
  runInternalAdvisoryObservationPilot,
  emitInternalTemporalAdvisory,
  InternalAdvisoryStore,
  projectInternalAdvisoryForViewer,
  isOntologyP2InternalAdvisoryKillSwitchEngaged,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-02B Internal Temporal Advisory Pilot (APPROVED_INTERNAL_ADVISORY_ONLY)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    if (prev.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH === undefined) {
      delete process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
    } else {
      process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH =
        prev.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
    }
  });

  it('approves with frozen SHADOW internal-only scope', () => {
    const auth = approveInternalTemporalAdvisoryPilot({
      submittedAt: '2026-07-23T18:30:00.000Z',
      nowMs: Date.parse('2026-07-23T19:00:00.000Z'),
    });
    expect(auth.status).toBe('APPROVED_INTERNAL_ADVISORY_ONLY');
    expect(auth.decision).toBe('APPROVE_INTERNAL_TEMPORAL_ADVISORY_PILOT');
    expect(auth.scope.destination).toBe('IS');
    expect(auth.scope.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(auth.scope.authorityMode).toBe('SHADOW');
    expect(auth.scope.audience).toBe('SELECTED_INTERNAL_ONLY');
    expect(auth.canonicalControl).toBe('FORBIDDEN');
    expect(auth.externalUserEmission).toBe('FORBIDDEN');
    expect(auth.prohibitions.weakenP1CanonicalAssessment).toBe(true);
    expect(auth.killSwitchEnv).toBe('ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH');
  });

  it('binds predictionVersion + contextRevision; withdraws on supersede; 5-section authority always present', () => {
    const auth = approveInternalTemporalAdvisoryPilot({
      submittedAt: '2026-07-23T18:30:00.000Z',
    });
    const store = new InternalAdvisoryStore();
    const pred = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: 'ont_p2_is_weather_shadow_01',
    })!;
    const emitted = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: pred,
      store,
      ctx: {
        contextRevision: 42,
        factSetVersion: 'fs_42',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        plannedPassAt: '2026-07-23T15:10:00.000Z',
        viewerId: 'reviewer.ontology.pm',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('skipped' in emitted).toBe(false);
    if ('skipped' in emitted) return;
    expect(emitted.advisory.predictionVersion).toBe(pred.predictionVersion);
    expect(emitted.advisory.contextRevision).toBe(42);
    expect(emitted.advisory.display.authorityStatus).toContain('SHADOW');
    expect(emitted.advisory.display.authorityStatus).toContain('不会自动修改行程');

    const pred2 = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: 'ont_p2_is_weather_shadow_01',
      asOf: '2026-07-23T07:00:00.000Z',
      caseId: 'wx_next',
      forecastSeries: [
        {
          at: '2026-07-23T12:00:00.000Z',
          predictedLevel: 'ORANGE',
          forecastIssuedAt: '2026-07-23T07:00:00.000Z',
        },
        {
          at: '2026-07-23T14:00:00.000Z',
          predictedLevel: 'RED',
          forecastIssuedAt: '2026-07-23T07:00:00.000Z',
        },
      ],
    })!;
    const next = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: pred2,
      store,
      ctx: {
        contextRevision: 42,
        factSetVersion: 'fs_43',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs: Date.parse('2026-07-23T07:30:00.000Z'),
      },
    });
    expect('skipped' in next).toBe(false);
    if ('skipped' in next) return;
    expect(next.withdrawn).toHaveLength(1);
    expect(next.withdrawn[0]!.status).toBe('WITHDRAWN');

    const stale = projectInternalAdvisoryForViewer({
      advisory: emitted.advisory,
      authorization: auth,
      viewerId: 'reviewer.ontology.pm',
      currentContextRevision: 42,
      activePredictionId: pred2.predictionId,
      activePredictionVersion: pred2.predictionVersion,
    });
    expect('skipped' in stale).toBe(true);
  });

  it('independent advisory kill switch silences emitter without requiring weather shadow kill', () => {
    process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH = '1';
    expect(isOntologyP2InternalAdvisoryKillSwitchEngaged()).toBe(true);
    const auth = approveInternalTemporalAdvisoryPilot({
      submittedAt: '2026-07-23T18:30:00.000Z',
    });
    const pred = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: 'ont_p2_is_weather_shadow_01',
    })!;
    const r = emitInternalTemporalAdvisory({
      authorization: auth,
      prediction: pred,
      store: new InternalAdvisoryStore(),
      ctx: {
        contextRevision: 1,
        factSetVersion: 'fs',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        viewerId: 'reviewer.ontology.pm',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('skipped' in r && r.skipped).toBe('INTERNAL_ADVISORY_KILL_SWITCH');
  });

  it('observation pilot PASSes fault injections and freezes report', async () => {
    delete process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
    const report = await runInternalAdvisoryObservationPilot({
      nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
    });
    expect(report.authorization.status).toBe('APPROVED_INTERNAL_ADVISORY_ONLY');
    expect(report.faultInjections.every((f) => f.ok)).toBe(true);
    expect(report.verdict).toBe('PASS');
    expect(report.metrics.canonical_apply_invocation).toBe(0);
    expect(report.metrics.external_user_emission).toBe(0);
    expect(report.metrics.advisory_emitted_count).toBeGreaterThanOrEqual(20);
    expect(report.nextForbidden).toContain('P2_CANONICAL_AUTHORITY');
  });
});
