import type { RouteGeometryService } from '../../transport/services/route-geometry.service';
import type { PoiCoverage, SegmentCoverage } from '../readiness/types/coverage-map.types';
import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';
import type {
  JourneyMapDiversionDto,
  JourneyMapGeometrySource,
} from '../dto/journey-map.dto';

type LatLng = { lat: number; lng: number };

function extractItemIdFromSegmentId(segmentId: string): string | undefined {
  const match = segmentId.match(/^seg_(.+)$/);
  return match?.[1];
}

function readPlaceCoords(item: Record<string, unknown> | undefined): LatLng | undefined {
  if (!item) return undefined;
  const place = item.Place as
    | { metadata?: { lat?: number; lng?: number; coordinates?: number[] } }
    | undefined;
  const metadata = place?.metadata;
  if (metadata?.lat != null && metadata?.lng != null) {
    return { lat: metadata.lat, lng: metadata.lng };
  }
  if (Array.isArray(metadata?.coordinates) && metadata.coordinates.length >= 2) {
    return { lat: metadata.coordinates[1]!, lng: metadata.coordinates[0]! };
  }
  return undefined;
}

function resolveCoordsForSegment(input: {
  segmentId: string;
  pois: PoiCoverage[];
  itineraryItems: Record<string, unknown>[];
}): LatLng | undefined {
  const itemId = extractItemIdFromSegmentId(input.segmentId);
  if (itemId) {
    const poi = input.pois.find((entry) => entry.itemId === itemId);
    if (poi?.coordinates) return poi.coordinates;
    const item = input.itineraryItems.find((entry) => entry.id === itemId);
    const coords = readPlaceCoords(item);
    if (coords) return coords;
  }
  return undefined;
}

function resolveBranchEndCoords(input: {
  branch: PlanningDaySplitDto['branches'][number];
  pois: PoiCoverage[];
  itineraryItems: Record<string, unknown>[];
}): LatLng | undefined {
  const lastSegment = input.branch.segments.at(-1);
  if (!lastSegment) return undefined;
  return resolveCoordsForSegment({
    segmentId: lastSegment.id,
    pois: input.pois,
    itineraryItems: input.itineraryItems,
  });
}

export function resolveTrunkSegmentIds(input: {
  daySplit: PlanningDaySplitDto;
  segments: SegmentCoverage[];
  pois: PoiCoverage[];
}): { trunkSegmentIds: string[]; forkAfterSegmentId?: string } {
  const forkItemId = input.daySplit.fork?.afterSegmentId
    ? extractItemIdFromSegmentId(input.daySplit.fork.afterSegmentId)
    : undefined;

  if (forkItemId) {
    const forkIndex = input.segments.findIndex((segment) => {
      const toPoi = input.pois.find((poi) => poi.id === segment.toPoiId);
      return toPoi?.itemId === forkItemId;
    });
    if (forkIndex >= 0) {
      return {
        trunkSegmentIds: input.segments.slice(0, forkIndex + 1).map((segment) => segment.id),
        forkAfterSegmentId: input.segments[forkIndex]?.id,
      };
    }
  }

  const daySegments = input.segments.filter((segment) => segment.day === input.daySplit.dayNumber);
  if (daySegments.length > 0) {
    const trunk = daySegments.slice(0, Math.max(1, daySegments.length - 1));
    return {
      trunkSegmentIds: trunk.map((segment) => segment.id),
      forkAfterSegmentId: trunk.at(-1)?.id,
    };
  }

  return { trunkSegmentIds: [] };
}

async function resolveSegmentPolyline(
  routeGeometry: RouteGeometryService,
  from: LatLng,
  to: LatLng,
  useRouteApi: boolean,
): Promise<{ polyline: string; geometrySource: JourneyMapGeometrySource }> {
  const result = await routeGeometry.resolveGeometry({
    from,
    to,
    travelMode: 'DRIVING',
    useRouteApi,
  });
  return {
    polyline: result.polyline,
    geometrySource: result.geometrySource,
  };
}

export async function enrichDiversionsWithRouteGeometry(input: {
  diversions: JourneyMapDiversionDto[];
  daySplits?: PlanningDaySplitDto[];
  pois: PoiCoverage[];
  segments: SegmentCoverage[];
  itineraryItems: Record<string, unknown>[];
  routeGeometry?: RouteGeometryService;
  useRouteApi?: boolean;
}): Promise<JourneyMapDiversionDto[]> {
  if (!input.diversions.length) return input.diversions;
  if (!input.routeGeometry) return input.diversions;

  const useRouteApi = input.useRouteApi !== false;
  const daySplitById = new Map(
    (input.daySplits ?? []).map((daySplit) => [daySplit.splitPlanId || daySplit.id, daySplit]),
  );

  return Promise.all(
    input.diversions.map(async (diversion) => {
      const daySplit = daySplitById.get(diversion.id);
      if (!daySplit) return diversion;

      const trunk = resolveTrunkSegmentIds({
        daySplit,
        segments: input.segments,
        pois: input.pois,
      });

      const forkCoords: LatLng | undefined = diversion.splitCoordinates
        ? { lat: diversion.splitCoordinates[1], lng: diversion.splitCoordinates[0] }
        : undefined;

      if (!forkCoords) {
        return {
          ...diversion,
          trunkSegmentIds: trunk.trunkSegmentIds,
          forkAfterSegmentId: trunk.forkAfterSegmentId,
        };
      }

      const branchA = daySplit.branches[0];
      const branchB = daySplit.branches[1];
      const endA = branchA ? resolveBranchEndCoords({ branch: branchA, pois: input.pois, itineraryItems: input.itineraryItems }) : undefined;
      const endB = branchB ? resolveBranchEndCoords({ branch: branchB, pois: input.pois, itineraryItems: input.itineraryItems }) : undefined;

      const [groupAPath, groupBPath] = await Promise.all([
        endA ? resolveSegmentPolyline(input.routeGeometry!, forkCoords, endA, useRouteApi) : null,
        endB ? resolveSegmentPolyline(input.routeGeometry!, forkCoords, endB, useRouteApi) : null,
      ]);

      let merge = diversion.merge;
      const rejoinSegment = daySplit.rejoin;
      if (rejoinSegment) {
        const rejoinCoords = resolveCoordsForSegment({
          segmentId: rejoinSegment.id,
          pois: input.pois,
          itineraryItems: input.itineraryItems,
        });
        if (rejoinCoords) {
          const [mergePathA, mergePathB] = await Promise.all([
            endA
              ? resolveSegmentPolyline(input.routeGeometry!, endA, rejoinCoords, useRouteApi)
              : null,
            endB
              ? resolveSegmentPolyline(input.routeGeometry!, endB, rejoinCoords, useRouteApi)
              : null,
          ]);
          const rejoinItemId = extractItemIdFromSegmentId(rejoinSegment.id);
          const geometrySource =
            mergePathA?.geometrySource === 'route_api' || mergePathB?.geometrySource === 'route_api'
              ? 'route_api'
              : mergePathA?.geometrySource ?? mergePathB?.geometrySource ?? 'straight_line';
          merge = {
            coordinates: [rejoinCoords.lng, rejoinCoords.lat],
            label: rejoinSegment.title,
            activityId: rejoinItemId
              ? rejoinItemId.startsWith('item-') || rejoinItemId.startsWith('poi-')
                ? rejoinItemId
                : `item-${rejoinItemId}`
              : undefined,
            time: rejoinSegment.startTime,
            polylineA: mergePathA?.polyline,
            polylineB: mergePathB?.polyline,
            geometrySource,
          };
        }
      }

      return {
        ...diversion,
        trunkSegmentIds: trunk.trunkSegmentIds,
        forkAfterSegmentId: trunk.forkAfterSegmentId,
        groupA: groupAPath
          ? { ...diversion.groupA, polyline: groupAPath.polyline, geometrySource: groupAPath.geometrySource }
          : diversion.groupA,
        groupB: groupBPath
          ? { ...diversion.groupB, polyline: groupBPath.polyline, geometrySource: groupBPath.geometrySource }
          : diversion.groupB,
        merge,
      };
    }),
  );
}
