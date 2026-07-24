import type { CanonicalPOI } from '../../../canonical-poi-resolution/types/canonical-poi.types';
import { normalizePoiQuery } from '../../../canonical-poi-resolution/utils/normalize-poi-query.util';
import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';
import { extractMapAnchorPoiMentions } from './iceland-route-map-poi-anchors.util';

/** 在文本中扫描 catalog 别名，返回每个 POI 的展示用 mention */
export function extractCatalogPoiMentions(
  textBlob: string,
  catalog: CanonicalPOI[],
): string[] {
  const hayNorm = normalizePoiQuery(textBlob);
  if (!hayNorm) return [];

  const mentions: string[] = [];
  const matchedPoiIds = new Set<string>();

  const terms: Array<{ poiId: string; term: string }> = [];
  for (const poi of catalog) {
    for (const term of [poi.canonicalName, ...poi.aliases]) {
      if (term.trim().length >= 2) terms.push({ poiId: poi.poiId, term });
    }
  }
  terms.sort((a, b) => b.term.length - a.term.length);

  for (const { poiId, term } of terms) {
    if (matchedPoiIds.has(poiId)) continue;
    const termNorm = normalizePoiQuery(term);
    if (!termNorm || termNorm.length < 2) continue;
    if (hayNorm.includes(termNorm)) {
      matchedPoiIds.add(poiId);
      mentions.push(term);
    }
  }

  return mentions;
}

/** POI 可能出现的位置：narrative、highlights、每日 experience（不含 route/theme/summary） */
function collectPoiScanTexts(input: {
  narrative?: string;
  routeDetail?: ExplorationRouteDetailPayload | null;
}): string[] {
  const texts: string[] = [];
  if (input.narrative?.trim()) texts.push(input.narrative.trim());

  const detail = input.routeDetail;
  if (!detail) return texts;

  for (const highlight of detail.highlights ?? []) {
    if (highlight.trim()) texts.push(highlight.trim());
  }
  for (const day of detail.days ?? []) {
    if (day.experience?.trim()) texts.push(day.experience.trim());
    // route 仅用于 catalog 扫描（如「Vík → 冰河湖」），不会把整段路线当作 POI
    if (day.route?.trim()) texts.push(day.route.trim());
  }

  return texts;
}

export function extractRoutePoiMentionNames(input: {
  narrative?: string;
  routeDetail?: ExplorationRouteDetailPayload | null;
  catalog: CanonicalPOI[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const key = normalizePoiQuery(name);
    if (!key || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(name.trim());
  };

  for (const text of collectPoiScanTexts(input)) {
    for (const mention of extractCatalogPoiMentions(text, input.catalog)) {
      add(mention);
    }
  }

  for (const mention of extractMapAnchorPoiMentions(input.routeDetail)) {
    add(mention);
  }

  return out;
}
