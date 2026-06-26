import { TravelTimeRouterService } from './travel-time-router.service';

describe('TravelTimeRouterService', () => {
  it('prefers self-hosted OSM routing over commercial routing', async () => {
    const smartRoutes = {
      getRoutes: jest.fn().mockResolvedValue([{ durationMinutes: 99 }]),
    };
    const selfHostedRouting = {
      estimateTravelMinutes: jest.fn().mockResolvedValue({ engine: 'osrm', durationMinutes: 42 }),
    };
    const svc = new TravelTimeRouterService(smartRoutes as any, selfHostedRouting as any);

    await expect(
      svc.estimateTravelMinutes({
        from: { lat: 64.1466, lng: -21.9426 },
        to: { lat: 63.4194, lng: -18.9969 },
        mode: 'DRIVE',
      }),
    ).resolves.toBe(42);

    expect(selfHostedRouting.estimateTravelMinutes).toHaveBeenCalledTimes(1);
    expect(smartRoutes.getRoutes).not.toHaveBeenCalled();
  });

  it('falls back to commercial routing when self-hosted routing is unavailable', async () => {
    const smartRoutes = {
      getRoutes: jest.fn().mockResolvedValue([{ durationMinutes: 88 }]),
    };
    const selfHostedRouting = {
      estimateTravelMinutes: jest.fn().mockResolvedValue(null),
    };
    const svc = new TravelTimeRouterService(smartRoutes as any, selfHostedRouting as any);

    await expect(
      svc.estimateTravelMinutes({
        from: { lat: 64.1466, lng: -21.9426 },
        to: { lat: 63.4194, lng: -18.9969 },
        mode: 'DRIVE',
      }),
    ).resolves.toBe(88);

    expect(smartRoutes.getRoutes).toHaveBeenCalledWith(64.1466, -21.9426, 63.4194, -18.9969, 'DRIVING');
  });

  it('falls back to Iceland coordinate weighting when routers do not return a route', async () => {
    const smartRoutes = {
      getRoutes: jest.fn().mockResolvedValue([]),
    };
    const selfHostedRouting = {
      estimateTravelMinutes: jest.fn().mockResolvedValue(null),
    };
    const svc = new TravelTimeRouterService(smartRoutes as any, selfHostedRouting as any);

    const minutes = await svc.estimateTravelMinutes({
      from: { lat: 64.2559, lng: -20.1295 },
      to: { lat: 64.8404, lng: -19.2814 },
      mode: 'DRIVE',
    });

    expect(minutes).toBeGreaterThan(200);
  });
});
