import { ConstraintStateStore } from '../stream/constraint-state.store';
import { runCounterfactual } from './counterfactual.simulator';

describe('runCounterfactual', () => {
  const plan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            title: 'A',
            type: 'nature' as const,
          },
        ],
      },
    ],
  };

  it('returns simulated plan, diff, cost delta, and patched constraint preview', () => {
    const out = runCounterfactual(
      {
        id: 'cf1',
        assumption: 'F208 is OPEN',
        patchedConstraints: { roads: { F208: 'OPEN' } },
        simulationMode: 'PARTIAL_REPLAY',
        horizon: { start: '2026-06-01', end: '2026-06-01' },
        hypothesizedSlotIds: ['s1'],
      },
      plan,
      { nowMs: 99, baselineConstraintStore: new ConstraintStateStore() },
    );
    expect(out.simulatedPlan.days[0]!.timeSlots[0]!.id).toBe('s1');
    expect(out.diff.changedSlotIds).toContain('s1');
    expect(out.patchedConstraintPreview.latestByRoad.get('F208')?.status).toBe(
      'OPEN',
    );
    expect(out.feasibleSlots).toBeGreaterThanOrEqual(0);
  });
});
