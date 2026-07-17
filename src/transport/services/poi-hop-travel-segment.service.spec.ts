import { PoiHopTravelSegmentService, inferPoiHopTravelMode } from './poi-hop-travel-segment.service';
import { TravelTimeEstimatorService } from './travel-time-estimator.service';

describe('poi-hop-travel-segment.service', () => {
  const travelTimeEstimator = new TravelTimeEstimatorService();

  it('infers DRIVING for golden-circle hops', () => {
    expect(inferPoiHopTravelMode(12, 'DRIVING')).toBe('DRIVING');
  });

  it('ignores stored WALKING when hop exceeds walking range', () => {
    expect(inferPoiHopTravelMode(18.24, 'DRIVING', 'WALKING')).toBe('DRIVING');
  });

  it('returns heuristic segment aligned with travel-info', async () => {
    const svc = new PoiHopTravelSegmentService(travelTimeEstimator, undefined, undefined);
    const result = await svc.resolveSegment({
      from: { lat: 64.2559, lng: -21.1299 },
      to: { lat: 64.3103, lng: -20.3011 },
      defaultMode: 'DRIVING',
      useRouteApi: false,
    });
    expect(result.travelMode).toBe('DRIVING');
    expect(result.durationMinutes).toBeGreaterThan(10);
    expect(result.durationMinutes).toBeLessThan(90);
    expect(result.source).toBe('heuristic');
    expect(result.eta.baseDurationMin).toBe(result.durationMinutes);
    expect(result.eta.planningDurationMin).toBe(result.durationMinutes);
    expect(result.eta.provenance.sourceKind).toBe('HEURISTIC');
    expect(result.eta.provenance.provider).toBe('HEURISTIC');
    expect(result.eta.geometry?.source).toBe('STRAIGHT_LINE');
    expect(result.eta.geometry?.encoding).toBe('ENCODED_POLYLINE');
    expect(result.eta.geometry?.value).toBeTruthy();
  });

  it('KEF airport to Geysir rental office ~18 min driving (not walking)', async () => {
    const svc = new PoiHopTravelSegmentService(travelTimeEstimator, undefined, undefined);
    const result = await svc.resolveSegment({
      from: { lat: 63.985, lng: -22.0055 },
      to: { lat: 64.1466, lng: -21.9406 },
      preferredMode: 'WALKING',
      defaultMode: 'DRIVING',
      useRouteApi: false,
    });
    expect(result.travelMode).toBe('DRIVING');
    expect(result.durationMinutes).toBe(18);
    expect(result.eta.planningDurationMin).toBe(18);
  });

  it('uses RouteGeometryService for provider + polyline when available', async () => {
    const routeGeometry = {
      resolveGeometry: jest.fn().mockResolvedValue({
        polyline: 'encoded_poly',
        geometrySource: 'route_api',
        durationMinutes: 47,
        distanceMeters: 52000,
        provider: 'MAPBOX',
      }),
    };
    const svc = new PoiHopTravelSegmentService(
      travelTimeEstimator,
      undefined,
      routeGeometry as any,
    );
    const result = await svc.resolveSegment({
      from: { lat: 64.14, lng: -21.94 },
      to: { lat: 63.98, lng: -19.07 },
      defaultMode: 'DRIVING',
      useRouteApi: true,
    });
    expect(result.source).toBe('route_api');
    expect(result.durationMinutes).toBe(47);
    expect(result.eta.provenance.provider).toBe('MAPBOX');
    expect(result.eta.geometry).toEqual({
      encoding: 'ENCODED_POLYLINE',
      value: 'encoded_poly',
      source: 'ROUTE_API',
    });
  });
});
