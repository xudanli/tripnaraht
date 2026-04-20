import {
  getAnchorRetrievalProfile,
  type AnchorRetrievalEntry,
} from '../regions/golden-circle-anchor-retrieval-profile';
import { ICELAND_POI_SLUG_KEYWORDS } from '../regions/iceland-poi-slugs';

function haystackFromUnknownPoi(poi: unknown): string {
  if (!poi || typeof poi !== 'object') return '';
  const p = poi as Record<string, unknown>;
  return `${p.name ?? ''} ${p.nameCN ?? ''} ${p.nameEN ?? ''}`;
}

/** 是否有来自检索/DB 的稳定 id（非纯占位） */
export function researchPoiHasStableId(poi: unknown): boolean {
  if (!poi || typeof poi !== 'object') return false;
  const p = poi as Record<string, unknown>;
  const id = p.place_id ?? p.poi_id ?? p.id;
  if (id !== undefined && id !== null && String(id).trim() !== '') return true;
  return false;
}

/**
 * 黄金圈：用语义较强的 pattern/alias 判断是否命中某锚点 slug（用于 retrieved vs keyword）。
 */
export function goldenCircleEntityStrongMatch(poi: unknown, slug: string): boolean {
  const profile = getAnchorRetrievalProfile('golden_circle');
  if (!profile) return false;
  const entry = profile.requiredAnchors.find((a) => a.slug === slug);
  if (!entry) return false;
  return anchorEntryMatchesPoi(entry, haystackFromUnknownPoi(poi));
}

function anchorEntryMatchesPoi(entry: AnchorRetrievalEntry, hayRaw: string): boolean {
  const hay = hayRaw.toLowerCase();
  if (entry.slug === 'thingvellir' && !thingvellirStrongTokensPresent(hay)) {
    return false;
  }
  for (const pat of entry.dbNamePatterns ?? []) {
    const pl = pat.toLowerCase();
    if (pl.length > 0 && hay.includes(pl)) return true;
  }
  for (const a of entry.aliases) {
    const al = a.toLowerCase();
    if (al.length > 2 && hay.includes(al)) return true;
  }
  return false;
}

/** Phase 3.1：Þingvellir 必须出现地名特征之一，禁止仅靠「国家公园」等泛词 */
function thingvellirStrongTokensPresent(hayLower: string): boolean {
  return (
    hayLower.includes('thingvellir') ||
    hayLower.includes('þingvellir') ||
    hayLower.includes('pingvellir') ||
    hayLower.includes('辛格维利尔')
  );
}

/**
 * 按 region 尝试将 RESEARCH 行归一到锚点 slug（仅黄金圈强规则；其它返回 null）。
 */
export function matchAnchorSlugFromResearchPoi(poi: unknown, regionId?: string): string | null {
  const rid = regionId?.trim().toLowerCase();
  if (rid === 'golden_circle') {
    const profile = getAnchorRetrievalProfile('golden_circle');
    if (!profile) return null;
    const hay = haystackFromUnknownPoi(poi);
    for (const entry of profile.requiredAnchors) {
      if (anchorEntryMatchesPoi(entry, hay)) return entry.slug;
    }
  }
  return null;
}

/** 关键词兜底（与 merge 旧逻辑一致） */
export function keywordMatchResearchPoiToSlug(poi: unknown, slug: string): boolean {
  const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
  if (!kws?.length) return false;
  const hay = haystackFromUnknownPoi(poi).toLowerCase();
  return kws.some((k) => hay.includes(k.toLowerCase()));
}
