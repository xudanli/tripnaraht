import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import { ICELAND_POI_SLUG_KEYWORDS } from '../regions/iceland-poi-slugs';
import { getAnchorRetrievalProfile } from '../regions/golden-circle-anchor-retrieval-profile';

/** Phase 3：候选召回 query 增强计划（RESEARCH / CandidateRetrieval 共用） */
export interface CandidateRetrievalQueryPlan {
  queryText: string;
  boostedTerms: string[];
  regionTags: string[];
  requiredAnchorSlugs: string[];
}

/**
 * 从用户文案 + 目的地 + poiPlanning slice 生成检索增强项（黄金圈样板优先）。
 */
export function buildCandidateRetrievalQueryPlan(
  userMessage: string,
  destinationHint: string,
  slice: PoiPlanningDecisionSlice | undefined,
): CandidateRetrievalQueryPlan {
  const base = `${userMessage} ${destinationHint}`.trim();
  const regionId = slice?.routeIntent?.regionId;
  const required = slice?.poiPlan?.requiredAnchorPoiIds ?? [];
  const profile = getAnchorRetrievalProfile(regionId);

  const boostedTerms: string[] = [];
  const regionTags: string[] = [];

  if (profile) {
    regionTags.push(profile.regionId);
    for (const a of profile.requiredAnchors) {
      boostedTerms.push(a.slug, ...a.aliases.slice(0, 6));
    }
  } else {
    for (const slug of required) {
      boostedTerms.push(slug);
      const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
      if (kws?.length) boostedTerms.push(...kws.slice(0, 4));
    }
  }

  const seen = new Set<string>();
  const unique = boostedTerms
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || seen.has(t.toLowerCase())) return false;
      seen.add(t.toLowerCase());
      return true;
    });

  return {
    queryText: base,
    boostedTerms: unique,
    regionTags: [...new Set(regionTags)],
    requiredAnchorSlugs: [...required],
  };
}

/** RESEARCH poi.search 多路结果去重合并（前者优先） */
export function mergeResearchPoiLists(primary: any[], secondary: any[], limit: number): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  const add = (items: any[]) => {
    for (const poi of items) {
      if (out.length >= limit) break;
      const key = `${poi?.poi_id ?? poi?.id ?? poi?.place_id ?? ''}|${String(poi?.name ?? '').toLowerCase()}`;
      if (!key.replace(/\|/g, '')) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(poi);
    }
  };
  add(primary);
  add(secondary);
  return out;
}
