import {
  assessIcelandRouteConstraints,
  detectIcelandPlaceIntent,
  mapGuideVehicleType,
} from './guide-iceland-constraint.util';

describe('guide-iceland-constraint.util', () => {
  it('detects F-road id and highland keywords', () => {
    const intent = detectIcelandPlaceIntent(['Landmannalaugar 高地', '沿 F208 进入']);
    expect(intent.hasHighlandIntent).toBe(true);
    expect(intent.fRoadIds).toContain('F208');
  });

  it('blocks 2wd with highland intent in winter', () => {
    const result = assessIcelandRouteConstraints({
      travelDate: '2026-03-15',
      placeNames: ['Landmannalaugar'],
      vehicleType: '2wd',
      routeExists: true,
      drivingMinutes: 120,
    });
    expect(result.legallyAllowed).toBe(false);
    expect(result.blockedReasons).toContain('VEHICLE_TYPE_INCOMPATIBLE');
    expect(result.blockedReasons).toContain('SEGMENT_SEASONALLY_CLOSED');
  });

  it('marks summer highland route as recommended for 4x4', () => {
    const result = assessIcelandRouteConstraints({
      travelDate: '2026-08-01',
      placeNames: ['Landmannalaugar'],
      vehicleType: '4x4',
      routeExists: true,
      drivingMinutes: 180,
    });
    expect(result.recommended).toBe(true);
    expect(result.level).toBe('route_recommended');
  });
});
