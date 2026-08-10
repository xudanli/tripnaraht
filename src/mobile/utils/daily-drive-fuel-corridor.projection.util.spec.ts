import {
  buildLightTripPlanFromWaypoints,
  estimateTomorrowMorningKm,
  mapCorridorStationsToFuelRows,
  projectFuelStationsOntoTripCorridor,
} from './daily-drive-fuel-corridor.projection.util';
import type { IcelandFuelStationProfile } from '../../decision-runtime/packs/knowledge/fuel/iceland-fuel.types';

describe('daily-drive-fuel-corridor.projection.util', () => {
  const southCoast: IcelandFuelStationProfile[] = [
    {
      poiId: 'place:101',
      name: 'N1 Hvolsvöllur',
      lat: 63.7538,
      lng: -20.2257,
      fuelTypes: ['PETROL'],
      openingMode: 'ALWAYS_OPEN',
      remotenessLevel: 'RURAL',
      reliability: 'PARTIALLY_VERIFIED',
      sourceRefs: [],
    },
    {
      poiId: 'place:102',
      name: 'Olís Kirkjubæjarklaustur',
      lat: 63.7889,
      lng: -18.0503,
      fuelTypes: ['PETROL'],
      openingMode: 'SCHEDULED',
      remotenessLevel: 'RURAL',
      reliability: 'PARTIALLY_VERIFIED',
      sourceRefs: [],
    },
    {
      poiId: 'place:103',
      name: 'Orkan Höfn',
      lat: 64.2539,
      lng: -15.2121,
      fuelTypes: ['PETROL'],
      openingMode: 'ALWAYS_OPEN',
      remotenessLevel: 'REMOTE',
      reliability: 'UNKNOWN',
      sourceRefs: [],
    },
  ];

  it('builds light TripPlan drive legs from waypoints', () => {
    const plan = buildLightTripPlanFromWaypoints([
      {
        date: '2026-07-19',
        points: [
          { lat: 63.75, lng: -20.0 },
          { lat: 63.78, lng: -18.5 },
          { lat: 64.0, lng: -16.5 },
        ],
      },
    ]);
    expect(plan).toBeDefined();
    expect(plan!.days[0].timeSlots.length).toBe(3);
    const legs = plan!.days[0].timeSlots.filter((s) => s.travelLegFromPrev);
    expect(legs.length).toBe(2);
    expect(legs[0].travelLegFromPrev!.distanceKm).toBeGreaterThan(0);
  });

  it('projects Place stations onto south-coast style corridor', () => {
    const plan = buildLightTripPlanFromWaypoints([
      {
        date: '2026-07-19',
        points: [
          { lat: 63.74, lng: -20.4 },
          { lat: 63.75, lng: -19.5 },
          { lat: 63.79, lng: -18.0 },
          { lat: 64.2, lng: -15.5 },
        ],
      },
      {
        date: '2026-07-20',
        points: [
          { lat: 64.2, lng: -15.5 },
          { lat: 64.5, lng: -14.5 },
        ],
      },
    ]);
    expect(plan).toBeDefined();
    const hit = projectFuelStationsOntoTripCorridor({
      plan: plan!,
      placeStations: southCoast,
      maxStations: 3,
    });
    expect(hit.stations.length).toBeGreaterThanOrEqual(1);
    expect(hit.stations[0].tag).toBe('RECOMMENDED');
    expect(hit.stations[0].id).toMatch(/^place:/);
    expect(hit.nextStationKm).toBe(hit.stations[0].distanceKm);
    expect(hit.todayRemainingKm).toBeGreaterThan(0);
    expect(hit.placeStationCount).toBe(3);
  });

  it('maps corridor ahead rows to fuel station DTO tags', () => {
    const rows = mapCorridorStationsToFuelRows(
      southCoast.map((profile, i) => ({
        profile,
        distanceKm: 40 + i * 80,
      })),
      3,
    );
    expect(rows.map((r) => r.tag)).toEqual(['RECOMMENDED', 'RELIABLE', 'ALTERNATE']);
    expect(rows[0].durationZh).toContain('分钟');
  });

  it('clamps tomorrow morning estimate', () => {
    expect(estimateTomorrowMorningKm(0)).toBe(0);
    expect(estimateTomorrowMorningKm(50)).toBe(35);
    expect(estimateTomorrowMorningKm(200)).toBe(80);
  });
});
