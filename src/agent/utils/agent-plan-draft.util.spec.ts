import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import {
  buildAgentPlanDraftMutationSet,
  summarizeAgentPlanDraft,
} from './agent-plan-draft.util';

function minimalPlanState(): PlanState {
  return {
    plan_id: 'plan_draft_test',
    plan_version: 1,
    status: 'PROPOSED',
    constraints: { time: { days: 2 } },
    itinerary: {
      segments: [
        {
          segmentId: 'seg1',
          metadata: { day: 1, theme: '南岸 Day1', attractions: [{ name: 'Seljalandsfoss' }] },
        },
      ],
    },
  } as PlanState;
}

describe('buildAgentPlanDraftMutationSet (Phase 5)', () => {
  it('CAS-080: projects PlanState segments to ADD-only TripMutationSet without DB', () => {
    const draft = buildAgentPlanDraftMutationSet({
      tripId: 'trip_080',
      planState: minimalPlanState(),
    });

    expect(draft.tripId).toBe('trip_080');
    expect(draft.createdBy).toBe('PLANNING_WORKBENCH_AGENT');
    expect(draft.operations.length).toBeGreaterThan(0);
    expect(draft.operations.every((op) => op.operation === 'ADD')).toBe(true);
    expect(draft.operations[0].after?.source).toBe('AGENT_PLAN_DRAFT');

    const summary = summarizeAgentPlanDraft(draft);
    expect(summary.added).toBe(draft.operations.length);
    expect(summary.modified).toBe(0);
    expect(summary.removed).toBe(0);
    expect(summary.materializedDays).toContain(1);
  });

  it('CAS-081: partial commit filters draft operations by commitDays', () => {
    const plan = minimalPlanState();
    plan.itinerary!.segments!.push({
      segmentId: 'seg2',
      metadata: { day: 2, theme: '南岸 Day2' },
    } as never);

    const draft = buildAgentPlanDraftMutationSet({
      tripId: 'trip_081',
      planState: plan,
      partialCommit: true,
      commitDays: [2],
    });

    const days = new Set(draft.operations.map((op) => op.after?.day));
    expect(days.has(1)).toBe(false);
    expect(days.has(2)).toBe(true);
  });
});
