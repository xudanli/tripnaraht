/**
 * ONT-P2-04 — Approve + Wave 3A activation (controlled expansion)
 */

import {
  submitSelectedUserCohortExpansionAuthorization,
  approveSelectedUserCohortExpansion,
  P2_04_SUBMITTED_AUTHORIZATION_HASH,
  freezeCohortRegistry,
  freezeDisplayExperimentAssignment,
  assignDisplayVariantForUser,
  describeWaveScope,
  buildCrossCohortIdempotencyKey,
  runWaveActivationSequence,
  isExpansionEmissionBlocked,
  COHORT_FUNNEL_STAGES,
  CohortAdvisoryFunnelStore,
  summarizeCohortFunnel,
  approveSelectedUserTemporalAdvisoryPilot,
  UserOptInConsentStore,
  UserAdvisoryStore,
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
  SELECTED_USER_CONSENT_VERSION,
  emitUserTemporalAdvisory,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
  compareDisplayVariantsForSamePrediction,
} from '../../../travel-ontology/p2-temporal';
import type { ExpansionReleaseProvenance } from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-04 Approve + Wave 3A', () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const k of [
      'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
      'ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH',
    ]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  function approved() {
    const submitted = submitSelectedUserCohortExpansionAuthorization({
      wave2ObservationVerdict: 'PASS',
      wave2Decision: 'SELECTED_USER_ADVISORY_COHORT_EXPANSION',
      wave2FreezeFingerprint: 'frz_w2_54c2cea7bd3048ea030ddfbd',
      nowMs: Date.parse('2026-07-23T15:10:00.000Z'),
    });
    return approveSelectedUserCohortExpansion({
      submitted,
      nowMs: Date.parse('2026-07-23T15:20:00.000Z'),
      submittedAuthorizationHash: P2_04_SUBMITTED_AUTHORIZATION_HASH,
    });
  }

  it('approves with TOTAL scope 24/42 and Product Gate NOT_AUTHORIZED', () => {
    const a = approved();
    expect(a.decision).toBe('APPROVE_SELECTED_USER_COHORT_EXPANSION');
    expect(a.status).toBe('APPROVED_SELECTED_USER_COHORT_EXPANSION');
    expect(a.authorizedTotalScope).toEqual({
      trips: 24,
      users: 42,
      destination: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      deliveryMode: 'ADVISORY_ONLY',
    });
    expect(a.productGate).toBe('NOT_AUTHORIZED');
    expect(a.predictionThresholdChange).toBe('FORBIDDEN');
    expect(a.predictionFrequencyChange).toBe('FORBIDDEN');
    expect(a.canonicalControl).toBe('FORBIDDEN');
    expect(a.prohibitions.openFull24x42InOneStep).toBe(true);
    expect(a.submittedAuthorizationHash).toBe(P2_04_SUBMITTED_AUTHORIZATION_HASH);
    expect(a.killSwitchEnv).toBe('ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH');
  });

  it('freezes registry with 42/42 consent and 24/24 trips', () => {
    const registry = freezeCohortRegistry({
      nowMs: Date.parse('2026-07-23T15:20:00.000Z'),
      consentedAt: '2026-07-23T15:00:00.000Z',
    });
    expect(registry.pass).toBe(true);
    expect(registry.integrity.validConsent).toBe('42/42');
    expect(registry.integrity.selectedTrips).toBe('24/24');
    expect(registry.integrity.missingBinding).toBe(0);
    expect(registry.integrity.duplicateBinding).toBe(0);
    expect(registry.integrity.note).toContain('TOTAL');
  });

  it('binds display variant stably by userId', () => {
    const a = assignDisplayVariantForUser('user_optin_is_20');
    const b = assignDisplayVariantForUser('user_optin_is_20');
    expect(a).toBe(b);
    const exp = freezeDisplayExperimentAssignment({
      nowMs: Date.parse('2026-07-23T15:20:00.000Z'),
    });
    expect(exp.predictionParity).toBe(true);
    expect(exp.assignments).toHaveLength(42);
    expect(exp.counts.SECTIONS_DEFAULT + exp.counts.DEADLINE_EMPHASIS).toBe(42);
  });

  it('Wave 3A is ~12 trips / 22 users within same auth', () => {
    const s = describeWaveScope('WAVE_3A');
    expect(s.cumulativeTrips).toBe(12);
    expect(s.cumulativeUsers).toBe(22);
    expect(s.deltaTrips).toBe(5);
    expect(s.deltaUsers).toBe(10);
  });

  it('idempotency key excludes wave and variant', () => {
    const key = buildCrossCohortIdempotencyKey({
      userId: 'u',
      tripId: 't',
      predictionId: 'p',
      predictionVersion: 'v',
    });
    expect(key).toBe('u|t|p|v');
  });

  it('expansion KS blocks new cohort only', () => {
    process.env.ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH = '1';
    expect(
      isExpansionEmissionBlocked({
        userId: 'user_optin_is_13',
        tripId: 'ont_p2_is_cohort_south_coast_06',
      }),
    ).toBe(true);
    expect(
      isExpansionEmissionBlocked({
        userId: 'user_optin_is_01',
        tripId: 'ont_p2_is_user_optin_weather_01',
      }),
    ).toBe(false);
  });

  it('runs full funnel stages including detailsViewed/planningEntry/feedback', () => {
    expect(COHORT_FUNNEL_STAGES).toEqual([
      'eligible',
      'emitted',
      'delivered',
      'surfaced',
      'opened',
      'detailsViewed',
      'planningEntry',
      'feedback',
    ]);
    const store = new CohortAdvisoryFunnelStore();
    for (const stage of COHORT_FUNNEL_STAGES) {
      store.advance({
        stage,
        userId: 'u',
        tripId: 't',
        predictionId: 'p',
        predictionVersion: 'v',
      });
    }
    const s = summarizeCohortFunnel(store);
    expect(s.rates.details_view_rate).toBe(1);
    expect(s.rates.planning_entry_rate).toBe(1);
    expect(s.rates.feedback_rate).toBe(1);
  });

  it('activates Wave 3A sequence successfully', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const authorization = approved();
    const registry = freezeCohortRegistry({
      nowMs: Date.parse('2026-07-23T15:20:00.000Z'),
      consentedAt: '2026-07-23T15:00:00.000Z',
    });
    const experiment = freezeDisplayExperimentAssignment({
      nowMs: Date.parse('2026-07-23T15:20:00.000Z'),
    });
    const provenance: ExpansionReleaseProvenance = {
      schemaId: 'tripnara.ontology_p2_cohort_expansion_provenance@v1',
      workItem: 'ONT-P2-04',
      frozenAt: '2026-07-23T15:20:00.000Z',
      predictionStack: {
        gitCommitSha: '89b82bc25abadc222c56380492d4d4119cbeeaa3',
        buildArtifactHash: 'bh_809b8d07af4d6735fff28c30',
        note: 'unchanged',
      },
      expansionBundle: {
        gitCommitSha: '89b82bc25abadc222c56380492d4d4119cbeeaa3',
        buildArtifactHash: 'bh_test_expansion',
        runtimeScriptSha256: 'abc',
        note: 'test',
      },
      submittedAuthorizationHash: P2_04_SUBMITTED_AUTHORIZATION_HASH,
      approvedAuthorizationHash: authorization.authorizationHash!,
      cohortHash: registry.cohortHash,
      assignmentHash: experiment.assignmentHash,
    };

    const priorAuth = approveSelectedUserTemporalAdvisoryPilot({
      submittedAt: '2026-07-23T19:40:00.000Z',
      nowMs: Date.parse('2026-07-23T22:00:00.000Z'),
    });
    const trip = SELECTED_USER_APPROVED_TRIP_IDS[0]!;
    const user = SELECTED_USER_APPROVED_USER_IDS[0]!;
    const consent = new UserOptInConsentStore();
    consent.record({
      userId: user,
      tripId: trip,
      consentVersion: SELECTED_USER_CONSENT_VERSION,
      optedInAt: '2026-07-23T19:40:00.000Z',
      destination: 'IS',
      active: true,
    });
    const pred = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: trip,
    })!;
    const emit = emitUserTemporalAdvisory({
      authorization: priorAuth,
      consent,
      prediction: pred,
      store: new UserAdvisoryStore(),
      ctx: {
        userId: user,
        contextRevision: 10,
        factSetVersion: 'fs_10',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
      },
    });
    expect('advisory' in emit).toBe(true);
    if (!('advisory' in emit)) return;
    const cmp = compareDisplayVariantsForSamePrediction(emit.advisory);
    expect(cmp.predictionParity).toBe(true);

    const report = runWaveActivationSequence({
      wave: 'WAVE_3A',
      authorization,
      registry,
      experiment,
      provenance,
      sampleAdvisory: emit.advisory,
      nowMs: Date.parse('2026-07-23T15:25:00.000Z'),
    });
    expect(report.pass).toBe(true);
    expect(report.status).toBe('ACTIVE');
    expect(report.scope.cumulativeTrips).toBe(12);
    expect(report.scope.cumulativeUsers).toBe(22);
    expect(report.observationGate.productGate).toBe('NOT_AUTHORIZED');
    expect(report.expansionKillSwitchAfter).toBe('OFF');
  });
});
