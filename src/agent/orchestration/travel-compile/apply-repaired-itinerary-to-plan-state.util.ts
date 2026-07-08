import type { Itinerary, ItineraryItem } from '../../interfaces/trip-plan.interface';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';

function dayIndexFromDate(date: string | undefined, startDate: string | undefined): number {
  if (!date?.trim()) return 0;
  if (startDate?.trim()) {
    const base = new Date(startDate.trim().slice(0, 10));
    const target = new Date(date.trim().slice(0, 10));
    if (!Number.isNaN(base.getTime()) && !Number.isNaN(target.getTime())) {
      return Math.max(0, Math.round((target.getTime() - base.getTime()) / 86400000));
    }
  }
  return 0;
}

function poiItemsForDay(day: Itinerary['days'][number]): ItineraryItem[] {
  return (day.items ?? []).filter((item) => item.type === 'POI' || item.type === 'MEAL');
}

function poiNameOf(item: ItineraryItem): string | undefined {
  return item.location_ref?.name?.trim() || item.notes?.trim() || undefined;
}

/**
 * Kernel REPAIR 输出 itinerary → 回写 PlanState segments（attractions）与 graph 投影 SSOT。
 */
export function applyRepairedItineraryToPlanState(params: {
  planState: PlanState;
  repairedItinerary: Itinerary;
}): { segmentsUpdated: number; itemsApplied: number } {
  const { planState, repairedItinerary } = params;
  const segments = planState.itinerary?.segments ?? [];
  const startDate = planState.constraints?.time?.startDate;
  let segmentsUpdated = 0;
  let itemsApplied = 0;

  for (const day of repairedItinerary.days ?? []) {
    const poiItems = poiItemsForDay(day);
    const names = poiItems.map(poiNameOf).filter((name): name is string => Boolean(name));
    if (names.length === 0) continue;

    const dayIndex = dayIndexFromDate(day.date, startDate);
    const segment = segments.find((s) => s.dayIndex === dayIndex);
    if (!segment) continue;

    const metadata = { ...(segment.metadata ?? {}) } as Record<string, unknown>;
    const existing = Array.isArray(metadata.attractions)
      ? (metadata.attractions as Array<Record<string, unknown>>)
      : [];

    metadata.attractions = names.map((name) => {
      const prior = existing.find((entry) => {
        const entryName =
          (entry.name as string | undefined) ??
          (entry.nameCN as string | undefined) ??
          (entry.nameEN as string | undefined);
        return entryName === name;
      });
      return prior ? { ...prior, name } : { name };
    });

    segment.metadata = metadata;
    segmentsUpdated += 1;
    itemsApplied += names.length;
  }

  planState.metadata = {
    ...(planState.metadata ?? {}),
    graph_projected_itinerary: repairedItinerary,
    workbench_repair_applied_at: new Date().toISOString(),
  };

  return { segmentsUpdated, itemsApplied };
}
