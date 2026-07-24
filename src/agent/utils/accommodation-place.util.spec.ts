import {
  formatAccommodationCoordsNoteLine,
  parseCoordsFromRestNote,
  resolveAccommodationCoordinates,
} from './accommodation-place.util';

describe('accommodation-place.util', () => {
  it('resolveAccommodationCoordinates reads location and listing_lat/lng', () => {
    expect(
      resolveAccommodationCoordinates({
        id: '1',
        source: 'airbnb',
        name: 'Stay',
        location: { lat: 63.4, lng: -19.0 },
      }),
    ).toEqual({ lat: 63.4, lng: -19.0 });
    expect(
      resolveAccommodationCoordinates({
        id: '2',
        source: 'hotel',
        name: 'Hotel',
        listing_lat: 64.1,
        listing_lng: -21.9,
      } as any),
    ).toEqual({ lat: 64.1, lng: -21.9 });
  });

  it('parseCoordsFromRestNote round-trips note line', () => {
    const line = formatAccommodationCoordsNoteLine(63.42, -19.01);
    expect(parseCoordsFromRestNote(`Hotel\n${line}`)).toEqual({ lat: 63.42, lng: -19.01 });
  });
});
