import {
  bootstrapIcelandSelfDriveMetadata,
  isIcelandSelfDriveProductTrip,
} from './iceland-self-drive-metadata-hydrate.util';

describe('iceland-self-drive-metadata-hydrate', () => {
  it('detects productLine iceland_self_drive', () => {
    expect(
      isIcelandSelfDriveProductTrip({ productLine: 'iceland_self_drive' }),
    ).toBe(true);
    expect(isIcelandSelfDriveProductTrip({ productLine: 'other' })).toBe(false);
  });

  it('detects legacy IS trips with readiness / vehicle confirm stamps', () => {
    expect(
      isIcelandSelfDriveProductTrip({
        selfDriveReadiness: { contextVersion: 3 },
      }),
    ).toBe(true);
    expect(
      isIcelandSelfDriveProductTrip({ vehicleConfirmedAt: '2026-07-15T16:44:16.906Z' }),
    ).toBe(true);
    expect(
      isIcelandSelfDriveProductTrip(
        { constraints: { vehicleType: '4WD', fRoadAllowed: false } },
        'IS',
      ),
    ).toBe(true);
    expect(
      isIcelandSelfDriveProductTrip({ constraints: { vehicleType: '4WD' } }, 'NZ'),
    ).toBe(false);
  });

  it('bootstraps drivingSettings when blob missing', () => {
    const isd = bootstrapIcelandSelfDriveMetadata({
      tripId: 'trip_x',
      startDate: '2027-02-21',
      endDate: '2027-03-01',
      destination: 'IS',
      existingMeta: { productLine: 'iceland_self_drive' },
    });
    expect(isd.productLine).toBe('iceland_self_drive');
    expect(isd.wizard.dateRange.startDate).toBe('2027-02-21');
    expect(isd.drivingSettings.vehicle.acquisition).toBe('rent');
    expect(isd.drivingSettings.insurance.configured).toBe(false);
  });

  it('returns existing blob unchanged', () => {
    const existing = bootstrapIcelandSelfDriveMetadata({
      tripId: 't1',
      existingMeta: { productLine: 'iceland_self_drive' },
    });
    const again = bootstrapIcelandSelfDriveMetadata({
      tripId: 't1',
      existingMeta: {
        productLine: 'iceland_self_drive',
        icelandSelfDrive: existing,
      },
    });
    expect(again.contextVersion).toBe(existing.contextVersion);
  });
});
