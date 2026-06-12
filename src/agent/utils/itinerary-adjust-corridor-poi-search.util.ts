/**
 * ITINERARY_ADJUST 走廊补检：走 agent_internal 规则管道（0 Token，近零时延）。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import type { NeighborAnchorContext } from './itinerary-adjust-neighbor-anchors.util';
import { buildItineraryAdjustCorridorPoiSearchQuery } from './itinerary-adjust-corridor-fallback.util';
import {
  buildPoiSearchPlanFromContext,
  type PoiSearchPlan,
} from './query-rewriting-poi-context.util';

export function buildItineraryAdjustCorridorPoiSearchPlan(params: {
  destinationRaw: string;
  anchors: NeighborAnchorContext;
  poiSearchCtx?: PoiSearchContext;
}): PoiSearchPlan {
  const baseQuery = buildItineraryAdjustCorridorPoiSearchQuery(
    params.destinationRaw,
    params.anchors,
  );
  const poiSearchCtx: PoiSearchContext = params.poiSearchCtx ?? {
    destination: params.destinationRaw.trim() || 'Iceland',
    pacing: 'relaxed',
  };

  return buildPoiSearchPlanFromContext({
    baseQuery,
    poiSearchCtx,
    variant: 'scenic',
  });
}
