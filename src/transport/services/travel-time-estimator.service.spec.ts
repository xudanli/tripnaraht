import { TravelTimeEstimatorService } from './travel-time-estimator.service';

describe('TravelTimeEstimatorService', () => {
  const svc = new TravelTimeEstimatorService();

  it('haversineDistanceKm matches known Reykjavik–Vik hop', () => {
    const km = svc.haversineDistanceKm(
      { lat: 64.1466, lng: -21.9426 },
      { lat: 63.4194, lng: -18.9969 },
    );
    expect(km).toBeGreaterThan(160);
    expect(km).toBeLessThan(200);
  });

  it('estimatePoiTravelMinutes uses WALKING under 1 km', () => {
    const mins = svc.estimatePoiTravelMinutes(
      { lat: 64.1466, lng: -21.9426 },
      { lat: 64.1476, lng: -21.9426 },
    );
    expect(mins.travelMode).toBe('WALKING');
    expect(mins.durationMinutes).toBeGreaterThan(0);
    expect(mins.durationMinutes).toBeLessThan(20);
  });

  it('estimatePoiTravelMinutes defaults to DRIVING for inter-POI hops', () => {
    const mins = svc.estimatePoiTravelMinutes(
      { lat: 64.1466, lng: -21.9426 },
      { lat: 63.4194, lng: -18.9969 },
    );
    expect(mins.travelMode).toBe('DRIVING');
    expect(mins.durationMinutes).toBeGreaterThan(150);
    expect(mins.durationMinutes).toBeLessThan(220);
  });

  it('uses Iceland-specific driving weights for highlands coordinate hops', () => {
    const mins = svc.estimatePoiTravelMinutes(
      { lat: 64.2559, lng: -20.1295 },
      { lat: 64.8404, lng: -19.2814 },
      { travelDate: new Date('2026-07-15T12:00:00Z') },
    );
    expect(mins.travelMode).toBe('DRIVING');
    expect(mins.durationMinutes).toBeGreaterThan(250);
  });

  it('keeps non-Iceland driving estimates on the generic profile', () => {
    const mins = svc.estimatePoiTravelMinutes(
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.8606, lng: 2.3376 },
      { travelMode: 'DRIVING', countryCode: 'FR' },
    );
    expect(mins.travelMode).toBe('DRIVING');
    expect(mins.durationMinutes).toBe(svc.estimateDurationMinutes(mins.distanceKm, 'DRIVING'));
  });

  it('estimateDurationMinutes aligns with documented speeds', () => {
    expect(svc.estimateDurationMinutes(5, 'WALKING')).toBe(60);
    expect(svc.estimateDurationMinutes(60, 'DRIVING')).toBe(60);
    expect(svc.estimateDurationMinutes(80, 'TRANSIT')).toBe(60);
  });
});
