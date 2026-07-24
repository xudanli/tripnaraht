import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import {
  buildPlanGateCommitResult,
  projectPlanGateDraftDiff,
  resolveBaselinePlanId,
} from './plan-gate-diff.projection.util';

function segment(day: number, theme: string, distanceKm: number, acc?: string): PlanState['itinerary']['segments'][number] {
  return {
    segmentId: `day_${day}_segment_1`,
    dayIndex: day - 1,
    distanceKm,
    ascentM: 0,
    slopePct: 0,
    metadata: {
      day,
      theme,
      name: `第${day}天：${theme}`,
      accommodation: acc ? { nameCN: acc } : undefined,
    },
  };
}

function plan(id: string, version: number, segments: PlanState['itinerary']['segments'], gateStatus: PlanState['gate']['status'] = 'ALLOW'): PlanState {
  return {
    plan_id: id,
    plan_version: version,
    constraints: { time: { days: segments.length }, budget: { total: 20000, currency: 'CNY' }, fitness: {} },
    itinerary: { tripId: 'trip_1', routeDirectionId: 'r1', segments },
    mobility: { transferSegments: [] },
    budget: {
      breakdown: {
        categories: [{ category: 'accommodation', min: 0, max: 0, estimated: 6000 + version * 620, assumptions: [] }],
        confidence: 'medium',
        assumptions: [],
      },
    },
    pace: {},
    gate: { status: gateStatus, reasons: gateStatus === 'NEED_CONFIRM' ? ['Day 3 负荷偏高'] : [], missingEvidence: [] },
    evidence_refs: [],
    decision_log_refs: [],
    status: 'DRAFT',
    metadata: { draftLabel: `A${version}`, executabilityScore: gateStatus === 'ALLOW' ? 89 : 76 },
  };
}

describe('plan-gate-diff.projection.util', () => {
  const baseline = plan('plan_a3', 3, [
    segment(1, '抵达', 80, '旧酒店'),
    segment(2, '黄金圈', 137, '南岸酒店'),
    segment(3, '冰川', 95),
  ]);

  const draft = plan('plan_a4', 4, [
    segment(1, '抵达', 80, '旧酒店'),
    segment(2, '黄金圈', 96, '升级酒店'),
    segment(3, '冰川', 95),
  ], 'NEED_CONFIRM');

  it('projects timeline and metrics diff', () => {
    const diff = projectPlanGateDraftDiff({
      baselinePlanId: 'plan_a3',
      baselinePlanState: baseline,
      draftPlanId: 'plan_a4',
      draftPlanState: draft,
    });

    expect(diff.baselineLabel).toBe('A3');
    expect(diff.draftLabel).toBe('A4');
    expect(diff.timelineChanges.some((c) => c.kind === 'accommodation_changed')).toBe(true);
    expect(diff.timelineChanges.some((c) => c.kind === 'time_adjusted')).toBe(true);
    expect(diff.metrics.budgetPerPerson?.delta).toBe(620);
    expect(diff.changeLog.length).toBeGreaterThan(0);
    expect(diff.affectedDayCount).toBeGreaterThan(0);
  });

  it('builds commit result from diff', () => {
    const diff = projectPlanGateDraftDiff({
      baselinePlanId: 'plan_a3',
      baselinePlanState: baseline,
      draftPlanId: 'plan_a4',
      draftPlanState: { ...draft, metadata: { ...draft.metadata, committedAt: '2026-07-03T00:00:00.000Z' }, status: 'LOCKED' },
    });
    const committed = { ...draft, metadata: { ...draft.metadata, committedAt: '2026-07-03T00:00:00.000Z' }, status: 'LOCKED' as const };

    const result = buildPlanGateCommitResult({
      planState: committed,
      baselinePlanState: baseline,
      diff,
    });

    expect(result.success).toBe(true);
    expect(result.committedVersionLabel).toBe('A4');
    expect(result.updates.length).toBeGreaterThan(0);
    expect(result.nextActions.some((a) => a.action === 'view_timeline')).toBe(true);
  });

  it('resolves baseline plan id from trip metadata', () => {
    const id = resolveBaselinePlanId(plan('plan_new', 5, []), {
      currentPlanId: 'plan_a3',
    });
    expect(id).toBe('plan_a3');
  });
});
