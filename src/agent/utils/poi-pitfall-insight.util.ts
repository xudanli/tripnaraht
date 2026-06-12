/**
 * POI 避坑洞察（启发式 + RAG 片段抽取，schema: tripnara.poi_pitfall@v1）
 */

import type { Itinerary, ItineraryItem } from '../interfaces/trip-plan.interface';

export const POI_PITFALL_SCHEMA = 'tripnara.poi_pitfall@v1' as const;

export interface PoiPitfallCard {
  schema: typeof POI_PITFALL_SCHEMA;
  poi_id: string;
  place_id?: string;
  label_zh: string;
  day_index?: number;
  day_date?: string;
  tips_zh: string[];
  source: 'heuristic' | 'rag_snippet' | 'item_notes';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const PITFALL_LINE_RE =
  /入口|侧门|排队|预约|ticket|gate|开门|闭馆|早到|避开|crowd|queue|entrance|booking|tip/i;

function itemLabel(item: ItineraryItem): string {
  return item.location_ref?.name?.trim() || String(item.type ?? 'POI');
}

export function buildHeuristicPoiPitfalls(item: ItineraryItem): string[] {
  const tips: string[] = [];
  const name = itemLabel(item).toLowerCase();
  const type = String(item.type ?? '').toUpperCase();
  const tags = (item.metadata as Record<string, unknown> | undefined)?.risk_tags;
  const tagStr = Array.isArray(tags) ? tags.join(' ') : '';

  if (/museum|博物馆|美术馆|gallery/.test(name) || type === 'POI' && /MUSEUM/i.test(tagStr)) {
    tips.push('博物馆建议开馆后 30 分钟内入场，热门展常需官网预约');
    tips.push('优先查「侧门/团体入口」分流，主入口高峰排队更长');
  }
  if (/寺|神社|庙|temple|shrine|mosque/.test(name)) {
    tips.push('宗教场所注意着装与静音；部分区域需脱鞋或禁止摄影');
  }
  if (/market|市集|夜市/.test(name)) {
    tips.push('市集类景点傍晚人流最大，想拍照可提前 1 小时或工作日前往');
  }
  if (/view|展望|观景台|tower|skytree|塔/.test(name)) {
    tips.push('观景台类景点日落时段最拥挤，可预约时段票或选非黄金时刻');
  }

  const notes = item.notes?.trim();
  if (notes && PITFALL_LINE_RE.test(notes)) {
    tips.push(notes.length > 120 ? `${notes.slice(0, 117)}…` : notes);
  }

  return [...new Set(tips)].slice(0, 3);
}

/** 从 RAG chunk 文本中抽取与 POI 相关的避坑句 */
export function extractPitfallLinesFromChunk(chunk: string, poiName: string): string[] {
  if (!chunk?.trim() || !poiName.trim()) return [];
  const nameLower = poiName.toLowerCase();
  const sentences = chunk
    .split(/[。！？\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 200);

  const matched = sentences.filter((s) => {
    const sl = s.toLowerCase();
    const nameHit = sl.includes(nameLower) || nameLower.split(/\s+/).some((w) => w.length > 2 && sl.includes(w));
    return nameHit && PITFALL_LINE_RE.test(s);
  });

  if (matched.length) return matched.slice(0, 2);

  return sentences.filter((s) => PITFALL_LINE_RE.test(s)).slice(0, 1);
}

export function collectItineraryPoiItems(itinerary: Itinerary): Array<{
  item: ItineraryItem;
  dayIndex: number;
  dayDate: string;
}> {
  const out: Array<{ item: ItineraryItem; dayIndex: number; dayDate: string }> = [];
  for (let i = 0; i < (itinerary.days?.length ?? 0); i++) {
    const day = itinerary.days[i];
    for (const item of day.items ?? []) {
      if (item.type === 'REST' || item.type === 'DRIVE' || item.type === 'TRANSIT') continue;
      if (!item.location_ref?.name?.trim()) continue;
      out.push({ item, dayIndex: i + 1, dayDate: day.date });
    }
  }
  return out;
}

export function buildPoiPitfallCards(
  itinerary: Itinerary,
  ragHintsByPoiId?: Record<string, string[]>,
): PoiPitfallCard[] {
  const cards: PoiPitfallCard[] = [];
  const seen = new Set<string>();

  for (const { item, dayIndex, dayDate } of collectItineraryPoiItems(itinerary)) {
    const key = item.id || item.location_ref?.place_id || itemLabel(item);
    if (seen.has(key)) continue;
    seen.add(key);

    const heuristic = buildHeuristicPoiPitfalls(item);
    const rag = ragHintsByPoiId?.[key] ?? ragHintsByPoiId?.[String(item.location_ref?.place_id ?? '')] ?? [];
    const tips = [...new Set([...heuristic, ...rag])].slice(0, 4);
    if (!tips.length) continue;

    const source: PoiPitfallCard['source'] =
      rag.length > 0 && heuristic.length > 0
        ? 'rag_snippet'
        : rag.length > 0
          ? 'rag_snippet'
          : item.notes?.trim()
            ? 'item_notes'
            : 'heuristic';

    cards.push({
      schema: POI_PITFALL_SCHEMA,
      poi_id: key,
      ...(item.location_ref?.place_id ? { place_id: String(item.location_ref.place_id) } : {}),
      label_zh: itemLabel(item),
      day_index: dayIndex,
      day_date: dayDate,
      tips_zh: tips,
      source,
      confidence: rag.length > 0 ? 'MEDIUM' : 'LOW',
    });
  }

  return cards.slice(0, 12);
}

export function mergePoiPitfallIntoNarration(
  narration: import('../../decision/kernel/interfaces/phase-executor.interface').NarrationLike,
  cards: PoiPitfallCard[],
): import('../../decision/kernel/interfaces/phase-executor.interface').NarrationLike {
  if (!cards.length) return narration;

  let tips = [...(narration.tips ?? [])];
  for (const card of cards.slice(0, 4)) {
    const line = `[避坑·${card.label_zh}] ${card.tips_zh[0]}`;
    if (!tips.some((t) => t.includes(card.label_zh))) {
      tips.unshift(line.slice(0, 500));
    }
  }
  if (tips.length > 14) tips = tips.slice(0, 14);

  return {
    ...narration,
    tips,
    poi_pitfall_cards: cards,
  };
}
