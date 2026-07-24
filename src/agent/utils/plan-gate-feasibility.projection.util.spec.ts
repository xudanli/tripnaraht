import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { TripFeasibilityReportDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import {
  estimateDraftExecutability,
  extractFeasibilitySnapshot,
} from './plan-gate-feasibility.projection.util';
import type { PlanningDaySplitDto } from '../../trips/trip-constraint-solver/types/planning-conflicts.types';
import {
  memberSplitBlockers,
  projectMemberSplitDiff,
} from './plan-gate-member-diff.projection.util';

function plan(gateStatus: PlanState['gate']['status'] = 'ALLOW'): PlanState {
  return {
    plan_id: 'plan_1',
    plan_version: 1,
    constraints: { time: { days: 3 }, budget: { total: 10000, currency: 'CNY' }, fitness: {} },
    itinerary: { tripId: 'trip_1', routeDirectionId: 'r1', segments: [] },
    mobility: { transferSegments: [] },
    budget: { breakdown: { categories: [], confidence: 'medium', assumptions: [] } },
    pace: { fatigueScore: { paceScore: 92 } },
    gate: { status: gateStatus, reasons: [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
    metadata: {},
  };
}

describe('plan-gate-feasibility.projection.util', () => {
  it('extracts snapshot from feasibility report', () => {
    const report = {
      overallScore: 78.4,
      verifiedAt: '2026-07-03T00:00:00.000Z',
      verdict: { status: 'NEED_CONFIRM' },
      canStartExecute: false,
      teamFitSummary: { memberCount: 4 },
      itineraryCompletenessSummary: { score: 0.82 },
    } as TripFeasibilityReportDto;

    expect(extractFeasibilitySnapshot(report)).toEqual({
      executability: 78,
      source: 'feasibility_report',
      verifiedAt: '2026-07-03T00:00:00.000Z',
      verdictStatus: 'NEED_CONFIRM',
      canStartExecute: false,
      memberCount: 4,
      completenessScore: 0.82,
    });
  });

  it('adjusts draft estimate from gate and pace', () => {
    const withReport = estimateDraftExecutability(plan('NEED_CONFIRM'), {
      overallScore: 80,
    } as TripFeasibilityReportDto);
    expect(withReport).toBeLessThanOrEqual(82);

    const rejected = estimateDraftExecutability(plan('REJECT'));
    expect(rejected).toBeLessThanOrEqual(45);
  });
});

function daySplit(day: number, branches: number, meetup?: string): PlanningDaySplitDto {
  return {
    id: `split_${day}`,
    splitPlanId: 'sp1',
    dayIndex: day - 1,
    dayNumber: day,
    title: `Day ${day} split`,
    sharedBefore: [],
    branches: Array.from({ length: branches }, (_, i) => ({
      id: `b${i}`,
      groupId: `g${i}`,
      groupLabel: `组${i + 1}`,
      memberCount: 2,
      variant: 'blue' as const,
      segments: [],
    })),
    rejoin: meetup
      ? {
          id: 'rejoin',
          kind: 'rejoin',
          startTime: '18:00',
          title: meetup,
        }
      : undefined,
  };
}

describe('plan-gate-member-diff.projection.util', () => {
  it('detects added split and missing meetup', () => {
    const changes = projectMemberSplitDiff([], [daySplit(3, 2)]);
    expect(changes.some((c) => c.kind === 'split_added')).toBe(true);
    expect(changes.some((c) => c.missingMeetup)).toBe(true);
    expect(memberSplitBlockers(changes).length).toBeGreaterThan(0);
  });

  it('detects meetup change', () => {
    const before = daySplit(2, 2, '停车场 A');
    const after = daySplit(2, 2, '酒店大堂');
    const changes = projectMemberSplitDiff([before], [after]);
    expect(changes.some((c) => c.kind === 'meetup_changed')).toBe(true);
  });
});
