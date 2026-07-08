import { ExplorationRouteDetailService } from './exploration-route-detail.service';

describe('ExplorationRouteDetailService', () => {
  const service = new ExplorationRouteDetailService();

  it('returns full detail with days and map for highlands route', () => {
    const detail = service.requireRouteDetail('route_remote-highlands-south');
    expect(detail.routeId).toBe('route_remote-highlands-south');
    expect(detail.detail.days.length).toBeGreaterThan(0);
    expect(detail.detail.resolvedPois).toEqual([]);
    expect(detail.detail.days.every((d) => d.mapPoint.lng && d.mapPoint.lat)).toBe(true);
    expect(detail.detail.map.mainLine.length).toBeGreaterThan(1);
    expect(detail.detail.map.fRoadLine?.length).toBeGreaterThan(1);

    const d5 = detail.detail.days.find((d) => d.day === 5);
    expect(d5?.highlight).toBe(true);
    expect(d5?.tip).toBeTruthy();
  });

  it('returns preview with map for candidates list', () => {
    const preview = service.getRoutePreview('route_depth-south-coast');
    expect(preview?.preview.map.mainLine[0]).toEqual([-21.9426, 64.1466]);
    expect(preview?.preview.summary).toBeTruthy();
  });

  it('returns highlands preview with fRoad layers for map', () => {
    const preview = service.getRoutePreview('route_remote-highlands-south');
    expect(preview?.preview.map.fRoadLine?.length).toBeGreaterThan(7);
    expect(preview?.preview.map.layers?.length).toBe(2);
    expect(preview?.preview.map.layers?.[1]?.id).toBe('fRoad');
    expect(preview?.preview.map.layers?.[1]?.lineStyle).toBe('dashed');
  });

  it('resolves by strategyId alias', () => {
    const detail = service.getRouteDetail('remote-highlands-south');
    expect(detail?.strategyId).toBe('remote-highlands-south');
  });
});
