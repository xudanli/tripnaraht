import {
  enrichRouteFactsWithDaylightDriving,
  resolveIcelandCivilTwilightMinutes,
} from './enrich-iceland-route-facts-daylight';
import {
  attachIcelandSelfDriveRouteFactsToState,
  buildIcelandSelfDriveRouteFactsFromTripState,
} from './write-iceland-self-drive-route-facts';
import { buildIcelandSelfDriveSituationFromTripState } from './hydrate-iceland-self-drive-situation';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import type { TripPlan } from '../../../../trips/decision/plan-model';

function baseState(overrides?: Partial<TripWorldState>): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-12-15',
      durationDays: 5,
      tripId: 'trip_dl_1',
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {},
    signals: {},
    policies: { vehicleClass: 'SEDAN' },
    ...overrides,
  } as TripWorldState;
}

describe('enrichRouteFactsWithDaylightDriving', () => {
  it('resolves civil twilight via SunCalc for Reykjavík winter', () => {
    const t = resolveIcelandCivilTwilightMinutes({ date: '2026-12-15' });
    expect(t).toBeDefined();
    expect(t!.civilDawnLocalMin).toBeGreaterThan(0);
    expect(t!.civilDuskLocalMin).toBeGreaterThan(t!.civilDawnLocalMin);
    // Mid-December: dusk well before 18:00 local
    expect(t!.civilDuskLocalMin).toBeLessThan(18 * 60);
  });

  it('computes night exposure from slot finish after civil dusk', () => {
    const twilight = resolveIcelandCivilTwilightMinutes({ date: '2026-12-15' })!;
    const plan = {
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 's1',
              time: '20:00',
              endTime: '20:00',
              title: 'Hotel',
              type: 'LODGING',
              travelLegFromPrev: {
                from: { lat: 64.14, lng: -21.9 },
                to: { lat: 64.15, lng: -21.8 },
                durationMin: 90,
              },
            },
          ],
        },
      ],
    } as TripPlan;

    const enriched = enrichRouteFactsWithDaylightDriving({
      facts: { roadSegmentIds: ['RING_ROAD'] },
      plan,
    });

    expect(enriched.daylightDriving?.civilDuskLocalMin).toBe(
      twilight.civilDuskLocalMin,
    );
    expect(enriched.daylightDriving?.sameDayDriveMinutes).toBe(90);
    expect(enriched.daylightDriving?.nightExposureMinutes).toBe(
      20 * 60 - twilight.civilDuskLocalMin,
    );
    expect(enriched.isNight).toBe(true);
  });

  it('does not overwrite explicit upstream daylightDriving fields', () => {
    const enriched = enrichRouteFactsWithDaylightDriving({
      facts: {
        daylightDriving: {
          nightExposureMinutes: 12,
          civilDawnLocalMin: 100,
          civilDuskLocalMin: 200,
          sameDayDriveMinutes: 30,
        },
      },
      plan: {
        days: [
          {
            day: 1,
            date: '2026-12-15',
            timeSlots: [
              {
                id: 's1',
                time: '22:00',
                endTime: '22:00',
                title: 'x',
                type: 'LODGING',
                travelLegFromPrev: {
                  from: { lat: 64.1, lng: -21.9 },
                  to: { lat: 64.2, lng: -21.8 },
                  durationMin: 180,
                },
              },
            ],
          },
        ],
      } as TripPlan,
    });
    expect(enriched.daylightDriving?.nightExposureMinutes).toBe(12);
    expect(enriched.daylightDriving?.civilDawnLocalMin).toBe(100);
    expect(enriched.daylightDriving?.sameDayDriveMinutes).toBe(30);
  });

  it('detects next-morning locked booking', () => {
    const plan = {
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 's1',
              time: '16:00',
              title: 'Drive',
              type: 'TRANSIT',
              travelLegFromPrev: {
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 60,
              },
            },
          ],
        },
        {
          day: 2,
          date: '2026-12-16',
          timeSlots: [
            {
              id: 's2',
              time: '08:30',
              title: 'Glacier walk',
              type: 'ACTIVITY',
              locked: true,
            },
          ],
        },
      ],
    } as TripPlan;

    const enriched = enrichRouteFactsWithDaylightDriving({
      facts: {},
      plan,
    });
    expect(enriched.daylightDriving?.nextMorningBooking).toBe(true);
  });
});

describe('write-iceland-self-drive-route-facts daylight + F-road ids', () => {
  it('writes daylightDriving on attach via SunCalc', () => {
    const state = baseState();
    const plan = {
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 's1',
              time: '19:30',
              endTime: '19:30',
              title: 'Hotel',
              type: 'LODGING',
              travelLegFromPrev: {
                from: { lat: 64.14, lng: -21.9 },
                to: { lat: 63.4, lng: -19.0 },
                durationMin: 240,
              },
            },
          ],
        },
      ],
    } as TripPlan;

    const facts = attachIcelandSelfDriveRouteFactsToState({ state, plan });
    expect(facts?.daylightDriving?.civilDuskLocalMin).toBeDefined();
    expect(facts?.daylightDriving?.sameDayDriveMinutes).toBe(240);
    expect(
      (facts?.daylightDriving?.nightExposureMinutes ?? 0) > 0,
    ).toBe(true);

    const situation = buildIcelandSelfDriveSituationFromTripState({
      state,
      plan,
    });
    expect(situation?.daylightLoad).toBeDefined();
    expect(situation?.daylightLoad?.nightExposureMinutes).toBeGreaterThan(0);
  });

  it('pins pack HIGHLAND_F_ROAD id when hasFRoad but no fRoadIds', () => {
    const state = baseState({
      policies: {
        vehicleClass: 'SEDAN',
        hasFRoad: true,
      } as never,
    });
    const facts = buildIcelandSelfDriveRouteFactsFromTripState({ state });
    expect(facts?.routeFlags?.hasFRoad).toBe(true);
    expect(facts?.roadSegmentIds?.[0]).toMatch(/^F\d+/i);
  });
});
