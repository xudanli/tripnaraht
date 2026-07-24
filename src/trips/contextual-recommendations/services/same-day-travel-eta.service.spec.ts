import { SameDayTravelEtaService } from './same-day-travel-eta.service';

describe('SameDayTravelEtaService', () => {
  it('falls back to heuristic when live routing unavailable', async () => {
    const svc = new SameDayTravelEtaService(undefined);
    const eta = await svc.estimate({
      currentLocation: { lat: 63.985, lng: -22.605, label: 'KEF' },
      hotel: { lat: 64.1466, lng: -21.9426 },
      countryCode: 'IS',
      useLiveRoutes: true,
    });
    expect(eta.pickupBufferMinutes).toBe(50);
    expect(eta.totalMinutesUntilHotel).toBeGreaterThan(eta.driveMinutes);
    expect(eta.method).not.toBe('live_route_api');
  });

  it('uses live_route_api when transport returns duration', async () => {
    const transport = {
      planPoiHopRoute: jest.fn(async () => ({
        options: [{ durationMinutes: 48, walkDistance: 42000 }],
      })),
    };
    const svc = new SameDayTravelEtaService(transport as never);
    const eta = await svc.estimate({
      currentLocation: { lat: 63.985, lng: -22.605, label: 'KEF' },
      hotel: { lat: 64.1466, lng: -21.9426 },
      countryCode: 'IS',
      useLiveRoutes: true,
    });
    expect(transport.planPoiHopRoute).toHaveBeenCalled();
    expect(eta.method).toBe('live_route_api');
    expect(eta.driveMinutes).toBe(48);
    expect(eta.totalMinutesUntilHotel).toBe(50 + 48);
  });
});
