import { resolvePlaceCoordinates } from './place-coordinates.util';

describe('resolvePlaceCoordinates', () => {
  it('prefers postgis batch coords over metadata', () => {
    expect(
      resolvePlaceCoordinates(
        { metadata: { lat: 1, lng: 2 } },
        { lat: 64, lng: -21 },
      ),
    ).toEqual({ lat: 64, lng: -21 });
  });

  it('reads metadata.location nested coords', () => {
    expect(
      resolvePlaceCoordinates({
        metadata: {
          location: { lat: 64.14, lng: -21.91 },
        },
      }),
    ).toEqual({ lat: 64.14, lng: -21.91 });
  });

  it('parses metadata.coordinates as geojson lng/lat', () => {
    expect(
      resolvePlaceCoordinates({
        metadata: { coordinates: [-21.9, 64.1] },
      }),
    ).toEqual({ lat: 64.1, lng: -21.9 });
  });

  it('reads enriched Place lat/lng fields', () => {
    expect(
      resolvePlaceCoordinates({
        lat: 63.5,
        lng: -19.0,
      }),
    ).toEqual({ lat: 63.5, lng: -19.0 });
  });

  it('reads _coordinates cache', () => {
    expect(
      resolvePlaceCoordinates({
        _coordinates: { lat: 65.0, lng: -18.0 },
      }),
    ).toEqual({ lat: 65.0, lng: -18.0 });
  });
});
