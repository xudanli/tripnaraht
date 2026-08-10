import {
  buildInitialDrivingSettings,
  computeCompletion,
  computeDrivingSettingsSummary,
} from './iceland-self-drive-completion.util';
import type { IcelandSelfDriveTripMetadata } from '../types/iceland-self-drive.types';

function baseMeta(
  overrides: Partial<IcelandSelfDriveTripMetadata> = {},
): IcelandSelfDriveTripMetadata {
  return {
    productLine: 'iceland_self_drive',
    idempotencyKey: 'k1',
    contextVersion: 'cv_1',
    wizard: {
      destinationCode: 'IS',
      productLine: 'iceland_self_drive',
      dateRange: { startDate: '2027-02-10', endDate: '2027-02-18' },
      arrivalAt: null,
      departureAt: null,
      travelerCount: 4,
      startLocationCode: 'keflavik',
      endLocationCode: 'keflavik',
      endSameAsStart: true,
      vehicleAcquisition: 'rent',
      regionIds: ['south_coast'],
      bookings: [],
      skipBookings: true,
      fillBookingsLater: false,
    },
    drivingSettings: buildInitialDrivingSettings('rent'),
    routeSkeleton: {
      strategyId: 'depth-south-coast',
      regionSummary: '南岸',
      days: [
        {
          date: '2027-02-10',
          corridorLabel: '南岸',
          overnightHint: '维克 / 南岸',
        },
      ],
    },
    hardAnchors: [],
    warnings: [],
    createdAt: '2027-01-01T00:00:00.000Z',
    generationStatus: 'READY',
    ...overrides,
  };
}

describe('iceland-self-drive-completion.util', () => {
  it('marks date range, skeleton, and skipBookings as done; vehicle/drivers pending', () => {
    const completion = computeCompletion(baseMeta());
    expect(completion.doneItems.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'check_date_range',
        'route_skeleton',
        'fix_bookings',
      ]),
    );
    expect(completion.pendingItems.map((i) => i.code)).toEqual([
      'confirm_vehicle_class',
      'set_driver_count',
      'confirm_daily_drive_limit',
    ]);
    expect(completion.progress).toBe(0.5);
  });

  it('fix_bookings when bookings present even without skipBookings', () => {
    const meta = baseMeta({
      wizard: {
        ...baseMeta().wizard,
        skipBookings: false,
        bookings: [
          {
            clientId: 'c1',
            kind: 'lodging',
            name: 'Hotel',
            startDate: '2027-02-10',
          },
        ],
      },
    });
    const completion = computeCompletion(meta);
    expect(completion.doneItems.some((i) => i.code === 'fix_bookings')).toBe(
      true,
    );
  });

  it('clears pending when vehicle and drivers filled', () => {
    const settings = buildInitialDrivingSettings('rent');
    settings.vehicle.vehicleClass = 'suv_4wd';
    settings.vehicle.is4wd = true;
    settings.drivers.driverCount = 2;
    settings.drivers.experienceLevel = 'intermediate';
    settings.drivers.dailyDrivingLimitHours = 5;

    const completion = computeCompletion(
      baseMeta({ drivingSettings: settings }),
    );
    expect(completion.pendingItems).toHaveLength(0);
    expect(completion.progress).toBe(1);

    const summary = computeDrivingSettingsSummary(settings);
    expect(summary.find((s) => s.code === 'vehicle')?.status).toBe('completed');
    expect(summary.find((s) => s.code === 'drivers')?.status).toBe('completed');
  });

  it('drivingSettingsSummary shows needs_confirm initially for vehicle/drivers', () => {
    const summary = computeDrivingSettingsSummary(
      buildInitialDrivingSettings('rent'),
    );
    expect(summary.find((s) => s.code === 'vehicle')?.status).toBe(
      'needs_confirm',
    );
    expect(summary.find((s) => s.code === 'drivers')?.status).toBe(
      'needs_confirm',
    );
    expect(summary.find((s) => s.code === 'fuel')?.status).toBe('pending');
    expect(summary.find((s) => s.code === 'insurance')?.status).toBe(
      'needs_confirm',
    );
  });
});
