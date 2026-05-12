import { WorldConstraintStore } from './world-constraint.store';
import { applyRoadDiff } from './apply-road-diff';

describe('applyRoadDiff', () => {
  const tripPlan = {
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
            title: 'Hike',
            type: 'nature' as const,
            poiId: 'poi-a',
          },
        ],
      },
    ],
  };

  it('writes ROAD field and intersects slots from POI closure', () => {
    const store = new WorldConstraintStore();
    const out = applyRoadDiff(
      store,
      {
        roadId: 'F208',
        state: 'CLOSED',
        severity: 85,
        impactedEntities: {
          poiIds: ['poi-a'],
          blockedRoadIds: ['F208'],
        },
        requiresReplan: true,
      },
      { tripPlan, atMs: 1 },
    );
    expect(store.roads.get('F208')?.state).toBe('CLOSED');
    expect(out.diff.affectedSlots).toContain('s1');
    expect(out.diff.domains).toContain('ROAD');
  });

  it('maps RESTRICTED canonical state into store', () => {
    const store = new WorldConstraintStore();
    applyRoadDiff(
      store,
      {
        roadId: 'X',
        state: 'RESTRICTED',
        severity: 50,
        impactedEntities: { poiIds: [], blockedRoadIds: [] },
        requiresReplan: false,
      },
      { atMs: 2 },
    );
    expect(store.roads.get('X')?.state).toBe('RESTRICTED');
  });
});
