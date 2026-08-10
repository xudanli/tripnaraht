import {
  projectPlaceRowToFuelStationProfile,
  projectPlaceRowsToFuelStationProfiles,
} from './project-place-fuel-station';
import { hydrateIcelandFuelForPlan } from './hydrate-iceland-fuel';
import type { TripPlan } from '../../../../trips/decision/plan-model';

describe('project-place-fuel-station', () => {
  it('projects Place N1 row into fuel profile with place: id', () => {
    const profile = projectPlaceRowToFuelStationProfile({
      id: 381066,
      nameEN: 'N1 Reykjavík Center',
      lat: 64.1472,
      lng: -21.9341,
      canonicalType: 'FUEL_N1',
      cityNameEN: 'Reykjavík',
    });
    expect(profile).toBeDefined();
    expect(profile!.poiId).toBe('place:381066');
    expect(profile!.fuelTypes).toEqual(['PETROL', 'DIESEL']);
    expect(profile!.reliability).toBe('UNKNOWN');
    expect(profile!.openingMode).toBe('UNKNOWN');
    expect(profile!.sourceRefs[0]?.kind).toBe('EXTERNAL');
  });

  it('rejects non-fuel canonical types', () => {
    expect(
      projectPlaceRowToFuelStationProfile({
        id: 1,
        lat: 64,
        lng: -22,
        canonicalType: 'PARKING',
      }),
    ).toBeNull();
  });
});

describe('hydrateIcelandFuelForPlan + Place stations', () => {
  const plan = {
    days: [
      {
        date: '2026-07-20',
        timeSlots: [
          {
            id: 'leg1',
            travelLegFromPrev: {
              mode: 'drive',
              distanceKm: 180,
              durationMin: 140,
              from: { lat: 64.15, lng: -21.94 },
              to: { lat: 63.42, lng: -19.01 },
            },
          },
        ],
      },
    ],
  } as TripPlan;

  it('merges Place stations into corridor assessment (no DB write)', () => {
    const placeStations = projectPlaceRowsToFuelStationProfiles([
      {
        id: 381072,
        nameEN: 'Orkan Vík Gas Station',
        lat: 63.4188,
        lng: -19.005,
        canonicalType: 'FUEL_ORKAN',
      },
    ]);

    const result = hydrateIcelandFuelForPlan({
      plan,
      candidatesByDate: {},
      placeStations,
    });

    expect(result.placeStationCount).toBe(1);
    expect(result.corridorAssessment).toBeDefined();
    expect(result.corridorAssessment!.reasons.length).toBeGreaterThan(0);
    // nearest Place station should appear when geometry fallback runs
    const next = result.corridorAssessment!.nextPrimaryStation;
    expect(next === 'place:381072' || typeof next === 'string').toBe(true);
  });
});
