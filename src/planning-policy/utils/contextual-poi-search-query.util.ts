import type { PoiSearchContext } from '../types/poi-search-context.types';

const MAX_SUFFIX_WORDS = 14;

/** 从上下文字段拼检索 query 后缀（符号化 contextualization，非 embedding） */
export function buildContextualPoiSearchQuerySuffix(ctx: PoiSearchContext): string {
  const terms: string[] = [];

  if (ctx.tripStyle?.length) {
    terms.push(...ctx.tripStyle.slice(0, 4));
  }

  if (ctx.pacing === 'intensive') {
    terms.push('iconic', 'landmarks', 'efficient', 'route');
  } else if (ctx.pacing === 'relaxed') {
    terms.push('slow', 'travel', 'neighborhood', 'cafe', 'walk');
  }

  if (typeof ctx.fatigueScore === 'number' && ctx.fatigueScore >= 0.45) {
    terms.push('easy', 'walk', 'light', 'activity', 'rest', 'friendly');
  }

  if (typeof ctx.noveltyBias === 'number' && ctx.noveltyBias >= 0.45) {
    terms.push('hidden', 'gems', 'local', 'favorites', 'less', 'crowded');
  }

  const cond = ctx.weather?.condition?.toLowerCase() ?? '';
  if (cond.includes('elevated_precip') || cond.includes('windy')) {
    terms.push('weather', 'flexible', 'indoor', 'options', 'scenic', 'drive');
  }

  if (ctx.selectedPoiIds?.length) {
    terms.push('variety', 'alternatives', 'beyond', 'classics');
  }

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(t.trim());
    if (uniq.length >= MAX_SUFFIX_WORDS) break;
  }
  return uniq.length ? ` ${uniq.join(' ')}` : '';
}

/** hard exclude：从检索合并列表中剔除 rejected id（place_id / poi_id 大小写不敏感） */
export function filterPoisByRejectedIds<T extends { poi_id?: unknown; id?: unknown; place_id?: unknown }>(
  pois: T[],
  rejectedPoiIds: string[] | undefined,
): T[] {
  if (!rejectedPoiIds?.length) return pois;
  const rej = new Set(rejectedPoiIds.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  if (!rej.size) return pois;
  return pois.filter((p) => {
    const k = String(p.poi_id ?? p.id ?? p.place_id ?? '')
      .trim()
      .toLowerCase();
    return !k || !rej.has(k);
  });
}
