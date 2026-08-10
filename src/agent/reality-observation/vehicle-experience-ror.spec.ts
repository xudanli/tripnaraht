/**
 * Vehicle / Experience ROR 装载单测。
 */

import {
  extractVehicleFactsFromTripMetadata,
  isSelfDriveTripMetadata,
} from './vehicle-ror-loader.util';
import {
  extractExperienceFactsFromDayItems,
  mapExperienceDefinitionToProduct,
} from './experience-ror-loader.util';
import { loadTripDaySeedForRor } from './trip-day-ror-loader.util';
import { buildRorSeedFacts } from './observation-seed.builder';
import { buildObservationPlan } from './observation-plan.builder';
import { runObservationLoop } from './observation-executor';

describe('vehicle-ror-loader', () => {
  it('从 ISD drivingSettings 解析 2WD + no_f_road', () => {
    const facts = extractVehicleFactsFromTripMetadata({
      productLine: 'iceland_self_drive',
      icelandSelfDrive: {
        productLine: 'iceland_self_drive',
        drivingSettings: {
          vehicle: {
            is4wd: false,
            vehicleClass: 'compact',
            rentalRestrictions: ['no_f_road', 'no_wading'],
            acquisition: 'rent',
          },
        },
      },
    });
    expect(facts?.['vehicle.driveType']).toBe('2WD');
    expect(facts?.['vehicle.rentalRestriction']).toEqual(
      expect.objectContaining({ froad: false, wading: false }),
    );
    expect(facts?.['vehicle.profile'].source).toBe('ISD_DRIVING_SETTINGS');
    expect(isSelfDriveTripMetadata({ productLine: 'iceland_self_drive' })).toBe(true);
  });
});

describe('experience-ror-loader', () => {
  it('仅映射已绑定 ExperienceDefinition', () => {
    expect(extractExperienceFactsFromDayItems([{ id: 'i1' }])).toEqual({});
    const mapped = mapExperienceDefinitionToProduct({
      id: 'e1',
      code: 'GLACIER_HIKE',
      displayNameZh: '冰川徒步',
      fitnessLevel: 'MODERATE',
      typicalDurationMin: 180,
    });
    expect(mapped.title).toContain('冰川');
    const facts = extractExperienceFactsFromDayItems([
      {
        id: 'i1',
        ExperienceDefinition: {
          id: 'e1',
          displayNameZh: '冰川徒步',
          fitnessLevel: 'MODERATE',
        },
      },
    ]);
    expect(facts['experience.product']).toEqual(
      expect.objectContaining({ title: '冰川徒步', source: 'EXPERIENCE_DEFINITION' }),
    );
    expect(facts['experience.physicalIntensity']).toBe('MODERATE');
  });
});

describe('trip-day vehicle+experience seed', () => {
  it('loadTripDaySeedForRor 写入车辆与体验，未绑定不臆造 product', async () => {
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
                travelFromPreviousDuration: 90,
                Place: { nameCN: '索海玛冰川', metadata: { lat: 63.4, lng: -19.0 } },
                ExperienceDefinition: {
                  id: 'e1',
                  code: 'GLACIER_HIKE',
                  displayNameZh: '冰川徒步',
                  fitnessLevel: 'MODERATE',
                  typicalDurationMin: 180,
                },
              },
              {
                id: 'i2',
                type: 'ACTIVITY',
                note: '黑沙滩散步',
                Place: { nameCN: '雷尼斯黑沙滩' },
              },
            ],
          },
          {
            id: 'd2',
            date: new Date('2026-08-11'),
            ItineraryItem: [],
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
                vehicle: {
                  is4wd: true,
                  vehicleClass: 'suv',
                  rentalRestrictions: [],
                },
              },
            },
          },
        }),
      },
    };

    const seed = await loadTripDaySeedForRor(prisma as any, 't1', 1);
    expect(seed?.travelMode).toBe('SELF_DRIVE');
    expect(seed?.vehicleDriveType).toBe('4WD');
    expect(seed?.remainingDays).toBe(1);
    expect(seed?.experienceProduct).toEqual(
      expect.objectContaining({ title: '冰川徒步' }),
    );
    expect(seed?.experiencePhysicalIntensity).toBe('MODERATE');
    expect(seed?.weatherCityHint).toBe('Vik');

    const seeds = buildRorSeedFacts({
      scope: { tripId: 't1', dayIndex: 1, message: '这条南岸路现在能不能走' },
      tripDay: seed,
    });
    expect(seeds.byKey['vehicle.profile']).toBeTruthy();
    expect(seeds.byKey['vehicle.driveType']).toBe('4WD');
    expect(seeds.byKey['experience.product']).toBeTruthy();
    expect(seeds.byKey['trip.destination']).toBe('IS');

    const plan = buildObservationPlan({
      message: '这条南岸路现在能不能走',
      scope: { tripId: 't1', dayIndex: 1, message: '这条南岸路现在能不能走' },
      travelMode: 'SELF_DRIVE',
    });
    const state = await runObservationLoop(plan!, seeds);
    expect(state.observedFacts.some((f) => f.key === 'vehicle.profile')).toBe(true);
    expect(state.observedFacts.some((f) => f.key === 'vehicle.driveType')).toBe(true);
  });
});
