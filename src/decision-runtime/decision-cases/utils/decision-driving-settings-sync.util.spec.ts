import {
  mapDecisionVehicleTypeToClass,
  mapVehicleClassToDecisionType,
  mirrorDecisionWritebackIntoDrivingSettings,
  mirrorDrivingSettingsIntoConstraints,
} from './decision-driving-settings-sync.util';

describe('decision-driving-settings-sync', () => {
  it('maps 2WD / 4WD to vehicle classes', () => {
    expect(mapDecisionVehicleTypeToClass('2WD').vehicleClass).toBe('sedan_2wd');
    expect(mapDecisionVehicleTypeToClass('4WD').vehicleClass).toBe('suv_4wd');
    expect(mapDecisionVehicleTypeToClass('4WD').is4wd).toBe(true);
  });

  it('maps vehicleClass back to decision type', () => {
    expect(mapVehicleClassToDecisionType('suv_4wd')).toBe('4WD');
    expect(mapVehicleClassToDecisionType('sedan_2wd')).toBe('2WD');
  });

  it('mirrors decision vehicle writeback into drivingSettings', () => {
    const next = mirrorDecisionWritebackIntoDrivingSettings({
      icelandSelfDrive: {
        productLine: 'iceland_self_drive',
        drivingSettings: { vehicle: { acquisition: 'rent' } },
      },
      writebackTargets: ['VEHICLE'],
      payload: { vehicleType: '4WD', fRoadAllowed: true },
    });
    const vehicle = (next?.drivingSettings as any)?.vehicle;
    expect(vehicle.vehicleClass).toBe('suv_4wd');
    expect(vehicle.is4wd).toBe(true);
    expect(vehicle.lifecycleStatus).toBe('model_confirmed');
    expect(vehicle.rentalRestrictions ?? []).not.toContain('no_f_road');
  });

  it('mirrors insurance writeback into drivingSettings', () => {
    const next = mirrorDecisionWritebackIntoDrivingSettings({
      icelandSelfDrive: { drivingSettings: {} },
      writebackTargets: ['INSURANCE'],
      payload: { coverageTier: 'FULL', fordingExcluded: true },
    });
    const insurance = (next?.drivingSettings as any)?.insurance;
    expect(insurance.configured).toBe(true);
    expect(insurance.preferredUpgradeCodes).toContain('tier_full');
    expect(insurance.userAcknowledgedCodes).toContain('fording_excluded');
  });

  it('mirrors drivingSettings into constraints', () => {
    const constraints = mirrorDrivingSettingsIntoConstraints({
      constraints: {},
      drivingSettings: {
        vehicle: {
          vehicleClass: 'suv_4wd',
          is4wd: true,
          rentalRestrictions: [],
        },
        insurance: {
          configured: true,
          preferredUpgradeCodes: ['tier_standard'],
          userAcknowledgedCodes: ['fording_excluded'],
        },
        routePreference: {
          fRoadPreference: 'avoid',
          dailyDrivingLimitHours: 7,
        },
      },
    });
    expect(constraints.vehicle_type).toBe('4WD');
    expect(constraints.insurance_coverage_tier).toBe('STANDARD');
    expect(constraints.insurance_fording_excluded).toBe(true);
    expect(constraints.excludeFRoad).toBe(true);
    expect(constraints.fRoadAllowed).toBe(false);
    expect(constraints.maxDailyDriveHours).toBe(7);
  });
});
