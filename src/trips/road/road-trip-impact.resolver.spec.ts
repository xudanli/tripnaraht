import type { RoadConstraintImpact } from '../../iceland-road/road-constraint.propagation';
import type { TripPlan } from '../decision/plan-model';
import { resolveTripImpact } from './road-trip-impact.resolver';

describe('resolveTripImpact', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-07-10',
        timeSlots: [
          {
            id: 'slot-a',
            time: '09:00',
            title: 'Hike',
            type: 'nature',
            poiId: 'LANDMANNALAUGAR',
          },
        ],
      },
      {
        day: 2,
        date: '2026-07-11',
        timeSlots: [
          {
            id: 'slot-b',
            time: '10:00',
            title: 'Other',
            type: 'sightseeing',
            poiId: 'OTHER_POI',
          },
        ],
      },
    ],
  };

  it('maps blocked POIs to days and slots', () => {
    const impact: RoadConstraintImpact = {
      affectedPOIs: ['LANDMANNALAUGAR'],
      blockedRoads: ['F208'],
      severity: 'HIGH',
      requiresReplan: true,
    };
    const ti = resolveTripImpact(impact, plan);
    expect(ti.affectedDays).toEqual(['2026-07-10']);
    expect(ti.affectedSlots).toEqual(['slot-a']);
    expect(ti.requiredActions.some((a) => a.type === 'MARK_INFEASIBLE')).toBe(
      true,
    );
    expect(ti.severity).toBe('HIGH');
  });
});
