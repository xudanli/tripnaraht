import {
  computeDreRoadLoadMetrics,
  computeDrivingHoursByDay,
  evaluateDreRoadLoadForCandidate,
  mergeDreStrategyIntoRoadLoadAssessment,
  stripDreUpdatedPlan,
} from './dre-road-load.adapter';
import { buildRoadCloseStubCandidates, planForCandidate } from './repair-candidate.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';
import { buildMinimalEvaluateWorld } from '../orchestration/minimal-evaluate-world.util';

function drivePlan(durationMin: number): RoutePlanDraft {
  return {
    tripId: 'trip_dre',
    segments: [
      {
        segmentId: 'trip-trip_dre-item-item_drive',
        dayIndex: 2,
        distanceKm: 120,
        metadata: {
          itineraryItemId: 'item_drive',
          travelFromPreviousDurationMin: durationMin,
        },
      },
    ],
  };
}

const impact: RoadCloseImpactResult = {
  roadId: 'F208',
  matchedSegmentIds: ['trip-trip_dre-item-item_drive'],
  affectedPlanItemIds: ['item_drive'],
  downstreamPlanItemIds: [],
};

const problem = { problemId: 'prob_1', planVersionId: 'plan_v17' } as Rfc001DecisionProblem;

describe('dre-road-load.adapter (WP2)', () => {
  it('DRE-ROAD-001: computes driving hours by day from segment duration', () => {
    const plan = drivePlan(90);
    const byDay = computeDrivingHoursByDay(plan, 50);
    expect(byDay.get(2)).toBeCloseTo(1.5, 2);
  });

  it('DRE-ROAD-002: cand_c long detour has higher scheduleStress than cand_b', () => {
    const base = drivePlan(90);
    const candidates = buildRoadCloseStubCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan: base,
    });
    const world = buildMinimalEvaluateWorld({
      countryCode: 'IS',
      roadId: 'F208',
      roadStatus: 'CLOSED',
    });

    const candB = evaluateDreRoadLoadForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_b',
      inputSnapshotRef: 'wss_1',
      baselinePlan: base,
      candidatePlan: planForCandidate(
        base,
        candidates.find((c) => c.candidateId === 'cand_b')!,
      ),
      repairCandidate: candidates.find((c) => c.candidateId === 'cand_b'),
      world,
      affectedDayIndex: 2,
    });

    const candC = evaluateDreRoadLoadForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_c',
      inputSnapshotRef: 'wss_1',
      baselinePlan: base,
      candidatePlan: planForCandidate(
        base,
        candidates.find((c) => c.candidateId === 'cand_c')!,
      ),
      repairCandidate: candidates.find((c) => c.candidateId === 'cand_c'),
      world,
      affectedDayIndex: 2,
    });

    expect(candC.scheduleStress).toBeGreaterThan(candB.scheduleStress);
    expect(candC.modelVersion).toContain('dre-road-load');
  });

  it('DRE-ROAD-003: metrics reflect added duration delta', () => {
    const base = drivePlan(90);
    const metrics = computeDreRoadLoadMetrics({
      baselinePlan: base,
      candidatePlan: base,
      repairCandidate: {
        estimatedAddedDurationMinutes: 90,
      } as any,
      affectedDayIndex: 2,
    });
    expect(metrics.addedDurationMinutes).toBe(90);
    expect(metrics.maxDayDrivingHours).toBeCloseTo(3, 2);
  });

  it('DRE-ROAD-004: stripDreUpdatedPlan removes updatedPlan', () => {
    const stripped = stripDreUpdatedPlan({
      allowed: true,
      action: 'ADJUST',
      logs: [],
      updatedPlan: { tripId: 'x', segments: [] },
    });
    expect(stripped.updatedPlan).toBeUndefined();
  });

  it('DRE-ROAD-005: merge takes max load from strategy assessment', () => {
    const road = evaluateDreRoadLoadForCandidate({
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_a',
      inputSnapshotRef: 'wss_1',
      baselinePlan: drivePlan(90),
      candidatePlan: drivePlan(90),
      world: buildMinimalEvaluateWorld({
        countryCode: 'IS',
        roadId: 'F208',
        roadStatus: 'CLOSED',
      }),
    });
    const merged = mergeDreStrategyIntoRoadLoadAssessment(
      road,
      {
        allowed: true,
        action: 'ADJUST',
        logs: [{ action: 'ADJUST', explanation: 'pace', reasonCodes: ['FATIGUE'] }],
        expectedUtility: 0.1,
      },
      {
        workspaceId: 'ws_1',
        targetCandidateId: 'cand_a',
        inputSnapshotRef: 'wss_1',
      },
    );
    expect(merged.physicalLoad).toBeGreaterThanOrEqual(road.physicalLoad);
    expect(merged.modelVersion).toContain('drdre-strategy');
  });
});
