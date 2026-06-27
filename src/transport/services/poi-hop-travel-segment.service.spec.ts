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
    const svc = new PoiHopTravelSegmentService(travelTimeEstimator, undefined);
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
  });

  it('KEF airport to Geysir rental office ~18 min driving (not walking)', async () => {
    const svc = new PoiHopTravelSegmentService(travelTimeEstimator, undefined);
    const result = await svc.resolveSegment({
      from: { lat: 63.985, lng: -22.0055 },
      to: { lat: 64.1466, lng: -21.9406 },
      preferredMode: 'WALKING',
      defaultMode: 'DRIVING',
      useRouteApi: false,
    });
    expect(result.travelMode).toBe('DRIVING');
    expect(result.durationMinutes).toBe(18);
  });
});
