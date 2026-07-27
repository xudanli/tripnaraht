/**
 * Strong-wind Authority Vertical Slice (Priority 4).
 *
 * Weather/WorldFact → inference → TemporalImpact/TravelCausalDecision
 * → DecisionScope(snapshotId) → candidates → Verification (scope)
 * → sealed CanonicalApply (delegates PlanVersion write) → Outcome reconcile
 *
 * OR-Tools remains Shadow-only (not asserted as write authority).
 *
 * Run:
 *   npx jest src/harness/evals/vertical-slice/strong-wind-authority.harness.spec.ts
 *
 * Env (set in test): ONTOLOGY_AUTHORITY_INTERNAL_GATE1=1, ROLLOUT_MODE=ON,
 * write-chain ON, OR-Tools shadow retained.
 */

import { runIcelandSelfDriveCausalAnalysis } from '../../../trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { projectIcelandToTravelCausalDecision } from '../../../travel-causal-decision/projectors/project-iceland-to-travel-causal-decision';
import {
  attachSelectedOption,
  reconcileTravelCausalDecision,
} from '../../../travel-causal-decision/reconciliation/reconcile-decision-outcome.util';
import { projectCausalDecisionCard } from '../../../travel-causal-decision/projectors/causal-decision-card.projector';
import { runWeatherDeteriorationDetection } from '../../../travel-ontology/p1-weather-deterioration';
import { OntologyCanonicalApplyService } from '../../../travel-ontology/services/ontology-canonical-apply.service';
import {
  assertCanonicalEffectiveWriteOrFailedSafe,
  OntologyWriteFailedSafeError,
} from '../../../travel-ontology/authority/canonical-effective-write-seal.util';
import { buildWindDecisionScope } from '../../../decision-runtime/builders/build-wind-decision-scope';
import {
  assertCandidateWithinDecisionScope,
  assertSharedSnapshotId,
} from '../../../decision-runtime/contracts/decision-scope.types';
import {
  DECISION_SCOPE_VIOLATION,
  evaluateDecisionScopeBoundRun,
} from '../../../decision-runtime/verification/evaluate-decision-scope.util';
import type { TravelWorldStateSnapshot } from '../../../decision-runtime/contracts/world-state-snapshot';
import { EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import {
  bindAuthorizedUwcApplyMutation,
  UWC_WRITE_APPLY_PATH,
} from '../../../decision-runtime/execution/authorized-write-path.util';

describe('strong-wind authority vertical slice', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.ONTOLOGY_AUTHORITY_INTERNAL_GATE1 = '1';
    process.env.ONTOLOGY_AUTHORITY_ROLLOUT_MODE = 'ON';
    delete process.env.ONTOLOGY_AUTHORITY_KILL_SWITCH;
    delete process.env.ONTOLOGY_P1_WEATHER_DETERIORATION_KILL_SWITCH;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('runs facts → inference → TemporalImpact → scope → verify → sealed apply → outcome', async () => {
    const tripId = 'trip_is_south_coast_demo';
    const snapshotId = `ws_${tripId}_wind_vs`;

    const detection = runWeatherDeteriorationDetection({
      tripId,
      plan: {
        tripId,
        revision: 3,
        vehicleClass: 'HIGH_ROOF_CAMPER',
        segments: [
          {
            segmentId: 'seg_south_coast',
            regionIds: ['south_coast'],
            windExposed: true,
            outdoorActivity: true,
            itineraryItemId: 'act_glacier',
          },
        ],
      },
      observations: [
        {
          regionId: 'south_coast',
          subjectId: 'south_coast',
          warningLevel: 'ORANGE',
          observedAt: '2026-07-17T09:40:00.000Z',
          tripId,
          country: 'IS',
        },
      ],
      nowMs: Date.parse('2026-07-17T09:45:00.000Z'),
    });
    expect(detection.decisionProblem?.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(detection.repairCandidates.length).toBeGreaterThan(0);
    expect(detection.decisionScope?.snapshotId).toBe(detection.worldStateSnapshotId);

    const assessment = runIcelandSelfDriveCausalAnalysis({
      routeLabel: 'Vík → 冰川徒步',
      windMps: 27,
      windExposure: 'high',
      baseDurationMinutes: 120,
      distanceKm: 140,
      appointmentSlackMinutes: 15,
    });
    expect(assessment.missProbability).toBeGreaterThan(0.2);

    const decision = projectIcelandToTravelCausalDecision({
      tripId,
      decisionId: 'dec_strong_wind_vs',
      assessment,
      schedule: {
        detectedAt: '2026-07-17T09:40:00.000Z',
        plannedDepartureAt: '2026-07-17T10:00:00.000Z',
        checkInDeadlineAt: '2026-07-17T14:00:00.000Z',
      },
      activityLabel: '冰川徒步',
      costImpactDoNothing: 160,
      recoverableStop: {
        activityId: 'stop:mid_waterfall',
        label: '中途瀑布',
        recoverMinutes: 35,
      },
      worldStateVersion: snapshotId,
    });

    expect(decision.temporalForecast.interventionDeadline).toBeTruthy();
    expect(decision.interventions.length).toBeGreaterThan(0);
    const card = projectCausalDecisionCard(decision);
    expect(card.latestActBy).toBe(decision.temporalForecast.interventionDeadline);

    const snapshot: TravelWorldStateSnapshot = {
      schemaId: 'tripnara.canonical_world_state_snapshot@v1',
      snapshotId,
      tripId,
      revision: '3',
      createdAt: '2026-07-17T09:45:00.000Z',
      weather: [
        {
          date: '2026-07-17',
          windSpeedMs: 27,
          alertLevel: 'ORANGE',
          locationId: 'south_coast',
        },
      ],
      roads: [{ roadId: '1', segmentId: 'seg_south_coast', status: 'OPEN' }],
      hazards: [],
      ferries: [],
      poiStates: [],
      travelMatrix: { matrixId: 'm1', entries: [] },
      completeness: {
        weather: 'PARTIAL',
        roads: 'PARTIAL',
        hazards: 'MISSING',
        ferries: 'MISSING',
        openingHours: 'PARTIAL',
      },
      sourceVersions: [],
      worldFacts: detection.facts,
      vehicle: { vehicleClass: 'HIGH_ROOF_CAMPER', highRoof: true },
      inferred: {
        estimatedArrival: decision.baselineOutcome.arrivalTime,
        missProbability: assessment.missProbability,
        interventionDeadline: decision.temporalForecast.interventionDeadline,
        confidence: decision.temporalForecast.confidence,
        evidence: decision.evidenceRefs,
        riskTrend: 'DETERIORATING',
      },
    };

    const scope = buildWindDecisionScope({
      snapshot,
      activityId: 'act_glacier',
      segmentId: 'seg_south_coast',
    });

    assertSharedSnapshotId(snapshotId, [
      { name: 'decision', snapshotId: scope.snapshotId },
      { name: 'solver', snapshotId: snapshot.snapshotId },
      { name: 'verification', snapshotId: scope.snapshotId },
    ]);

    // Live Verification path (same util Gateway / PostValidator use)
    const scopeOk = evaluateDecisionScopeBoundRun({
      tripId,
      scope,
      consumers: [
        { name: 'decision', snapshotId: scope.snapshotId },
        { name: 'solver', snapshotId: snapshot.snapshotId },
        { name: 'verification', snapshotId: scope.snapshotId },
      ],
      candidate: {
        actionType: 'DROP_STOP',
        targetObjectIds: ['stop:mid_waterfall'],
      },
    });
    expect(scopeOk.ok).toBe(true);

    const scopeBad = evaluateDecisionScopeBoundRun({
      tripId,
      scope,
      candidate: {
        actionType: 'DIRECT_SET_EFFECTIVE',
        targetObjectIds: ['act_glacier'],
      },
    });
    expect(scopeBad.ok).toBe(false);
    expect(scopeBad.assertions[0]?.reasonCode).toBe(DECISION_SCOPE_VIOLATION);

    const recommended =
      decision.interventions.find((i) => i.recommended) ?? decision.interventions[0]!;
    expect(
      assertCandidateWithinDecisionScope(scope, {
        actionType: 'DROP_STOP',
        targetObjectIds: ['stop:mid_waterfall'],
      }),
    ).toEqual({ ok: true });
    expect(
      assertCandidateWithinDecisionScope(scope, {
        actionType: 'MOVE_DAY',
        targetObjectIds: ['act_glacier'],
      }).ok,
    ).toBe(false);

    expect(() =>
      assertCanonicalEffectiveWriteOrFailedSafe({
        caller: 'vertical-slice',
        assessmentId: detection.assessment!.assessmentId,
        authorityRunId: 'run_wind_vs',
        basedOnRevision: 3,
        tripId,
        canonicalApply: true,
        directSetEffective: true,
      }),
    ).toThrow(OntologyWriteFailedSafeError);

    const applyService = new OntologyCanonicalApplyService();
    const candidate = detection.repairCandidates[0]!;
    let wrotePlanVersion: string | undefined;
    const applyResult = await applyService.applyAdopt({
      tripId,
      consumer: 'decision',
      action: {
        ...candidate.actionProposal,
        basedOnRevision: 3,
        assessmentId: detection.assessment!.assessmentId,
        preconditions: [
          {
            type: 'ASSESSMENT_OUTCOME',
            assessmentId: detection.assessment!.assessmentId,
          },
          { type: 'REVISION_MATCH', expectedRevision: 3 },
        ],
      },
      sourceAssessment: detection.assessment!,
      contextId: `ctx_${tripId}_3`,
      authorityRunId: 'run_wind_vs',
      currentRevision: 3,
      factsAfterMutation: candidate.factsAfter,
      executeMutation: bindAuthorizedUwcApplyMutation(async () => {
        wrotePlanVersion = `pv_${tripId}_4`;
        return { changedPlanVersion: wrotePlanVersion };
      }),
    });

    expect(applyResult.ok).toBe(true);
    expect(wrotePlanVersion).toBe(`pv_${tripId}_4`);
    expect(EFFECTIVE_PLAN_WRITE_CHAIN_AUTHORIZED_PATHS).toEqual(
      expect.arrayContaining([UWC_WRITE_APPLY_PATH]),
    );

    const selected = attachSelectedOption(decision, recommended.optionId);
    const reconciled = reconcileTravelCausalDecision(selected, {
      completed: true,
      arrivalTime: recommended.expectedOutcome.arrivalTime,
      metrics: { iceland_miss_prob: 0.12 },
    });
    expect(reconciled.outcome?.reconciliation).toBeTruthy();
    expect(['CONFIRMED', 'PARTIAL', 'DISPROVED']).toContain(
      reconciled.outcome!.reconciliation,
    );
  });
});
