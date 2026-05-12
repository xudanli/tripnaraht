import type { ItineraryGapType } from '../types/itinerary-gap.types';
import type { GapBehaviorObservation } from '../types/gap-behavior-observation.types';
import type { RetrievalDecisionTrace } from '../types/retrieval-decision-trace.types';

function poiRowIndoorish(poi: any): boolean {
  const name = `${poi?.name ?? ''} ${poi?.nameCN ?? ''} ${poi?.nameEN ?? ''}`.toLowerCase();
  const cat = String(poi?.category ?? poi?.metadata?.category ?? '').toUpperCase();
  if (['MUSEUM', 'GALLERY', 'AQUARIUM', 'SHOPPING_MALL'].includes(cat)) return true;
  return /museum|博物馆|咖啡|cafe|gallery|美术馆|商场|mall|aquarium|indoor|温泉|spa|onsen|浴|图书馆|library/.test(name);
}

function normalizeCategory(poi: any): string {
  const c = String(poi?.category ?? poi?.metadata?.category ?? poi?.type ?? 'UNKNOWN').trim();
  return c ? c.toUpperCase() : 'UNKNOWN';
}

/**
 * 在存在 `gapStats.primaryGap` 的 retrieval trace 时，对当次选中 POI 做结构统计（v1）。
 */
export function buildGapBehaviorObservation(input: {
  trace?: RetrievalDecisionTrace | null;
  selectedPois: unknown[];
}): GapBehaviorObservation | undefined {
  const pg = input.trace?.gapStats?.primaryGap;
  if (!pg) return undefined;
  const rows = (input.selectedPois ?? []).filter((x) => x != null);
  const indoorishSelectedCount = rows.filter((p) => poiRowIndoorish(p as any)).length;
  const hist = new Map<string, number>();
  for (const p of rows) {
    const k = normalizeCategory(p as any);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const categoryHistogram = [...hist.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const allFromStats = input.trace?.gapStats?.allGaps;
  const allGapTypes: ItineraryGapType[] =
    allFromStats && allFromStats.length > 0 ? allFromStats : [pg];
  return {
    primaryGap: pg,
    allGapTypes,
    selectedCount: rows.length,
    indoorishSelectedCount,
    categoryHistogram,
  };
}
