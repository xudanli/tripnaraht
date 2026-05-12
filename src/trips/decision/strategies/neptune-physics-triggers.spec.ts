import { collectPhysicsFirstTriggers } from './neptune-physics-triggers';
import type { PhysicsFieldIndex } from '../../physics/unified-physics-field-index.types';
import type { TripPlan } from '../plan-model';

describe('collectPhysicsFirstTriggers', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'leg1',
            time: '09:00',
            title: 't',
            type: 'sightseeing',
            durationMin: 60,
          },
        ],
      },
    ],
  };

  it('emits PHYSICS_IMPASSABLE per impassable leg id', () => {
    const idx: PhysicsFieldIndex = {
      byLegId: {},
      byDate: {},
      byState: {
        STABLE: [],
        DEGRADED: [],
        UNSTABLE: [],
        IMPASSABLE: ['leg1'],
      },
    };
    const t = collectPhysicsFirstTriggers(idx, plan);
    expect(t).toHaveLength(1);
    expect(t[0]?.code).toBe('PHYSICS_IMPASSABLE');
    expect(t[0]?.slotId).toBe('leg1');
    expect(t[0]?.date).toBe('2026-06-01');
  });
});
