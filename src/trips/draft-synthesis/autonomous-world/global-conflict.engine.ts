import type { GlobalConflict } from './global-conflict.types';
import type { TripOccupancyRef } from './global-conflict.types';

function keyDaySlotPlace(r: TripOccupancyRef): string {
  return `${r.dayKey}|${r.slot}|${r.placeId}`;
}

function keyCityDaySlot(r: TripOccupancyRef): string | null {
  if (!r.cityKey) return null;
  return `${r.cityKey}|${r.dayKey}|${r.slot}`;
}

/**
 * 跨行程资源冲突：
 * - POI_OVERLOAD：同一 POI 在同一 dayKey+slot 被多行程占用。
 * - AREA_HOTSPOT（可选）：同一 cityKey+dayKey+slot 出现多行程（走廊拥挤）。
 */
export function detectInterTripConflicts(refs: TripOccupancyRef[]): GlobalConflict[] {
  const bySlotPlace = new Map<string, TripOccupancyRef[]>();
  for (const r of refs) {
    const k = keyDaySlotPlace(r);
    if (!bySlotPlace.has(k)) bySlotPlace.set(k, []);
    bySlotPlace.get(k)!.push(r);
  }

  const out: GlobalConflict[] = [];

  for (const [, group] of bySlotPlace) {
    const trips = [...new Set(group.map((g) => g.tripId))];
    if (trips.length <= 1) continue;
    const slotLabel = group[0] ? `${group[0].dayKey}/${group[0].slot}` : '';
    out.push({
      type: 'POI_OVERLOAD',
      tripIds: trips,
      detail: `placeId=${group[0]?.placeId} 在 ${slotLabel} 被多行程占用`,
      meta: { placeId: group[0]?.placeId, dayKey: group[0]?.dayKey, slot: group[0]?.slot },
    });
  }

  const byCity = new Map<string, TripOccupancyRef[]>();
  for (const r of refs) {
    const ck = keyCityDaySlot(r);
    if (!ck) continue;
    if (!byCity.has(ck)) byCity.set(ck, []);
    byCity.get(ck)!.push(r);
  }

  for (const [ck, group] of byCity) {
    const trips = [...new Set(group.map((g) => g.tripId))];
    if (trips.length <= 1) continue;
    out.push({
      type: 'AREA_HOTSPOT',
      tripIds: trips,
      detail: `城市走廊 ${ck} 同时段多行程叠加`,
      meta: { cityDaySlot: ck },
    });
  }

  return out;
}
