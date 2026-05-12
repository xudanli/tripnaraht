import type { TripPlan } from '../decision/plan-model';
import { augmentOverlayFramesWithPedestrianGaps } from './augment-overlay-pedestrian-gaps';

describe('augmentOverlayFramesWithPedestrianGaps', () => {
  it('adds stub frames for every slot when initial overlay is empty (walking-only plan)', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'a',
              time: '09:00',
              title: 'A',
              type: 'poi',
              coordinates: { lat: 48.86, lng: 2.35 },
            },
            {
              id: 'b',
              time: '11:00',
              title: 'B',
              type: 'poi',
              coordinates: { lat: 48.87, lng: 2.36 },
            },
          ],
        },
      ],
    };
    const out = augmentOverlayFramesWithPedestrianGaps(plan, []);
    expect(out).toHaveLength(2);
    expect(out.map(f => f.legId).sort()).toEqual(['a', 'b']);
    expect(out.every(f => f.finalExecutionState === 'EXECUTABLE')).toBe(true);
  });

  it('persistSyntheticTravelLegsOnPlan fills travelLegFromPrev for slots after the first on each day', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'first',
              time: '09:00',
              title: 'Hotel',
              type: 'hotel',
              coordinates: { lat: 48.86, lng: 2.35 },
            },
            {
              id: 'second',
              time: '10:00',
              title: 'Museum',
              type: 'poi',
              coordinates: { lat: 48.87, lng: 2.36 },
            },
          ],
        },
      ],
    };
    augmentOverlayFramesWithPedestrianGaps(plan, [], {
      persistSyntheticTravelLegsOnPlan: true,
    });
    expect(plan.days[0]!.timeSlots[0]!.travelLegFromPrev).toBeUndefined();
    expect(plan.days[0]!.timeSlots[1]!.travelLegFromPrev?.mode).toBe('walk');
    expect(plan.days[0]!.timeSlots[1]!.travelLegFromPrev?.source).toBe('eco_pedestrian_stub');
  });

  it('preserves existing frames and only fills gaps', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            { id: 'x', time: '09:00', title: 'X', type: 'poi' },
            { id: 'y', time: '10:00', title: 'Y', type: 'poi' },
          ],
        },
      ],
    };
    const existing = [
      {
        schemaVersion: '1' as const,
        legId: 'x',
        route: {
          legId: 'x',
          terrainDifficulty: 'LOW' as const,
          weatherExposure: {},
          roadAccessibility: { fRoad: false },
          executionReliability: 0.9,
          estimatedDelayFactor: 1,
          executionState: 'EXECUTABLE' as const,
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 0,
        },
        weather: { severity: 'LOW' as const, delayFactor: 1 },
        road: { blocked: false, fRoadConstraint: false },
        repair: { recommended: false },
        finalExecutionState: 'EXECUTABLE' as const,
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.9,
      },
    ];
    const out = augmentOverlayFramesWithPedestrianGaps(plan, existing as any);
    expect(out).toHaveLength(2);
    expect(out.find(f => f.legId === 'x')).toBeDefined();
    expect(out.find(f => f.legId === 'y')?.repair.type).toBe('PEDESTRIAN_STUB');
  });
});
