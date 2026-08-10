/**
 * ITINERARY_ADJUST：从 location_ref / research POI 池解析 place_id（纯函数）。
 */

import type { ItineraryItem, OrchestratorState } from '../interfaces/trip-plan.interface';
import { parseNumericPlaceId } from '../utils/itinerary-adjust-corridor-apply.util';

export function resolvePlaceIdForItineraryAdjustApply(
  item: ItineraryItem,
  state: OrchestratorState | { research_data?: unknown },
): number | undefined {
  const rawId = item.location_ref?.place_id;
  const numeric = parseNumericPlaceId(rawId);
  if (numeric != null) return numeric;

  const name = String(item.location_ref?.name ?? '').trim();
  if (!name) return undefined;

  const research = state.research_data as
    | { poi_evidence?: { pois?: unknown[] }; pois?: unknown[] }
    | undefined;
  const pools: unknown[][] = [];
  if (Array.isArray(research?.poi_evidence?.pois)) pools.push(research.poi_evidence.pois);
  if (Array.isArray(research?.pois)) pools.push(research.pois);

  for (const pool of pools) {
    for (const row of pool) {
      const p = row as Record<string, unknown>;
      const label = String(p.name ?? p.nameCN ?? p.nameEN ?? '');
      if (!label || (!label.includes(name) && !name.includes(label))) continue;
      const id = parseNumericPlaceId(p.id ?? p.poi_id ?? p.place_id);
      if (id != null) return id;
    }
  }
  return undefined;
}
