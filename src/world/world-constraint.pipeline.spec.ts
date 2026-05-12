import { WorldConstraintStore } from './world-constraint.store';
import { applyWorldEvent } from './world-constraint.pipeline';

describe('applyWorldEvent', () => {
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
            poiId: 'poi-x',
          },
        ],
      },
    ],
  };

  it('writes ROAD field and emits diff with affected slots when linked', () => {
    const store = new WorldConstraintStore();
    const out = applyWorldEvent(
      store,
      {
        kind: 'ROAD',
        roadId: 'F208',
        status: 'IMPASSABLE',
        at: 1,
        affectedSlotIds: ['s1'],
      },
      { tripPlan },
    );
    expect(store.roads.get('F208')?.state).toBe('CLOSED');
    expect(out.diff.affectedSlots).toContain('s1');
    expect(out.diff.domains).toContain('ROAD');
    expect(out.emittedKind).toBe('WORLD_CONSTRAINT_DIFF');
  });

  it('maps WEATHER date to slots on that calendar day', () => {
    const store = new WorldConstraintStore();
    const out = applyWorldEvent(
      store,
      {
        kind: 'WEATHER',
        date: '2026-06-01',
        violation: 'HARD',
        at: 2,
      },
      { tripPlan },
    );
    expect(out.diff.affectedSlots).toContain('s1');
    expect(store.weather.get('2026-06-01')?.type).toBe('WEATHER');
  });
});
