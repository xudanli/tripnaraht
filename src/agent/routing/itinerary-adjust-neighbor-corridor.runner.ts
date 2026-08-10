/**
 * ITINERARY_ADJUST：邻日锚点 + 走廊 poi.search 补检（从 ClaudeOrchestrator 迁出）。
 */

import type { ItineraryAdjustNeighborCorridorHost } from './itinerary-adjust-neighbor-corridor.host';
import { resolveItineraryAdjustNeighborContext } from '../utils/itinerary-trip-neighbor-anchor-load.util';
import {
  type ItineraryAdjustSpatialConstraints,
  type NeighborAnchorContext,
} from '../utils/itinerary-adjust-neighbor-anchors.util';
import { corridorSearchLatLng } from '../utils/itinerary-adjust-corridor-fallback.util';
import { buildItineraryAdjustCorridorPoiSearchPlan } from '../utils/itinerary-adjust-corridor-poi-search.util';

/** 邻日锚点 + 走廊空间约束（D(N-1) 尾 → D(N+1) 头） */
export async function resolveItineraryAdjustNeighborContextForHost(
  host: ItineraryAdjustNeighborCorridorHost,
  tripId: string,
  targetDateIso: string,
  userId?: string,
) {
  if (!host.prisma) return null;
  const dest =
    (
      await host.prisma.trip.findUnique({
        where: { id: tripId.trim() },
        select: { destination: true },
      })
    )?.destination ?? '';
  const maxDetourKm = /冰岛|iceland/i.test(String(dest)) ? 50 : 35;
  const ctx = await resolveItineraryAdjustNeighborContext(
    host.prisma,
    tripId,
    targetDateIso,
    userId,
    maxDetourKm,
  );
  if (!ctx) return null;
  return { anchors: ctx.anchors, spatial: ctx.spatial, dayRows: ctx.dayRows };
}

/** 走廊候选稀疏时沿邻日中点 poi.search 补检 */
export async function supplementItineraryAdjustCorridorPoisForHost(
  host: ItineraryAdjustNeighborCorridorHost,
  params: {
    destinationRaw: string;
    anchors: NeighborAnchorContext;
    spatial: ItineraryAdjustSpatialConstraints;
  },
): Promise<{ pois: unknown[]; query?: string; count: number }> {
  const poiSkill = host.skillsRegistry?.getSkill('poi.search');
  if (!poiSkill) return { pois: [], count: 0 };
  const corridorPlan = buildItineraryAdjustCorridorPoiSearchPlan({
    destinationRaw: params.destinationRaw,
    anchors: params.anchors,
    poiSearchCtx: {
      destination: params.destinationRaw.trim() || 'Iceland',
      pacing: 'relaxed',
    },
  });
  const query = corridorPlan.contextualizedQuery;
  const { lat, lng } = corridorSearchLatLng(params.spatial);
  try {
    const result = (await poiSkill.execute({
      query,
      queryRewriteResult: corridorPlan.rewrite,
      multiRouteSearch: true,
      limit: 14,
      lat,
      lng,
      category: 'ATTRACTION',
    })) as { pois?: unknown[] } | unknown[];
    const pois = Array.isArray(result)
      ? result
      : Array.isArray(result?.pois)
        ? result.pois
        : [];
    return { pois, query, count: pois.length };
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] itinerary adjust corridor poi.search failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { pois: [], query, count: 0 };
  }
}
