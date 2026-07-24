/**
 * ONT-P2-01 Weather Production Shadow Pilot — SHADOW gate + kill switch + supersession
 */

import {
  approveWeatherShadowPilotAuthorization,
  evaluateP2WeatherShadowGate,
  isOntologyP2WeatherShadowKillSwitchEngaged,
  runWeatherShadowProductionPilot,
  submitWeatherShadowPilotAuthorization,
  tickWeatherShadowPilot,
  ShadowPredictionVersionStore,
  ShadowControlBoundaryProbe,
  getWeatherShadowSelectedTripIds,
  buildWeatherShadowPilotFixtureViews,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-01 Weather Production Shadow Pilot', () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const k of [
      'ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH',
      'ONTOLOGY_AUTHORITY_SEMANTIC_KILL_SWITCH',
    ]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('selected trips are IS weather shadow cohort only', () => {
    const ids = getWeatherShadowSelectedTripIds();
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(ids.every((id) => id.includes('_is_') || id.startsWith('ont_'))).toBe(
      true,
    );
  });

  it('prediction version supersession + online reconciliation; control boundary clean', async () => {
    delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
    const { report, replay } = await runWeatherShadowProductionPilot();
    expect(report.authorityMode).toBe('SHADOW');
    expect(report.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(report.controlBoundaryTotals.supersessions).toBeGreaterThanOrEqual(1);
    expect(report.controlBoundaryTotals.reconciliations).toBeGreaterThanOrEqual(1);
    expect(report.controlBoundaryTotals.canonicalApplyCalls).toBe(0);
    expect(report.controlBoundaryTotals.constraintAssessmentMutations).toBe(0);
    expect(report.controlBoundaryTotals.planRevisionMutations).toBe(0);
    expect(report.controlBoundaryTotals.readyControls).toBe(0);
    expect(report.controlBoundaryTotals.userFacingTemporalAdviceEmitted).toBe(0);
    expect(report.ticks.some((t) => t.skipped?.reason === 'TRIP_NOT_SELECTED')).toBe(
      true,
    );
    expect(replay.schemaId).toBe('tripnara.ontology_p2_weather_shadow_replay@v1');
    expect(replay.replayFingerprint).toBe(report.replayFingerprint);
    expect(replay.predictions.length).toBeGreaterThanOrEqual(2);
  });

  it('kill switch independently disables shadow pilot', () => {
    process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH = '1';
    expect(isOntologyP2WeatherShadowKillSwitchEngaged()).toBe(true);
    const views = buildWeatherShadowPilotFixtureViews();
    const store = new ShadowPredictionVersionStore();
    const probe = new ShadowControlBoundaryProbe();
    const tick = tickWeatherShadowPilot({
      view: views[0]!,
      store,
      probe,
    });
    expect(tick.skipped?.reason).toBe('KILL_SWITCH');
  });

  it('Shadow Gate PASSes; authorization submit → approve', async () => {
    delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
    const gate = await evaluateP2WeatherShadowGate({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });
    expect(gate.verdict).toBe('PASS');
    expect(gate.gate0Verdict).toBe('PASS');
    expect(gate.nextForbidden).toContain('USER_FACING_TEMPORAL_ADVICE');

    const submitted = submitWeatherShadowPilotAuthorization(
      Date.parse('2026-07-23T18:05:00.000Z'),
    );
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.scope.authorityMode).toBe('SHADOW');
    expect(submitted.prohibitions.callCanonicalApply).toBe(true);

    const approved = approveWeatherShadowPilotAuthorization({
      submitted,
      approver: 'ontology-product-authority',
      nowMs: Date.parse('2026-07-23T18:10:00.000Z'),
    });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).toBeTruthy();
  });

  it('pilot replay fingerprint is stable', async () => {
    delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
    const a = await runWeatherShadowProductionPilot({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });
    const b = await runWeatherShadowProductionPilot({
      nowMs: Date.parse('2026-07-23T18:00:00.000Z'),
    });
    expect(a.report.replayFingerprint).toBe(b.report.replayFingerprint);
  });
});
