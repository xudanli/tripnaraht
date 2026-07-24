import { encodePolyline, decodePolyline } from '../../../transport/utils/encoded-polyline.util';
import { resampleAlongRoute } from './dem-profile-from-geometry.service';

describe('dem-profile-from-geometry helpers', () => {
  it('round-trips encode/decode polyline', () => {
    const pts = [
      { lat: 63.933, lng: -21.002 },
      { lat: 63.983, lng: -19.067 },
    ];
    const encoded = encodePolyline(pts);
    const decoded = decodePolyline(encoded);
    expect(decoded.length).toBe(2);
    expect(decoded[0].lat).toBeCloseTo(pts[0].lat, 4);
    expect(decoded[0].lng).toBeCloseTo(pts[0].lng, 4);
  });

  it('resamples along a long segment', () => {
    const pts = [
      { lat: 64.0, lng: -20.0 },
      { lat: 64.5, lng: -19.0 },
    ];
    const sampled = resampleAlongRoute(pts, 5000, 50);
    expect(sampled.length).toBeGreaterThan(2);
    expect(sampled[0]).toEqual(pts[0]);
    expect(sampled[sampled.length - 1].lat).toBeCloseTo(pts[1].lat, 3);
  });
});
