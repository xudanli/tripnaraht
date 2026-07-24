/**
 * POI 库「最佳日落机位」标签识别与锚点排序
 */

import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import { iterPoiEvidenceRows } from '../../agent/utils/opening-hours-evidence-hydration.util';
import {
  isGoldenHourViewpoint,
  poiSensoryEnergy,
} from './experience-poi-taxonomy.util';

/** 与决策内核 environmental-physics / POI metadata 对齐 */
export const SUNSET_VIEWPOINT_TAGS = [
  'best_sunset_viewpoint',
  'best_sunset',
  'sunset_viewpoint',
  'golden_hour',
  'landscape_photography',
] as const;

export const AURORA_POI_TAGS = ['aurora', 'aurora_hunting', 'stargazing', 'nightview'] as const;

function normalizePoiIdKey(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s;
}

function normalizeTag(tag: unknown): string {
  return String(tag ?? '').trim().toLowerCase();
}

function hasTag(tags: string[], candidates: readonly string[]): boolean {
  const set = new Set(tags.map(normalizeTag));
  return candidates.some((t) => set.has(normalizeTag(t)));
}

function collectTagsFromRow(row: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (Array.isArray(v)) v.forEach((t) => out.add(normalizeTag(t)));
    else if (typeof v === 'string') out.add(normalizeTag(v));
  };
  push(row.tags);
  const meta = row.metadata;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    push(m.tags);
    push(m.poi_tags);
    push(m.experience_tags);
  }
  return [...out].filter(Boolean);
}

function readBestTimeOfDay(row: Record<string, unknown>): string[] {
  const meta = row.metadata;
  const direct = row.bestTimeOfDay;
  const fromMeta =
    meta && typeof meta === 'object'
      ? (meta as Record<string, unknown>).bestTimeOfDay
      : undefined;
  const src = Array.isArray(direct) ? direct : Array.isArray(fromMeta) ? fromMeta : [];
  return src.map((t) => normalizeTag(t));
}

export interface PoiViewpointEvidence {
  poiId: string;
  tags: string[];
  bestTimeOfDay: string[];
  isBestSunsetViewpoint: boolean;
  isAuroraSpot: boolean;
}

export function buildPoiViewpointIndex(
  researchData?: Record<string, unknown>,
): Map<string, PoiViewpointEvidence> {
  const index = new Map<string, PoiViewpointEvidence>();
  for (const row of iterPoiEvidenceRows(researchData)) {
    const poiId = normalizePoiIdKey(row.poi_id ?? row.id ?? row.place_id);
    if (!poiId) continue;
    const tags = collectTagsFromRow(row);
    const bestTimeOfDay = readBestTimeOfDay(row);
    index.set(poiId, {
      poiId,
      tags,
      bestTimeOfDay,
      isBestSunsetViewpoint:
        hasTag(tags, SUNSET_VIEWPOINT_TAGS) || bestTimeOfDay.includes('sunset'),
      isAuroraSpot: hasTag(tags, AURORA_POI_TAGS) || bestTimeOfDay.includes('night'),
    });
  }
  return index;
}

function collectItemTags(item: ItineraryItem): string[] {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const tags: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) tags.push(...v.map((t) => normalizeTag(t)));
  };
  push(meta.tags);
  push(meta.poi_tags);
  push(meta.experience_tags);
  return tags.filter(Boolean);
}

export interface SunsetAnchorScore {
  item: ItineraryItem;
  score: number;
  source: 'poi_tag' | 'name_heuristic' | 'none';
  tagLabel?: string;
}

export function scoreSunsetAnchorCandidate(
  item: ItineraryItem,
  poiIndex: Map<string, PoiViewpointEvidence>,
): SunsetAnchorScore {
  if (item.type !== 'POI') {
    return { item, score: 0, source: 'none' };
  }

  const itemTags = collectItemTags(item);
  const poiId = normalizePoiIdKey(item.location_ref?.place_id);
  const evidence = poiId ? poiIndex.get(poiId) : undefined;
  const mergedTags = [...itemTags, ...(evidence?.tags ?? [])];

  if (hasTag(mergedTags, ['best_sunset_viewpoint', 'best_sunset'])) {
    return { item, score: 120, source: 'poi_tag', tagLabel: '最佳日落机位' };
  }
  if (hasTag(mergedTags, ['sunset_viewpoint', 'golden_hour', 'landscape_photography'])) {
    return { item, score: 100, source: 'poi_tag', tagLabel: '黄金时刻机位' };
  }
  if (evidence?.bestTimeOfDay.includes('sunset')) {
    return { item, score: 95, source: 'poi_tag', tagLabel: '推荐日落时段' };
  }

  if (isGoldenHourViewpoint(item.location_ref.name, item.notes)) {
    const energyBoost = poiSensoryEnergy(item.location_ref.name, item.notes) === 'high' ? 12 : 0;
    return { item, score: 55 + energyBoost, source: 'name_heuristic' };
  }

  return { item, score: 0, source: 'none' };
}

export function pickBestSunsetAnchor(
  items: ItineraryItem[],
  poiIndex: Map<string, PoiViewpointEvidence>,
): SunsetAnchorScore | undefined {
  const ranked = items
    .map((it) => scoreSunsetAnchorCandidate(it, poiIndex))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0];
}
