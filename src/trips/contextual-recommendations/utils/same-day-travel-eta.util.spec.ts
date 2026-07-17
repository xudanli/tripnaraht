import { estimateArrivalTravelEta } from './same-day-travel-eta.util';

describe('same-day-travel-eta.util', () => {
  it('estimates KEF → Reykjavik hotel with pickup buffer', () => {
    const eta = estimateArrivalTravelEta({
      currentLocation: { lat: 63.985, lng: -22.605, label: 'Keflavik Airport' },
      hotel: { lat: 64.1466, lng: -21.9426, name: 'Reykjavik Centrum' },
      countryCode: 'IS',
    });
    expect(eta.pickupBufferMinutes).toBe(50);
    expect(eta.driveMinutes).toBeGreaterThan(30);
    expect(eta.totalMinutesUntilHotel).toBe(eta.pickupBufferMinutes + eta.driveMinutes);
    expect(eta.method).toMatch(/iceland_heuristic|generic_driving|fallback/);
  });

  it('uses smaller buffer when already in city', () => {
    const eta = estimateArrivalTravelEta({
      currentLocation: { lat: 64.1466, lng: -21.9426, label: 'Reykjavik' },
      hotel: { lat: 64.15, lng: -21.93, name: 'Hotel' },
      countryCode: 'IS',
    });
    expect(eta.pickupBufferMinutes).toBe(15);
    expect(eta.totalMinutesUntilHotel).toBeLessThan(60);
  });
});
