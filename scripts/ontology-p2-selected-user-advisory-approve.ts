/**
 * ONT-P2-03A — APPROVE Selected User Temporal Advisory Pilot
 * + Kill Switch ON validation + dry-run + optional Step3 runtime verify
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  approveSelectedUserTemporalAdvisoryPilot,
  UserOptInConsentStore,
  UserAdvisoryStore,
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
  SELECTED_USER_CONSENT_VERSION,
  runActivationStep1KillSwitchOn,
  runActivationStep2DryRun,
  verifyActivationStep3Runtime,
  emitUserTemporalAdvisory,
  projectUserAdvisoryForViewer,
  enterExistingPlanningFlowFromUserAdvisory,
  computeSelectedUserPilotMetrics,
  selectedUserBoundaryAllZero,
  evaluateOneVoteRollback,
  buildSelectedUserObservationChecklist,
  freezeSelectedUserObservationReport,
  buildShadowWeatherPredictionRecord,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
} from '../src/travel-ontology/p2-temporal';

function loadFrozenObservationFingerprint(): string | undefined {
  const p = join(
    process.cwd(),
    'artifacts/ontology-p2/selected-user-advisory/selected-user-temporal-advisory-authorization.json',
  );
  if (!existsSync(p)) return undefined;
  try {
    const prev = JSON.parse(readFileSync(p, 'utf8')) as {
      prerequisite?: { frozenObservationFingerprint?: string };
      dependencies?: { frozenObservationFingerprint?: string };
    };
    return (
      prev.prerequisite?.frozenObservationFingerprint ??
      prev.dependencies?.frozenObservationFingerprint
    );
  } catch {
    return undefined;
  }
}

async function main() {
  const outDir = join(process.cwd(), 'artifacts/ontology-p2/selected-user-advisory');
  mkdirSync(outDir, { recursive: true });

  const submittedAt = '2026-07-23T19:40:00.000Z';
  const frozenFp =
    loadFrozenObservationFingerprint() ?? 'frz_02b_a68b243d5d5e9052ea144d11';

  const authorization = approveSelectedUserTemporalAdvisoryPilot({
    submittedAt,
    nowMs: Date.parse('2026-07-23T22:00:00.000Z'),
    approvedBy: 'ontology-product-authority',
    frozenObservationFingerprint: frozenFp,
  });

  const authPath = join(
    outDir,
    'selected-user-temporal-advisory-authorization.json',
  );
  writeFileSync(authPath, JSON.stringify(authorization, null, 2));

  // --- Step 1: Kill Switch ON ---
  process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';

  const consent = new UserOptInConsentStore();
  const trip = SELECTED_USER_APPROVED_TRIP_IDS[0]!;
  const user = SELECTED_USER_APPROVED_USER_IDS[0]!;
  consent.record({
    userId: user,
    tripId: trip,
    consentVersion: SELECTED_USER_CONSENT_VERSION,
    optedInAt: submittedAt,
    destination: 'IS',
    active: true,
  });

  const pred = buildShadowWeatherPredictionRecord({
    ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
    tripId: trip,
  })!;
  const store = new UserAdvisoryStore();
  const nowMs = Date.parse('2026-07-23T08:00:00.000Z');

  const step1 = runActivationStep1KillSwitchOn({
    authorization,
    consent,
    store,
    baseCtx: {
      contextRevision: 10,
      factSetVersion: 'fs_10',
      routeSegmentId: 'seg_south_coast',
      vehicleClass: 'HIGH_ROOF_CAMPER',
      plannedPassAt: '2026-07-23T15:10:00.000Z',
      nowMs,
    },
    cases: [
      {
        id: 'optin_selected',
        label: 'Opt-in + selected trip',
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
        id: 'selected_no_optin',
        label: 'selected trip, no Opt-in',
        tripId: trip,
        userId: 'user_not_opted_in',
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        optedIn: false,
        prediction: pred,
        expectEligible: false,
        expectEmitWithKillOn: false,
        expectEmitWithKillOff: false,
      },
      {
        id: 'optin_non_selected',
        label: 'Opt-in, non-selected trip',
        tripId: 'ont_random_non_selected_trip',
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        optedIn: false,
        prediction: { ...pred, tripId: 'ont_random_non_selected_trip' },
        expectEligible: false,
        expectEmitWithKillOn: false,
        expectEmitWithKillOff: false,
      },
      {
        id: 'non_iceland',
        label: 'non-Iceland trip',
        tripId: trip,
        userId: user,
        destination: 'JP',
        semanticScope: 'WEATHER_DETERIORATION',
        optedIn: true,
        prediction: pred,
        expectEligible: false,
        expectEmitWithKillOn: false,
        expectEmitWithKillOff: false,
      },
      {
        id: 'other_semantic',
        label: 'other semantic',
        tripId: trip,
        userId: user,
        destination: 'IS',
        semanticScope: 'ROAD_CLOSURE',
        optedIn: true,
        prediction: pred,
        expectEligible: false,
        expectEmitWithKillOn: false,
        expectEmitWithKillOff: false,
      },
    ],
  });

  // --- Step 2: dry-run ---
  const dryRun = runActivationStep2DryRun({
    authorization,
    consent,
    nowMs,
    candidates: [
      {
        candidateId: 'c_ok',
        tripId: trip,
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        contextRevision: 10,
        predictionActive: true,
      },
      {
        candidateId: 'c_no_optin',
        tripId: trip,
        userId: 'user_not_opted_in',
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        contextRevision: 10,
        predictionActive: true,
      },
      {
        candidateId: 'c_non_selected',
        tripId: 'ont_random_non_selected_trip',
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: { ...pred, tripId: 'ont_random_non_selected_trip' },
        contextRevision: 10,
        predictionActive: true,
      },
      {
        candidateId: 'c_superseded',
        tripId: trip,
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        contextRevision: 10,
        predictionActive: false,
      },
    ],
  });

  writeFileSync(
    join(outDir, 'activation-step1-kill-switch-on.json'),
    JSON.stringify(step1, null, 2),
  );
  writeFileSync(
    join(outDir, 'activation-step2-dry-run.json'),
    JSON.stringify(dryRun, null, 2),
  );

  // --- Step 3 simulation (Kill Switch OFF) for artifact proof only ---
  process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
  const runtime = verifyActivationStep3Runtime({
    authorization,
    consent,
    killSwitchMustBeOff: true,
  });

  const store2 = new UserAdvisoryStore();
  const emit = emitUserTemporalAdvisory({
    authorization,
    consent,
    prediction: pred,
    store: store2,
    ctx: {
      userId: user,
      contextRevision: 10,
      factSetVersion: 'fs_10',
      routeSegmentId: 'seg_south_coast',
      vehicleClass: 'HIGH_ROOF_CAMPER',
      plannedPassAt: '2026-07-23T15:10:00.000Z',
      destination: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      nowMs,
    },
  });

  let withdrawalOk = false;
  let planningHandoffOk = false;
  let p1BlockSupplementOk = false;

  if ('advisory' in emit) {
    planningHandoffOk =
      enterExistingPlanningFlowFromUserAdvisory(emit.advisory).handoff ===
      'DECISION_PREVIEW_CANONICAL_ASSESSMENT_CONFIRM_APPLY';

    const pred2 = buildShadowWeatherPredictionRecord({
      ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
      tripId: trip,
      asOf: '2026-07-23T09:00:00.000Z',
      caseId: 'wx_user_pilot_next',
      forecastSeries: [
        {
          at: '2026-07-23T18:00:00.000Z',
          predictedLevel: 'YELLOW',
          forecastIssuedAt: '2026-07-23T09:00:00.000Z',
        },
      ],
    })!;
    const next = emitUserTemporalAdvisory({
      authorization,
      consent,
      prediction: pred2,
      store: store2,
      ctx: {
        userId: user,
        contextRevision: 10,
        factSetVersion: 'fs_11',
        routeSegmentId: 'seg_south_coast',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        destination: 'IS',
        nowMs: Date.parse('2026-07-23T09:05:00.000Z'),
      },
    });
    if ('advisory' in next && next.withdrawn.length === 1) {
      const proj = projectUserAdvisoryForViewer({
        advisory: next.withdrawn[0]!,
        authorization,
        consent,
        userId: user,
        currentContextRevision: 10,
      });
      withdrawalOk = 'withdrawalNotice' in proj;
    }

    const blockEmit = emitUserTemporalAdvisory({
      authorization,
      consent,
      prediction: pred,
      store: new UserAdvisoryStore(),
      ctx: {
        userId: user,
        contextRevision: 11,
        factSetVersion: 'fs_12',
        routeSegmentId: 'seg_block',
        vehicleClass: 'HIGH_ROOF_CAMPER',
        destination: 'IS',
        p1CanonicalOutcome: 'BLOCK',
        nowMs,
      },
    });
    if ('advisory' in blockEmit) {
      p1BlockSupplementOk =
        !!blockEmit.advisory.p1CanonicalSupplement?.supplementOnly &&
        blockEmit.advisory.display.recommendation.includes('正式阻断');
    }
  }

  const metrics = computeSelectedUserPilotMetrics({
    advisories: store2.all(),
    emissionAttempts: [
      {
        emitted: 'advisory' in emit,
        tripSelected: true,
        optIn: true,
        destinationIs: true,
        semanticOk: true,
      },
    ],
    behavior: {
      user_missed_canonical_block: 0,
      user_believed_plan_auto_changed: 0,
      unnecessary_high_impact_plan_change: 0,
      stale_advisory_exposure: 0,
      wrong_trip_or_segment_exposure: 0,
    },
  });

  const checklist = buildSelectedUserObservationChecklist({
    allUsersHaveOptIn: true,
    allBoundPredictionAndContext: true,
    p1CanonicalPreferred: p1BlockSupplementOk,
    coveredPredictionReplaceAndWithdraw: withdrawalOk,
    coveredDeadlineExpiry: false,
    coveredWarningNeedConfirmUnknown: false,
    understandingIssuesAdjudicated: false,
    unresolvedActionableFn: 0,
    metrics,
    killSwitchVerified: step1.pass,
  });

  const observation = freezeSelectedUserObservationReport({
    authorization,
    metrics,
    checklist,
    nowMs: Date.parse('2026-07-23T22:10:00.000Z'),
  });

  writeFileSync(
    join(outDir, 'activation-step3-runtime.json'),
    JSON.stringify(runtime, null, 2),
  );
  writeFileSync(
    join(outDir, 'selected-user-observation.latest.json'),
    JSON.stringify(observation, null, 2),
  );

  // Leave Kill Switch ON as the safe default after approve script
  process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';

  const rollback = evaluateOneVoteRollback({ metrics });

  console.log(
    JSON.stringify(
      {
        ok:
          authorization.decision ===
            'APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT' &&
          step1.pass &&
          dryRun.pass &&
          selectedUserBoundaryAllZero(metrics) &&
          !rollback.rollback,
        workItem: 'ONT-P2-03A',
        decision: authorization.decision,
        status: authorization.status,
        authorityMode: authorization.authorityMode,
        deliveryMode: authorization.deliveryMode,
        audience: authorization.audience,
        destination: authorization.destination,
        semanticScope: authorization.semanticScope,
        canonicalControl: authorization.canonicalControl,
        authorizationHash: authorization.authorizationHash,
        approvedTripCount: authorization.approvedTripIds.length,
        approvedUserCount: authorization.approvedUserIds.length,
        activation: {
          step1Pass: step1.pass,
          dryRunPass: dryRun.pass,
          dryRunSummary: dryRun.summary,
          runtime,
          withdrawalOk,
          planningHandoffOk,
          p1BlockSupplementOk,
        },
        observationStatus: observation.status,
        nextAllowedAfterPilotComplete: [
          'SELECTED_USER_ADVISORY_COHORT_EXPANSION',
          'WEATHER_TEMPORAL_ADVISORY_PRODUCT_GATE',
        ],
        nextForbidden: observation.nextForbidden,
        recommendedPostApproveState: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1',
        artifacts: {
          authorization: authPath,
          step1: join(outDir, 'activation-step1-kill-switch-on.json'),
          dryRun: join(outDir, 'activation-step2-dry-run.json'),
          step3: join(outDir, 'activation-step3-runtime.json'),
          observation: join(outDir, 'selected-user-observation.latest.json'),
        },
      },
      null,
      2,
    ),
  );

  if (authorization.status !== 'APPROVED_SELECTED_USER_ADVISORY_PILOT') {
    process.exit(1);
  }
  if (!step1.pass || !dryRun.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
