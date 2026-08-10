import { buildInitialDrivingSettings } from './iceland-self-drive-completion.util';
import {
  buildDrivingSettingsResponse,
  buildRouteHint,
  bumpContextVersion,
  estimateGravelKm,
  mergeDrivingSettings,
} from './iceland-self-drive-driving-settings.util';

describe('iceland-self-drive-driving-settings.util', () => {
  it('estimates gravel km and builds GRAVEL_EXPOSURE hint', () => {
    expect(estimateGravelKm(['reykjanes'])).toBe(0);
    expect(buildRouteHint(['reykjanes'])).toBeNull();

    const hint = buildRouteHint(['south_coast', 'ring_road']);
    expect(hint?.code).toBe('GRAVEL_EXPOSURE');
    expect(hint?.gravelKm).toBe(54);
  });

  it('merges partial patch and bumps contextVersion', () => {
    const current = buildInitialDrivingSettings('rent');
    const next = mergeDrivingSettings(current, {
      vehicle: { vehicleClass: 'suv_4wd', is4wd: true },
      drivers: { driverCount: 2, dailyDrivingLimitHours: 5 },
    });
    expect(next.vehicle.acquisition).toBe('rent');
    expect(next.vehicle.vehicleClass).toBe('suv_4wd');
    expect(next.drivers.driverCount).toBe(2);
    expect(next.routePreference.gravelTolerance).toBe('moderate');
    expect(bumpContextVersion('cv_1')).toBe('cv_2');
    expect(bumpContextVersion('cv_9')).toBe('cv_10');
  });

  it('buildDrivingSettingsResponse marks vehicle/drivers completed after fill', () => {
    const settings = buildInitialDrivingSettings('rent');
    settings.vehicle.vehicleClass = 'suv_4wd';
    settings.vehicle.is4wd = true;
    settings.drivers.driverCount = 2;
    settings.drivers.dailyDrivingLimitHours = 5;
    settings.drivers.candidates = [
      {
        memberId: 'u1',
        isSelected: true,
        role: 'main',
        snowExperience: 'familiar',
        gravelExperience: 'average',
        nightAcceptance: 'avoid',
        isAdditionalDriver: false,
      },
    ];
    settings.fuel.configured = true;
    settings.insurance.configured = true;
    settings.insurance.userAcknowledgedCodes = ['wading'];

    const res = buildDrivingSettingsResponse({
      tripId: 't1',
      contextVersion: 'cv_2',
      settings,
      regionIds: ['south_coast'],
      members: [
        {
          memberId: 'u1',
          displayName: 'Danny',
          initial: 'D',
          avatarUrl: null,
        },
      ],
    });

    expect(res.items.find((i) => i.code === 'vehicle')?.status).toBe('completed');
    expect(res.items.find((i) => i.code === 'drivers')?.status).toBe('completed');
    expect(res.items.find((i) => i.code === 'fuel')?.code).toBe('fuel');
    expect(res.items.find((i) => i.code === 'insurance')?.payload.fordAlwaysExcluded).toBe(
      true,
    );
    expect(res.routeHint?.gravelKm).toBe(12);
    expect(res.items.find((i) => i.code === 'vehicle')?.payload.lifecycleStatus).toBe(
      'model_confirmed',
    );
  });

  it('buildRouteHint upgrades when rental blocks gravel/F-road', () => {
    const hint = buildRouteHint(['south_coast', 'ring_road'], {
      ...buildInitialDrivingSettings('rent').vehicle,
      rentalRestrictions: ['no_f_road'],
    });
    expect(hint?.code).toBe('GRAVEL_RESTRICTED');
  });
});
