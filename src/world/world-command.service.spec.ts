import { WorldConstraintStore } from './world-constraint.store';
import { applyWorldCommand } from './world-command.service';

describe('applyWorldCommand', () => {
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

  it('BLOCK_ROAD delegates to pipeline and links affected slots', () => {
    const store = new WorldConstraintStore();
    const out = applyWorldCommand(
      store,
      {
        type: 'BLOCK_ROAD',
        roadId: 'F208',
        affectedSlotIds: ['s1'],
      },
      { tripPlan, atMs: 1 },
    );
    expect(store.roads.get('F208')?.state).toBe('CLOSED');
    expect(out.diff.affectedSlots).toContain('s1');
    expect(out.sourceEvent?.kind).toBe('ROAD');
    expect(out.command.type).toBe('BLOCK_ROAD');
  });

  it('LOCK_POI marks booking policy and expands to slots for that POI', () => {
    const store = new WorldConstraintStore();
    const out = applyWorldCommand(
      store,
      { type: 'LOCK_POI', poiId: 'poi-x' },
      { tripPlan, atMs: 2 },
    );
    expect(store.bookings.get(`USER_LOCK_POI:poi-x`)?.userPolicy?.kind).toBe(
      'POI_LOCK',
    );
    expect(out.diff.affectedSlots).toContain('s1');
  });

  it('ADD_DRIVING_CONSTRAINT tags global driving soft cap across all slots', () => {
    const store = new WorldConstraintStore();
    const out = applyWorldCommand(
      store,
      {
        type: 'ADD_DRIVING_CONSTRAINT',
        constraint: { maxMountainRoadRatio: 0.2 },
      },
      { tripPlan, atMs: 3 },
    );
    expect(store.bookings.get('USER_POLICY_DRIVING')?.userPolicy?.kind).toBe(
      'DRIVING_SOFT_CAP',
    );
    expect(out.diff.affectedSlots).toContain('s1');
  });
});
