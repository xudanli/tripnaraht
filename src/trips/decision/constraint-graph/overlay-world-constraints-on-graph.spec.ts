import { buildUnifiedConstraintGraph } from './build-unified-constraint-graph';
import { overlayWorldConstraintsOnUnifiedGraph } from './overlay-world-constraints-on-graph';
import type { TripPlan } from '../plan-model';
import type { WorldConstraintStoreSnapshot } from '../../../world/world-snapshot';

describe('overlayWorldConstraintsOnUnifiedGraph', () => {
  const plan: TripPlan = {
    tripId: 't1',
    routeDirectionId: 'rd1',
    days: [
      {
        date: '2026-06-01',
        timeSlots: [{ id: 's1', type: 'transport', time: '10:00', title: 'Drive' }],
      },
    ],
    segments: [],
    temporal: { emittedAt: '2026-06-01T00:00:00Z', constraintEdges: [], timeDrifts: [] },
  };

  it('adds overlay edges from closed road SSOT to affected slots', () => {
    const base = buildUnifiedConstraintGraph(plan);
    const snapshot: WorldConstraintStoreSnapshot = {
      version: 1,
      lastUpdatedAt: Date.now(),
      roads: {
        F206: {
          id: 'F206',
          type: 'ROAD',
          state: 'CLOSED',
          severity: 90,
          temporalScope: { start: '2026-06-01T00:00:00Z', end: '2026-06-01T23:59:59Z' },
          impactWeight: 1,
          version: 1,
          affectedSlotIds: ['s1'],
        },
      },
      weather: {},
      bookings: {},
    };
    const out = overlayWorldConstraintsOnUnifiedGraph(base, snapshot, plan);
    expect(out.stats.edgeCount).toBeGreaterThan(base.stats.edgeCount);
    expect(out.edges.some((e) => e.domain === 'ROAD_NETWORK')).toBe(true);
  });
});
