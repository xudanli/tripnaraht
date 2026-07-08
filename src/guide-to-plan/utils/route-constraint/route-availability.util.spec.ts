import { buildBaseRouteAvailability } from '../../utils/route-constraint/route-availability.util';

describe('buildBaseRouteAvailability', () => {
  it('flags long driving days as non-recommended', () => {
    const result = buildBaseRouteAvailability({
      routeExists: true,
      drivingMinutes: 400,
    });
    expect(result.recommended).toBe(false);
    expect(result.level).toBe('route_operationally_available');
  });
});
