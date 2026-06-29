import { encodePolyline, parseAmapPolyline } from './encoded-polyline.util';

describe('encoded-polyline.util', () => {
  it('encodes two coordinates', () => {
    const encoded = encodePolyline([
      { lat: 63.5, lng: -19.5 },
      { lat: 63.6, lng: -19.4 },
    ]);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('parses amap polyline pairs', () => {
    const coords = parseAmapPolyline('-19.5,63.5;-19.4,63.6');
    expect(coords).toEqual([
      { lat: 63.5, lng: -19.5 },
      { lat: 63.6, lng: -19.4 },
    ]);
  });
});
