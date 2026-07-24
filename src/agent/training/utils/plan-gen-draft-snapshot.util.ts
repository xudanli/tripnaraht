import type { Itinerary } from '../../interfaces/trip-plan.interface';

/** 深拷贝行程拓扑，避免 REPAIR 原地变异污染首轮快照。 */
export function cloneItineraryForSnapshot(itinerary: Itinerary | undefined): Itinerary | undefined {
  if (!itinerary?.days?.length) return undefined;
  try {
    return structuredClone(itinerary);
  } catch {
    return JSON.parse(JSON.stringify(itinerary)) as Itinerary;
  }
}

export function itineraryHasTopology(itinerary: Itinerary | undefined): boolean {
  return Boolean(itinerary?.days?.length);
}
