import { resolveSelfDriveProfile } from './self-drive-profile.resolver';

describe('resolveSelfDriveProfile', () => {
  it('prefers Guide vehicleType over Exploration and Trip metadata', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      guideTravelContext: { vehicleType: '4x4' },
      explorationInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
        travelers: [{ type: 'ADULT' }],
        mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
        source: 'USER_CREATED',
      },
      tripMetadata: { constraints: { vehicle_type: '2WD' } },
    });

    expect(profile.vehicle.vehicleType).toBe('4WD');
  });

  it('normalizes Exploration mobilityContext when Guide is absent', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      explorationInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
        travelers: [{ type: 'ADULT' }],
        mobilityContext: { vehicleType: '4WD_SUV' },
        source: 'USER_CREATED',
      },
    });

    expect(profile.vehicle.vehicleType).toBe('4WD');
  });

  it('falls back to Trip metadata vehicle_type when higher-priority sources are absent', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      tripMetadata: { constraints: { vehicle_type: '4WD' } },
    });

    expect(profile.vehicle.vehicleType).toBe('4WD');
  });

  it('uses Iceland pack default 2WD when no vehicle source is provided', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
    });

    expect(profile.vehicle.vehicleType).toBe('2WD');
    expect(profile.vehicle.vehicleSource).toBe('PACK_DEFAULT');
    expect(profile.drivingPolicy.nightDrivingAllowed).toBe(false);
    expect(profile.rentalRestrictions?.map((r) => r.code)).toEqual([
      'NO_F_ROAD',
      'GRAVEL_ROAD_LIMITED',
    ]);
  });

  it('maps NO_NIGHT_DRIVING principle to avoid night driving', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      tripMetadata: {
        travelContext: {
          explorationArchive: { principles: ['NO_NIGHT_DRIVING'] },
        },
      },
    });

    expect(profile.drivingPolicy.nightDrivingAllowed).toBe(false);
    expect(profile.drivingPolicy.nightDrivingPreference).toBe('AVOID');
  });

  it('defaults driver experience to NOVICE_ABROAD and uses tripId as driverId', () => {
    const profile = resolveSelfDriveProfile({
      tripId: 'trip_abc',
      destinationCountry: 'IS',
    });

    expect(profile.drivers).toEqual([
      {
        driverId: 'trip_abc',
        experienceLevel: 'NOVICE_ABROAD',
        maxContinuousDriveMinutes: undefined,
      },
    ]);
  });

  it('reads maxDailyDriveMinutes from hours-only trip metadata constraints', () => {
    const profile = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      tripMetadata: {
        constraints: { maxDailyDrivingHours: 8 },
      },
    });

    expect(profile.drivingPolicy.maxDailyDriveMinutes).toBe(480);
  });

  it('converges three entry sources to the same profile for equivalent inputs', () => {
    const guide = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      guideTravelContext: { vehicleType: '2wd' },
      tripMetadata: {
        travelContext: {
          explorationArchive: { principles: ['NO_NIGHT_DRIVING'] },
        },
      },
    });

    const exploration = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      explorationInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
        travelers: [{ type: 'ADULT' }],
        mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
        source: 'USER_CREATED',
      },
      tripMetadata: {
        travelContext: {
          explorationArchive: { principles: ['NO_NIGHT_DRIVING'] },
        },
      },
    });

    const tripOnly = resolveSelfDriveProfile({
      destinationCountry: 'IS',
      tripMetadata: {
        constraints: { vehicle_type: '2WD' },
        travelContext: {
          explorationArchive: { principles: ['NO_NIGHT_DRIVING'] },
        },
      },
    });

    expect(guide.vehicle.vehicleType).toEqual(exploration.vehicle.vehicleType);
    expect(guide.vehicle.vehicleType).toEqual(tripOnly.vehicle.vehicleType);
    expect(guide.drivingPolicy).toEqual(exploration.drivingPolicy);
    expect(guide.drivingPolicy).toEqual(tripOnly.drivingPolicy);
  });
});
