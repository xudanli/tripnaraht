/**
 * TEAM / Booking ROR + mergedSeeds FetchHost 单测。
 */

import { extractTeamFactsFromTripMeta } from './team-ror-loader.util';
import { deriveBookingFactsFromDayItems } from './booking-ror-loader.util';
import { loadTripDaySeedForRor } from './trip-day-ror-loader.util';
import {
  buildRorSeedFacts,
  createObservationFetchHost,
} from './observation-seed.builder';
import { runRealityObservationRuntime } from './reality-observation.runtime';
import type { RorFetchHost } from './reality-observation.types';

describe('team-ror-loader', () => {
  it('从 wizard + collaborators 解析 participants', () => {
    const facts = extractTeamFactsFromTripMeta({
      collaboratorCount: 3,
      metadata: {
        icelandSelfDrive: {
          wizard: { travelerCount: 4, hasChildren: true },
          drivingSettings: {
            drivers: [{ experienceLevel: 'INTERMEDIATE' }],
          },
        },
        party: { fitnessProfile: 'MODERATE' },
      },
    });
    expect(facts.participants.travelerCount).toBe(4);
    expect(facts.participants.hasChildren).toBe(true);
    expect(facts.participants.collaboratorCount).toBe(3);
    expect(facts['team.memberCapability'].tags).toEqual(
      expect.arrayContaining(['CHILDREN', 'FITNESS:MODERATE']),
    );
  });
});

describe('booking-ror-loader', () => {
  it('推导 fixedCommitments 与 availability', () => {
    const facts = deriveBookingFactsFromDayItems([
      {
        id: 'i1',
        title: '冰川徒步',
        bookingStatus: 'confirmed',
        ExperienceDefinition: { requiresGuide: true },
      },
      {
        id: 'i2',
        title: '黑沙滩',
        bookingStatus: null,
      },
      {
        id: 'i3',
        title: '雪地摩托',
        bookingStatus: null,
        ExperienceDefinition: { requiresLicense: true },
      },
    ]);
    expect(facts['booking.fixedCommitments']).toHaveLength(1);
    expect(facts['booking.availability'].fixedCount).toBe(1);
    expect(facts['booking.availability'].openCount).toBeGreaterThanOrEqual(1);
    expect(facts['booking.availability'].provider).toBe('ITINERARY_BOOKING_STATUS');
  });
});

describe('trip-day team+booking + mergedSeeds host', () => {
  it('种子含 participants / booking.availability，外部 host 作回退', async () => {
    const prisma = {
      tripDay: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            date: new Date('2026-08-10'),
            ItineraryItem: [
              {
                id: 'i1',
                type: 'ACTIVITY',
                note: '冰川徒步',
                bookingStatus: 'confirmed',
                Place: { nameCN: '冰川' },
                ExperienceDefinition: {
                  id: 'e1',
                  displayNameZh: '冰川徒步',
                  fitnessLevel: 'MODERATE',
                  requiresGuide: true,
                },
              },
            ],
          },
        ]),
      },
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          destination: 'IS',
          metadata: {
            productLine: 'iceland_self_drive',
            icelandSelfDrive: {
              productLine: 'iceland_self_drive',
              wizard: { travelerCount: 2 },
              drivingSettings: {
                vehicle: { is4wd: false, rentalRestrictions: ['no_f_road'] },
              },
            },
          },
        }),
      },
      tripCollaborator: {
        count: jest.fn().mockResolvedValue(2),
      },
    };

    const seed = await loadTripDaySeedForRor(prisma as any, 't1', 1);
    expect(seed?.participants).toEqual(
      expect.objectContaining({ travelerCount: 2, collaboratorCount: 2 }),
    );
    expect(seed?.bookingAvailability).toEqual(
      expect.objectContaining({ fixedCount: 1, provider: 'ITINERARY_BOOKING_STATUS' }),
    );

    const seeds = buildRorSeedFacts({
      scope: { tripId: 't1', dayIndex: 1, message: '把活动加到第1天' },
      tripDay: seed,
    });
    expect(seeds.byKey['participants']).toBeTruthy();
    expect(seeds.byKey['booking.availability']).toBeTruthy();
    expect(seeds.byKey['booking.fixedCommitments']).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'i1' })]),
    );

    let weatherHits = 0;
    const external: RorFetchHost = {
      fetchByServiceKey: async (serviceKey, contextKey) => {
        if (serviceKey === 'WEATHER' && contextKey === 'weather.forecast') {
          weatherHits += 1;
          return { city: 'Reykjavik', provider: 'OPEN_METEO', temperature_c: 7 };
        }
        // 若错误地只读 sparse seeds，会丢 vehicle
        return null;
      },
    };

    const wrapped = createObservationFetchHost({
      seeds,
      fallback: external,
    });
    expect(await wrapped.fetchByServiceKey('TRIP', 'vehicle.driveType', {})).toBe('2WD');
    expect(
      await wrapped.fetchByServiceKey('WEATHER', 'weather.forecast', { message: 'x' }),
    ).toEqual(expect.objectContaining({ provider: 'OPEN_METEO' }));
    expect(weatherHits).toBe(1);

    const ror = await runRealityObservationRuntime({
      message: '把冰川徒步加到第1天',
      scope: { tripId: 't1', dayIndex: 1, message: '把冰川徒步加到第1天' },
      tripDay: seed,
      host: external,
      travelMode: 'SELF_DRIVE',
      containsReservableActivity: true,
      containsOutdoorActivity: true,
    });
    expect(ror.skipped).toBe(false);
    expect(ror.snapshot?.observedFacts.some((f) => f.key === 'participants')).toBe(true);
    expect(
      ror.snapshot?.observedFacts.some((f) => f.key === 'booking.availability'),
    ).toBe(true);
  });
});
