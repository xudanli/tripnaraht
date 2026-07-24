/**
 * 体验导向的轻量改排：多样性穿插、恢复型留白、节奏弧线微调
 */

import { DateTime } from 'luxon';
import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperienceFlowModel } from '../../trips/decision/models/experience-flow.model';
import type { ExperienceAlignCraftResult } from './experience-align.types';
import { classifyPoiExperienceCategory } from './experience-align-score.util';
import {
  buildMealBlockWindows,
  lunchStrategyInsightZh,
  resolveLunchStrategy,
  type LunchStrategy,
} from '../../planning-policy/utils/lunch-strategy.util';

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item })),
    })),
  };
}

function parseLocal(isoOrHm: string, dateIso: string): DateTime {
  if (/^\d{2}:\d{2}$/.test(isoOrHm)) {
    return DateTime.fromISO(`${dateIso}T${isoOrHm}`, { zone: 'Atlantic/Reykjavik' });
  }
  return DateTime.fromISO(isoOrHm, { zone: 'Atlantic/Reykjavik' });
}

function buildMealBlock(dateIso: string, strategy: LunchStrategy): ItineraryItem {
  const windows = buildMealBlockWindows(dateIso, strategy);
  return {
    id: `meal-${dateIso}-experience`,
    type: 'MEAL',
    start_window: windows.start_window,
    end_window: windows.end_window,
    location_ref: { name: windows.label },
    evidence_refs: [],
    verified: false,
    notes: `体验对齐：${lunchStrategyInsightZh(strategy)}`,
  };
}

/** 将连续同类 POI 做轻量交错（稳定排序：按强度交错） */
function interleaveSameCategoryPois(items: ItineraryItem[]): {
  items: ItineraryItem[];
  reordered: string[];
  rationale: string[];
} {
  const pois = items.filter((it) => it.type === 'POI');
  const nonPois = items.filter((it) => it.type !== 'POI');
  if (pois.length < 3) return { items, reordered: [], rationale: [] };

  const categories = pois.map((p) => classifyPoiExperienceCategory(p.location_ref.name, p.notes));
  let hasConsecutive = false;
  for (let i = 1; i < categories.length; i++) {
    if (categories[i] === categories[i - 1] && categories[i] !== 'other') {
      hasConsecutive = true;
      break;
    }
  }
  if (!hasConsecutive) return { items, reordered: [], rationale: [] };

  const buckets = new Map<string, ItineraryItem[]>();
  for (const poi of pois) {
    const cat = classifyPoiExperienceCategory(poi.location_ref.name, poi.notes);
    const list = buckets.get(cat) ?? [];
    list.push(poi);
    buckets.set(cat, list);
  }

  const reordered: ItineraryItem[] = [];
  const queues = [...buckets.values()];
  let round = 0;
  while (reordered.length < pois.length && round < pois.length + 2) {
    for (const q of queues) {
      if (q.length > 0) reordered.push(q.shift()!);
    }
    round++;
  }

  const reorderedIds = reordered.map((p) => p.id);
  const changed = pois.some((p, i) => p.id !== reorderedIds[i]);
  if (!changed) return { items, reordered: [], rationale: [] };

  const dateIso = pois[0]?.start_window?.slice(0, 10) ?? '1970-01-01';
  const merged = [...nonPois, ...reordered].sort(
    (a, b) => parseLocal(a.start_window, dateIso).toMillis() - parseLocal(b.start_window, dateIso).toMillis(),
  );
  return {
    items: merged,
    reordered: reorderedIds,
    rationale: ['体验对齐：交错连续同类景观，降低审美疲劳与感官过载。'],
  };
}

export function craftItineraryForExperience(params: {
  itinerary: Itinerary;
  targetDays: number[];
  experienceFlow: ExperienceFlowModel;
  lunchStrategy?: LunchStrategy;
  lunchStrategySignals?: Parameters<typeof resolveLunchStrategy>[0];
}): ExperienceAlignCraftResult {
  const lunchStrategy =
    params.lunchStrategy ?? resolveLunchStrategy(params.lunchStrategySignals ?? {});
  const working = cloneItinerary(params.itinerary);
  const insights_zh: string[] = [];
  const reordered_item_ids: string[] = [];
  let inserted_meal_blocks = 0;

  for (let i = 0; i < working.days.length; i++) {
    const dayNumber = i + 1;
    if (!params.targetDays.includes(dayNumber)) continue;

    const day = working.days[i];
    const hasMeal = day.items.some((it) => it.type === 'MEAL');
    const hasRest = day.items.some((it) => it.type === 'REST' || it.type === 'MEAL');

    if (
      (params.experienceFlow.tempo === 'EMPATHY_RECOVERY' || params.experienceFlow.surpriseBuffer < 0.15) &&
      !hasMeal &&
      day.items.filter((it) => it.type === 'POI').length >= 2
    ) {
      day.items.push(buildMealBlock(day.date, lunchStrategy));
      inserted_meal_blocks += 1;
      insights_zh.push(`第 ${dayNumber} 天：插入${buildMealBlockWindows(day.date, lunchStrategy).label}，保护体验不被连续转场侵蚀。`);
    } else if (!hasRest && params.experienceFlow.tempo === 'EMPATHY_RECOVERY') {
      insights_zh.push(`第 ${dayNumber} 天：建议保留午后咖啡/休息空档（人格恢复型节奏）。`);
    }

    const interleaved = interleaveSameCategoryPois(day.items);
    if (interleaved.reordered.length > 0) {
      day.items = interleaved.items;
      reordered_item_ids.push(...interleaved.reordered);
      insights_zh.push(...interleaved.rationale);
    }
  }

  return {
    itinerary: working,
    insights_zh,
    inserted_meal_blocks,
    reordered_item_ids,
  };
}
