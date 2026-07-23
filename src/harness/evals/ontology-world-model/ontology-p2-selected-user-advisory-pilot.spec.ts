/**
 * ONT-P2-03A — Selected User Temporal Advisory Pilot (APPROVED)
 */

import {
  approveSelectedUserTemporalAdvisoryPilot,
  UserOptInConsentStore,
  UserAdvisoryStore,
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
  SELECTED_USER_CONSENT_VERSION,
  emitUserTemporalAdvisory,
  projectUserAdvisoryForViewer,
  evaluateUserAdvisoryEligibility,
  enterExistingPlanningFlowFromUserAdvisory,
  runActivationStep1KillSwitchOn,
  auditUserAdvisoryDryRun,
  verifyActivationStep3Runtime,
  computeSelectedUserPilotMetrics,
  selectedUserBoundaryAllZero,
  evaluateOneVoteRollback,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-03A Selected User Temporal Advisory Pilot', () => {
  const prev = { ...process.env };

  afterEach(() => {
    if (prev.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH === undefined) {
      delete process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    } else {
      process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH =
        prev.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    }
  });

  const trip = SELECTED_USER_APPROVED_TRIP_IDS[0]!;
  const user = SELECTED_USER_APPROVED_USER_IDS[0]!;

  function auth() {
    return approveSelectedUserTemporalAdvisoryPilot({
      submittedAt: '2026-07-23T19:40:00.000Z',
      nowMs: Date.parse('2026-07-23T22:00:00.000Z'),
      frozenObservationFingerprint: 'frz_02b_test',
    });
  }

  function consentStore() {
    const c = new UserOptInConsentStore();
    c.record({
      userId: user,
      tripId: trip,
      consentVersion: SELECTED_USER_CONSENT_VERSION,
      optedInAt: '2026-07-23T19:40:00.000Z',
      destination: 'IS',
      active: true,
    });
    return c;
  }

  function prediction(tripId = trip) {
    return buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId,
    })!;
  }

  it('freezes APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT with required fields', () => {
    const a = auth();
    expect(a.decision).toBe('APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT');
    expect(a.status).toBe('APPROVED_SELECTED_USER_ADVISORY_PILOT');
    expect(a.authorityMode).toBe('SHADOW');
    expect(a.deliveryMode).toBe('ADVISORY_ONLY');
    expect(a.audience).toBe('EXPLICIT_OPT_IN_SELECTED_USERS');
    expect(a.destination).toBe('IS');
    expect(a.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(a.canonicalControl).toBe('FORBIDDEN');
    expect(a.automaticPlanMutation).toBe('FORBIDDEN');
    expect(a.blockingNotification).toBe('FORBIDDEN');
    expect(a.externalFullRollout).toBe('NOT_AUTHORIZED');
    expect(a.semanticScopeExpansion).toBe('NOT_AUTHORIZED');
    expect(a.approvedTripIds.length).toBeGreaterThanOrEqual(5);
    expect(a.approvedUserIds.length).toBeGreaterThanOrEqual(10);
    expect(a.consentVersion).toBe(SELECTED_USER_CONSENT_VERSION);
    expect(a.authorizationHash).toMatch(/^ah_/);
    expect(a.dependencies.qualityGate02A).toBe('PASS');
    expect(a.dependencies.observationGate02C).toBe('PASS');
    expect(a.dependencies.weatherShadowPilot).toBe('ACTIVE');
    expect(a.dependencies.p1CanonicalPriority).toBe('ENFORCED');
    expect(a.prohibitions.oneClickAdopt).toBe(true);
    expect(a.rollbackCommand).toBe('ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1');
  });

  it('eligibility requires allowlist AND consent (not OR)', () => {
    const a = auth();
    const consent = consentStore();
    const pred = prediction();

    expect(
      evaluateUserAdvisoryEligibility({
        authorization: a,
        consent,
        tripId: trip,
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      }).eligible,
    ).toBe(true);

    expect(
      evaluateUserAdvisoryEligibility({
        authorization: a,
        consent,
        tripId: trip,
        userId: 'user_no_consent',
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      }).eligible,
    ).toBe(false);

    expect(
      evaluateUserAdvisoryEligibility({
        authorization: a,
        consent,
        tripId: 'ont_not_selected',
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: prediction('ont_not_selected'),
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      }).eligible,
    ).toBe(false);
  });

  it('Step1: Kill Switch ON keeps eligible silent; non-opt-in / non-selected never emit', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
    const a = auth();
    const consent = consentStore();
    const pred = prediction();
    const store = new UserAdvisoryStore();
    const step1 = runActivationStep1KillSwitchOn({
      authorization: a,
      consent,
      store,
      baseCtx: {
        contextRevision: 1,
        factSetVersion: 'fs_1',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
      cases: [
        {
          id: 'ok',
          label: 'optin selected',
          tripId: trip,
          userId: user,
          destination: 'IS',
          semanticScope: 'WEATHER_DETERIORATION',
          optedIn: true,
          prediction: pred,
          expectEligible: true,
          expectEmitWithKillOn: false,
          expectEmitWithKillOff: true,
        },
        {
          id: 'no_optin',
          label: 'no optin',
          tripId: trip,
          userId: 'x',
          destination: 'IS',
          semanticScope: 'WEATHER_DETERIORATION',
          optedIn: false,
          prediction: pred,
          expectEligible: false,
          expectEmitWithKillOn: false,
          expectEmitWithKillOff: false,
        },
      ],
    });
    expect(step1.pass).toBe(true);
    expect(store.all()).toHaveLength(0);
  });

  it('Step2 dry-run: boundary wouldEmit counters stay zero', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
    const a = auth();
    const consent = consentStore();
    const pred = prediction();
    const report = auditUserAdvisoryDryRun({
      authorization: a,
      consent,
      nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      candidates: [
        {
          candidateId: '1',
          tripId: trip,
          userId: user,
          destination: 'IS',
          semanticScope: 'WEATHER_DETERIORATION',
          prediction: pred,
          contextRevision: 1,
          predictionActive: true,
        },
        {
          candidateId: '2',
          tripId: 'ont_other',
          userId: user,
          destination: 'IS',
          semanticScope: 'WEATHER_DETERIORATION',
          prediction: prediction('ont_other'),
          contextRevision: 1,
          predictionActive: true,
        },
        {
          candidateId: '3',
          tripId: trip,
          userId: 'nope',
          destination: 'IS',
          semanticScope: 'WEATHER_DETERIORATION',
          prediction: pred,
          contextRevision: 1,
          predictionActive: true,
        },
      ],
    });
    expect(report.pass).toBe(true);
    expect(report.summary.nonSelectedWouldEmit).toBe(0);
    expect(report.summary.nonOptInWouldEmit).toBe(0);
    expect(report.audits.find((x) => x.candidateId === '1')?.wouldEmit).toBe(true);
    expect(report.audits.find((x) => x.candidateId === '2')?.wouldEmit).toBe(false);
  });

  it('Step3: emits with experiment banner; no one-click adopt; planning handoff only', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const a = auth();
    const consent = consentStore();
    const store = new UserAdvisoryStore();
    const emitted = emitUserTemporalAdvisory({
      authorization: a,
      consent,
      prediction: prediction(),
      store,
      ctx: {
        userId: user,
        contextRevision: 7,
        factSetVersion: 'fs_7',
        routeSegmentId: 'seg_a',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        plannedPassAt: '2026-07-23T15:10:00.000Z',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('advisory' in emitted).toBe(true);
    if (!('advisory' in emitted)) return;

    expect(emitted.advisory.experimentBanner.title).toBe('天气预测建议 · 实验功能');
    expect(emitted.advisory.display.currentStatus).toContain('不会自动修改行程');
    expect(emitted.advisory.forbiddenActions).toContain('ADOPT_AND_MUTATE_PLAN');
    expect(emitted.advisory.allowedActions).toContain('ENTER_EXISTING_PLANNING_FLOW');
    expect(emitted.advisory.allowedActions).not.toContain(
      'ADOPT_AND_MUTATE_PLAN' as never,
    );

    const handoff = enterExistingPlanningFlowFromUserAdvisory(emitted.advisory);
    expect(handoff.handoff).toBe(
      'DECISION_PREVIEW_CANONICAL_ASSESSMENT_CONFIRM_APPLY',
    );
    expect(handoff.forbiddenShortcut).toBe(true);

    const runtime = verifyActivationStep3Runtime({
      authorization: a,
      consent,
      killSwitchMustBeOff: true,
    });
    expect(runtime.authorityMode).toBe('SHADOW');
    expect(runtime.canonicalControl).toBe(false);
    expect(runtime.selectedUserEmission).toBe('enabled');
  });

  it('P1 BLOCK stays visual primary; P2 only supplements duration', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const a = auth();
    const consent = consentStore();
    const emitted = emitUserTemporalAdvisory({
      authorization: a,
      consent,
      prediction: prediction(),
      store: new UserAdvisoryStore(),
      ctx: {
        userId: user,
        contextRevision: 1,
        factSetVersion: 'fs',
        destination: 'IS',
        p1CanonicalOutcome: 'BLOCK',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('advisory' in emitted).toBe(true);
    if (!('advisory' in emitted)) return;
    expect(emitted.advisory.p1CanonicalSupplement?.supplementOnly).toBe(true);
    expect(emitted.advisory.display.currentStatus).toContain('当前路线不可执行');
    expect(emitted.advisory.display.recommendation).toContain('正式阻断');
    expect(emitted.advisory.display.recommendation).not.toContain('建议考虑调整路线');
  });

  it('prediction replace withdraws prior advisory with explicit notice', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const a = auth();
    const consent = consentStore();
    const store = new UserAdvisoryStore();
    const first = emitUserTemporalAdvisory({
      authorization: a,
      consent,
      prediction: prediction(),
      store,
      ctx: {
        userId: user,
        contextRevision: 3,
        factSetVersion: 'fs_3',
        routeSegmentId: 'seg_w',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('advisory' in first).toBe(true);
    if (!('advisory' in first)) return;

    const pred2 = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: trip,
      asOf: '2026-07-23T09:00:00.000Z',
      caseId: 'wx_reverse',
      forecastSeries: [
        {
          at: '2026-07-23T20:00:00.000Z',
          predictedLevel: 'YELLOW',
          forecastIssuedAt: '2026-07-23T09:00:00.000Z',
        },
      ],
    })!;
    const second = emitUserTemporalAdvisory({
      authorization: a,
      consent,
      prediction: pred2,
      store,
      ctx: {
        userId: user,
        contextRevision: 3,
        factSetVersion: 'fs_4',
        routeSegmentId: 'seg_w',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T09:05:00.000Z'),
      },
    });
    expect('advisory' in second).toBe(true);
    if (!('advisory' in second)) return;
    expect(second.withdrawn).toHaveLength(1);
    expect(second.withdrawn[0]!.status).toBe('WITHDRAWN');
    expect(second.withdrawn[0]!.withdrawalNotice).toContain('预测已更新');

    const proj = projectUserAdvisoryForViewer({
      advisory: second.withdrawn[0]!,
      authorization: a,
      consent,
      userId: user,
      currentContextRevision: 3,
    });
    expect('withdrawalNotice' in proj).toBe(true);

    const staleActive = projectUserAdvisoryForViewer({
      advisory: first.advisory,
      authorization: a,
      consent,
      userId: user,
      currentContextRevision: 3,
      activePredictionId: pred2.predictionId,
      activePredictionVersion: pred2.predictionVersion,
    });
    // first object still ACTIVE in memory copy but store marked withdrawn;
    // project with active prediction mismatch skips
    expect(
      'skipped' in staleActive || 'withdrawalNotice' in staleActive,
    ).toBe(true);
  });

  it('metrics boundary and one-vote rollback stay clean on happy path', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const a = auth();
    const consent = consentStore();
    const store = new UserAdvisoryStore();
    emitUserTemporalAdvisory({
      authorization: a,
      consent,
      prediction: prediction(),
      store,
      ctx: {
        userId: user,
        contextRevision: 1,
        factSetVersion: 'fs',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    const metrics = computeSelectedUserPilotMetrics({
      advisories: store.all(),
      emissionAttempts: [
        {
          emitted: true,
          tripSelected: true,
          optIn: true,
          destinationIs: true,
          semanticOk: true,
        },
      ],
    });
    expect(selectedUserBoundaryAllZero(metrics)).toBe(true);
    expect(evaluateOneVoteRollback({ metrics }).rollback).toBe(false);

    const bad = evaluateOneVoteRollback({
      metrics: { ...metrics, non_optin_emission_count: 1 },
    });
    expect(bad.rollback).toBe(true);
    expect(bad.command).toBe('ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1');
    expect(bad.continues.prediction).toBe(true);
    expect(bad.continues.internalAdvisory).toBe(true);
  });
});
