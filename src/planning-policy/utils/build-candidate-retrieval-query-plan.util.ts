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

  const combinedLower = base.toLowerCase();
  const westfjordsIntent =
    /西峡湾|西部峡湾|韦斯特峡湾/i.test(userMessage) ||
    /\bwestfjords\b|\bísafjörður\b|\bisafjordur\b|\bvestfirðir\b/i.test(combinedLower);
  if (westfjordsIntent) {
    regionTags.push('westfjords');
    boostedTerms.push(
      'Westfjords Iceland',
      'Ísafjörður',
      'Isafjordur',
      'Dynjandi',
      'Látrabjarg',
      'domestic flight Iceland',
    );
  }

  const polarGreenlandIntent =
    /\bGL\b|格陵兰|greenland|\bnuuk\b|\bdisko\b|ilulissat|伊卢利萨特/i.test(combinedLower) ||
    regionId === 'greenland';
  if (polarGreenlandIntent) {
    regionTags.push('greenland');
    boostedTerms.push('Greenland Nuuk', 'Disko Bay', 'Arctic expedition', 'Ilulissat iceberg');
  }

  const polarSvalbardIntent =
    /\bSJ\b|斯瓦尔巴|svalbard|longyearbyen|朗伊尔/i.test(combinedLower) ||
    regionId === 'svalbard';
  if (polarSvalbardIntent) {
    regionTags.push('svalbard');
    boostedTerms.push('Svalbard Longyearbyen', 'polar bear safety', 'Arctic guide', 'aurora window');
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
