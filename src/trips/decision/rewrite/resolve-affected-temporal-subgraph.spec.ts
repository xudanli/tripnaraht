import { buildUnifiedConstraintGraph } from '../constraint-graph/build-unified-constraint-graph';
import type { TripPlan } from '../plan-model';
import { resolveAffectedTemporalSubgraph } from './resolve-affected-temporal-subgraph';

describe('resolveAffectedTemporalSubgraph', () => {
  const plan: TripPlan = {
    tripId: 't1',
    routeDirectionId: 'rd1',
    days: [
      {
        date: '2026-06-01',
        timeSlots: [
          { id: 's1', type: 'sightseeing', time: '09:00', title: 'A' },
          { id: 's2', type: 'transport', time: '12:00', title: 'B' },
        ],
      },
      {
        date: '2026-06-02',
        timeSlots: [{ id: 's3', type: 'hotel', time: '18:00', title: 'C' }],
      },
    ],
    segments: [],
    temporal: {
      emittedAt: '2026-06-01T00:00:00Z',
      constraintEdges: [
        {
          id: 'e1',
          kind: 'SEQUENCE',
          fromSlotId: 's1',
          toSlotId: 's2',
          date: '2026-06-01',
        },
        {
          id: 'e2',
          kind: 'CROSS_DAY_HANDOFF',
          fromSlotId: 's2',
          toSlotId: 's3',
          date: '2026-06-01',
        },
      ],
      timeDrifts: [],
    },
  };

  it('walks unified graph from seed slot to downstream slots/dates', () => {
    const graph = buildUnifiedConstraintGraph(plan);
    const sub = resolveAffectedTemporalSubgraph({
      graph,
      anchor: { dates: ['2026-06-01'], seedSlotIds: ['s1'] },
    });
    expect(sub.slotIds).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    expect(sub.dates).toEqual(expect.arrayContaining(['2026-06-01', '2026-06-02']));
  });

  it('falls back to anchor when graph missing', () => {
    const sub = resolveAffectedTemporalSubgraph({
      anchor: { dates: ['2026-06-01'], seedSlotIds: ['s1'] },
    });
    expect(sub).toEqual({ dates: ['2026-06-01'], slotIds: ['s1'] });
  });
});
