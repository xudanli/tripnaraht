import { encodePolyline, decodePolyline } from './encoded-polyline.util';

describe('encoded-polyline.util decode', () => {
  it('decodes what encode produces', () => {
    const pts = [
      { lat: 64.1466, lng: -21.9426 },
      { lat: 64.15, lng: -21.95 },
    ];
    const again = decodePolyline(encodePolyline(pts));
    expect(again[0].lat).toBeCloseTo(pts[0].lat, 4);
    expect(again[1].lng).toBeCloseTo(pts[1].lng, 4);
  });
});
