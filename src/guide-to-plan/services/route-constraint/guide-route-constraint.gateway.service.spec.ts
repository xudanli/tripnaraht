import { GenericRoadConstraintPack } from './generic-road-constraint.pack';
import { GuideRouteConstraintGateway } from './guide-route-constraint.gateway.service';
import { IcelandRoadConstraintPack } from './iceland-road-constraint.pack';

describe('GuideRouteConstraintGateway', () => {
  const generic = new GenericRoadConstraintPack();
  const iceland = new IcelandRoadConstraintPack();
  const gateway = new GuideRouteConstraintGateway(generic, iceland);

  it('uses generic pack for unknown country', async () => {
    const result = await gateway.assessDayRoute({
      countryCode: 'JP',
      placeNames: ['东京塔'],
      drivingMinutes: 120,
      routeExists: true,
    });
    expect(result.level).toBe('route_recommended');
    expect(result.legallyAllowed).toBe(true);
  });

  it('uses iceland pack for IS', async () => {
    const result = await gateway.assessDayRoute({
      countryCode: 'IS',
      travelDate: '2026-03-15',
      placeNames: ['Landmannalaugar'],
      drivingMinutes: 120,
      routeExists: true,
      travelContext: { vehicleType: '2wd', transportMode: 'self_drive' },
    });
    expect(result.legallyAllowed).toBe(false);
    expect(gateway.resolvePack('IS')).toBe(iceland);
    expect(gateway.resolvePack('FR')).toBe(generic);
  });

  it('registers iceland country code', () => {
    expect(gateway.registeredCountryCodes()).toContain('IS');
  });

  it('getPackHints returns vehicleType hint for IS self_drive', () => {
    const hints = gateway.getPackHints({
      countryCode: 'IS',
      travelContext: { transportMode: 'self_drive' },
    });
    expect(hints.some((h) => h.field === 'vehicleType')).toBe(true);
  });

  it('getPackHints returns empty for unknown country', () => {
    expect(gateway.getPackHints({ countryCode: 'JP', travelContext: {} })).toEqual([]);
  });
});
