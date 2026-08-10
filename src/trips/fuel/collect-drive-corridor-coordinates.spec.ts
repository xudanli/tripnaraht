import { encodePolyline } from '../../transport/utils/encoded-polyline.util';
import type { TripPlan } from '../decision/plan-model';
import {
  collectDriveCorridorCoordinatesFromPlan,
  resolveDriveCorridorDenserCoordinates,
} from './collect-drive-corridor-coordinates';
import { decodeTravelRouteGeometry } from './decode-travel-route-geometry';

describe('drive corridor denserCoordinates from polyline', () => {
  const from = { lat: 63.933, lng: -21.0 };
  const mid = { lat: 63.7, lng: -20.0 };
  const to = { lat: 63.419, lng: -19.006 };
  const roadPolyline = encodePolyline([from, mid, to]);

  function planWithLeg(geometry?: {
    encoding: 'ENCODED_POLYLINE';
    value: string;
    source: 'ROUTE_API' | 'CACHED_METADATA' | 'STRAIGHT_LINE';
  }): TripPlan {
    return {
      version: 'test',
      createdAt: '2026-07-19T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-07-20',
          timeSlots: [
            {
              id: 'leg_selfoss_vik',
              time: '09:00',
              title: 'Drive to Vík',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                distanceKm: 180,
                durationMin: 150,
                from,
                to,
                ...(geometry ? { geometry } : {}),
              },
            },
          ],
        },
      ],
    } as TripPlan;
  }

  it('decodes ENCODED_POLYLINE geometry', () => {
    const pts = decodeTravelRouteGeometry({
      encoding: 'ENCODED_POLYLINE',
      value: roadPolyline,
      source: 'ROUTE_API',
    });
    expect(pts.length).toBe(3);
    expect(pts[1]!.lat).toBeCloseTo(mid.lat, 4);
  });

  it('collects denser vertices from leg.geometry (sync)', () => {
    const plan = planWithLeg({
      encoding: 'ENCODED_POLYLINE',
      value: roadPolyline,
      source: 'ROUTE_API',
    });
    const pts = collectDriveCorridorCoordinatesFromPlan(plan);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.some((p) => Math.abs(p.lat - mid.lat) < 0.01)).toBe(true);
  });

  it('falls back to endpoints when geometry absent', () => {
    const plan = planWithLeg();
    const pts = collectDriveCorridorCoordinatesFromPlan(plan);
    expect(pts).toEqual([from, to]);
  });

  it('resolves via RouteGeometryService when leg has no polyline', async () => {
    const plan = planWithLeg();
    const resolveGeometry = jest.fn().mockResolvedValue({
      polyline: roadPolyline,
      geometrySource: 'route_api',
      provider: 'MAPBOX',
      cacheHit: false,
      fallbackUsed: false,
    });

    const result = await resolveDriveCorridorDenserCoordinates({
      plan,
      routeGeometry: { resolveGeometry },
    });

    expect(resolveGeometry).toHaveBeenCalledTimes(1);
    expect(result.legSources[0]!.source).toBe('ROUTE_API');
    expect(result.denserCoordinates.length).toBeGreaterThanOrEqual(3);
    expect(plan.days[0]!.timeSlots[0]!.travelLegFromPrev!.geometry?.source).toBe(
      'ROUTE_API',
    );
  });

  it('prefers existing ROUTE_API polyline over re-fetch', async () => {
    const plan = planWithLeg({
      encoding: 'ENCODED_POLYLINE',
      value: roadPolyline,
      source: 'ROUTE_API',
    });
    const resolveGeometry = jest.fn();

    const result = await resolveDriveCorridorDenserCoordinates({
      plan,
      routeGeometry: { resolveGeometry },
    });

    expect(resolveGeometry).not.toHaveBeenCalled();
    expect(result.legSources[0]!.source).toBe('ROUTE_API');
    expect(result.denserCoordinates.length).toBeGreaterThanOrEqual(3);
  });

  it('re-fetches when only STRAIGHT_LINE geometry is present', async () => {
    const chord = encodePolyline([from, to]);
    const plan = planWithLeg({
      encoding: 'ENCODED_POLYLINE',
      value: chord,
      source: 'STRAIGHT_LINE',
    });
    const resolveGeometry = jest.fn().mockResolvedValue({
      polyline: roadPolyline,
      geometrySource: 'route_api',
      provider: 'MAPBOX',
      cacheHit: true,
      fallbackUsed: false,
    });

    const result = await resolveDriveCorridorDenserCoordinates({
      plan,
      routeGeometry: { resolveGeometry },
    });

    expect(resolveGeometry).toHaveBeenCalledTimes(1);
    expect(result.legSources[0]!.source).toBe('ROUTE_API');
    expect(result.denserCoordinates.some((p) => Math.abs(p.lat - mid.lat) < 0.01)).toBe(
      true,
    );
  });
});
