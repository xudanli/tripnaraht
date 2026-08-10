import {
  estimateDriveMinutesBetweenPlaces,
  orderPlaceIdsByNearestNeighbor,
  orderPlaceIdsHotelAnchored,
  sumDayDriveWithHotels,
  sumRouteDriveMinutes,
} from './iceland-planning-place-coords.util';

describe('iceland-planning-place-coords', () => {
  it('estimates shorter drive Geysir→Gullfoss than Thingvellir→Gullfoss', () => {
    const near = estimateDriveMinutesBetweenPlaces(381083, 381084);
    const far = estimateDriveMinutesBetweenPlaces(381037, 381084);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });

  it('orders Golden Circle loop west→east-ish from Thingvellir seed', () => {
    const ordered = orderPlaceIdsByNearestNeighbor(
      [381084, 381083, 381037, 389399],
      381037,
    );
    expect(ordered[0]).toBe(381037);
    expect(ordered).toContain(381083);
    expect(ordered).toContain(381084);
    expect(sumRouteDriveMinutes(ordered)).toBeLessThan(
      sumRouteDriveMinutes([381037, 381084, 389399, 381083]),
    );
  });

  it('orders day so first POI is near morning hotel and last near evening hotel', () => {
    // Vík hostel 381045 as evening hotel; Reykjavík-ish hotel proxy via Thingvellir morning
    const morningHotel = 381037; // Þingvellir area as morning anchor
    const eveningHotel = 381045; // Vík
    const pois = [381083, 381084, 389399]; // Geysir, Gullfoss, Kerið
    const ordered = orderPlaceIdsHotelAnchored(pois, morningHotel, eveningHotel);
    expect(ordered[0]).toBe(
      [...pois].sort(
        (a, b) =>
          estimateDriveMinutesBetweenPlaces(morningHotel, a) -
          estimateDriveMinutesBetweenPlaces(morningHotel, b),
      )[0],
    );
    const last = ordered[ordered.length - 1]!;
    const lastDist = estimateDriveMinutesBetweenPlaces(last, eveningHotel);
    for (const p of ordered.slice(0, -1)) {
      expect(lastDist).toBeLessThanOrEqual(
        estimateDriveMinutesBetweenPlaces(p, eveningHotel),
      );
    }
    expect(sumDayDriveWithHotels(ordered, morningHotel, eveningHotel)).toBeGreaterThan(
      sumRouteDriveMinutes(ordered),
    );
  });

  it('orders arrival day from KEF toward attractions', () => {
    const kef = 381221;
    const pois = [381090, 381037, 381083]; // Blue Lagoon, Þingvellir, Geysir
    const ordered = orderPlaceIdsHotelAnchored(pois, kef, 381042);
    expect(ordered[0]).toBe(381090); // closest to KEF among the three
    expect(
      sumDayDriveWithHotels(ordered, kef, 381042),
    ).toBeGreaterThan(estimateDriveMinutesBetweenPlaces(kef, ordered[0]));
  });
});
