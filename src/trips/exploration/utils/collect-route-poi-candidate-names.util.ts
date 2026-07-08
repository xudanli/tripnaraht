import type { CanonicalPOI } from '../../../canonical-poi-resolution/types/canonical-poi.types';
import { normalizePoiQuery } from '../../../canonical-poi-resolution/utils/normalize-poi-query.util';
import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';
import {
  extractCatalogPoiMentions,
  extractRoutePoiMentionNames,
} from './extract-route-poi-mentions.util';

const SEGMENT_SPLIT = /[、,，;；/|·]+/;
const SKIP_SEGMENT =
  /^(抵达|市区|采购|休整|周边|段|hub|day\s*\d+|返程|自由活动|补访|长途驾驶|渔村|海岸线|地热|观鸟|峡湾|高地\s*f\s*路|f\s*路|hub)$/i;

/** narrative 末尾「途经：A、B、C」— LLM / 模板写入 */
export function parseItineraryPoiClause(narrative?: string | null): string[] {
  if (!narrative?.trim()) return [];
  const match = narrative.match(/途经[：:]\s*([^。.\n]+)/);
  if (!match?.[1]) return [];
  return splitPlausibleSegments(match[1]);
}

export function splitPlausibleSegments(text: string): string[] {
  const out: string[] = [];
  for (const seg of text.split(SEGMENT_SPLIT)) {
    const t = seg.trim();
    if (isPlausiblePoiSegment(t)) out.push(t);
  }
  return out;
}

export function isPlausiblePoiSegment(segment: string): boolean {
  const t = segment.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (SKIP_SEGMENT.test(t)) return false;
  if (/^\d+(\.\d+)?\s*(h|小时|km|公里)/i.test(t)) return false;
  if (/^(雷克雅未克|reykjavik|akureyri|egilsstaðir|höfn|hofn|vik|vík)\s*(→|->|-)/i.test(t)) {
    return false;
  }
  if (/→/.test(t) && t.split(/→|->|-/).every((p) => p.trim().length <= 20)) {
    return false;
  }
  return true;
}

function collectSegmentSourceTexts(input: {
  narrative?: string;
  routeDetail?: ExplorationRouteDetailPayload | null;
}): string[] {
  const texts: string[] = [];
  const detail = input.routeDetail;
  if (!detail) return texts;

  for (const day of detail.days ?? []) {
    if (day.experience?.trim()) texts.push(day.experience.trim());
    if (day.route?.trim()) texts.push(day.route.trim());
  }
  for (const h of detail.highlights ?? []) {
    if (h.trim()) texts.push(h.trim());
  }
  return texts;
}

/**
 * 候选 POI mention 全集 — catalog 反向扫描 + LLM poiMentions + 分段正向抽取
 */
export function collectRoutePoiCandidateNames(input: {
  narrative?: string;
  routeDetail?: ExplorationRouteDetailPayload | null;
  catalog: CanonicalPOI[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (name: string) => {
    const trimmed = name.trim();
    const key = normalizePoiQuery(trimmed);
    if (!key || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const name of extractRoutePoiMentionNames(input)) {
    add(name);
  }

  for (const name of input.routeDetail?.poiMentions ?? []) {
    if (isPlausiblePoiSegment(name)) add(name);
  }

  for (const name of parseItineraryPoiClause(input.narrative)) {
    add(name);
  }

  for (const text of collectSegmentSourceTexts(input)) {
    for (const segment of splitPlausibleSegments(text)) {
      const catalogHits = extractCatalogPoiMentions(segment, input.catalog);
      if (catalogHits.length > 0) {
        for (const hit of catalogHits) add(hit);
      } else {
        add(segment);
      }
    }
  }

  return out;
}
