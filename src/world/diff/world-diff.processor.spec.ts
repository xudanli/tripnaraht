import { WorldConstraintStore } from '../world-constraint.store';
import { processWorldDiff } from './world-diff.processor';

describe('processWorldDiff', () => {
  const tripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'slot-a',
            time: '09:00',
            title: 'X',
            type: 'nature' as const,
            poiId: 'poi-1',
          },
        ],
      },
    ],
  };

  it('applies contract and computes constraint diff + propagation', () => {
    const store = new WorldConstraintStore();
    const r = processWorldDiff(
      {
        id: 'c1',
        domain: 'WEATHER',
        type: 'STATE_CHANGE',
        entityId: '2026-06-01',
        stateBefore: 'OPEN',
        stateAfter: 'DEGRADED_HARD',
        severity: 'MEDIUM',
        temporalScope: {
          start: '2026-06-01T00:00:00.000Z',
          end: '2026-06-01T23:59:59.999Z',
        },
        impactedSlots: [],
        propagationHint: 'GLOBAL',
        source: 'SYSTEM',
      },
      store,
      { tripPlan },
    );

    expect(store.weather.get('2026-06-01')).toBeDefined();
    expect(r.constraintDiff.domains).toContain('WEATHER');
    expect(r.propagatedSlotIds).toContain('slot-a');
    expect(r.needsReplan).toBe(true);
  });
});
