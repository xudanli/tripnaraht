import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import { ICELAND_POI_SLUG_KEYWORDS } from '../regions/iceland-poi-slugs';
import { resolveIcelandPlanningSlugFromPoi } from './poi-planning-slug-resolve.util';

function haystackFromPoiRow(poi: unknown): string {
  if (!poi || typeof poi !== 'object') return '';
  const p = poi as Record<string, unknown>;
  return `${p.name ?? ''} ${p.nameCN ?? ''}`;
}

/** 分层解析命中或关键词命中（与 merge 口径一致） */
export function poiRowMatchesRequiredAnchorSlug(poi: unknown, slug: string): boolean {
  const key = slug.trim().toLowerCase();
  const resolved = resolveIcelandPlanningSlugFromPoi(poi);
  if (resolved && resolved.trim().toLowerCase() === key) return true;
  const hay = haystackFromPoiRow(poi).toLowerCase();
  if (!hay) return false;
  const kws = ICELAND_POI_SLUG_KEYWORDS[key];
  if (kws?.some((k) => hay.includes(k.toLowerCase()))) return true;
  return false;
}

/**
 * Phase 2.6：TopN 输出前最后一跳 —— 从全量候选中抽出必选锚点（或 fallback），前置拼接后再截断。
 * 不依赖前置是否已注入 `poi_planning_anchor_slug`（关键词匹配兜底）。
 */
export function enforceRequiredAnchorsTopN(
  topN: unknown[],
  allCandidates: unknown[],
  requiredSlugs: string[],
  limit: number,
  options?: {
    createFallbackForSlug?: (slug: string) => unknown;
  },
): unknown[] {
  const req = requiredSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (req.length === 0 || limit <= 0) {
    return Array.isArray(topN) ? topN.slice(0, limit) : [];
  }

  const usedKeys = new Set<string>();
  const protectedList: unknown[] = [];

  for (const slug of req) {
    const found = allCandidates.find((c) => {
      const idk = poiPlanningRowIdentityKey(c);
      if (!idk || usedKeys.has(idk)) return false;
      return poiRowMatchesRequiredAnchorSlug(c, slug);
    });
    if (found) {
      usedKeys.add(poiPlanningRowIdentityKey(found));
      protectedList.push(found);
    } else if (options?.createFallbackForSlug) {
      const stub = options.createFallbackForSlug(slug);
      usedKeys.add(poiPlanningRowIdentityKey(stub));
      protectedList.push(stub);
    }
  }

  const protCap = Math.min(protectedList.length, limit);
  const admitted = protectedList.slice(0, protCap);
  const admitKeys = new Set(admitted.map((p) => poiPlanningRowIdentityKey(p)));
  const rest = topN.filter((p) => {
    const k = poiPlanningRowIdentityKey(p);
    return k && !admitKeys.has(k);
  });
  return [...admitted, ...rest].slice(0, limit);
}

/** RESEARCH / POI 行稳定键（用于去重与 protected 池） */
export function poiPlanningRowIdentityKey(poi: unknown): string {
  if (!poi || typeof poi !== 'object') return '';
  const p = poi as Record<string, unknown>;
  const id = p.place_id ?? p.id;
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    return `id:${String(id)}`;
  }
  const n = `${p.name ?? ''}|${p.nameCN ?? ''}|${p.poi_planning_anchor_slug ?? ''}`;
  return `n:${n.toLowerCase()}`;
}

/**
 * Phase 2.5：在已按分数排好序的候选中，按 requiredAnchor 顺序各取一条带 `poi_planning_anchor_slug` 的行，
 * 其余进入 rest，供后续聚类/截断 —— 保证必选锚点不被空间聚类挤掉。
 */
export function pickRequiredAnchorPoisInOrder(
  candidates: unknown[],
  requiredSlugs: string[],
): { protectedPois: unknown[]; rest: unknown[] } {
  const req = requiredSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (req.length === 0) {
    return { protectedPois: [], rest: [...candidates] };
  }
  const used = new Set<string>();
  const protectedPois: unknown[] = [];
  for (const slug of req) {
    const found = candidates.find((c) => {
      if (!c || typeof c !== 'object') return false;
      const p = c as Record<string, unknown>;
      const ps = String(p.poi_planning_anchor_slug ?? '').trim().toLowerCase();
      if (ps !== slug) return false;
      const key = poiPlanningRowIdentityKey(c);
      if (used.has(key)) return false;
      return true;
    });
    if (found) {
      used.add(poiPlanningRowIdentityKey(found));
      protectedPois.push(found);
    }
  }
  const rest = candidates.filter((c) => !used.has(poiPlanningRowIdentityKey(c)));
  return { protectedPois, rest };
}

export type PoiPlanningAdmissionDiagnostics = {
  requiredAnchorCandidatePresence: Record<string, string>;
  requiredAnchorAdmissionStage: Record<string, string>;
};

/**
 * Phase 2.5 排障：锚点在 merge / 打分池 / 最终 TopN 哪一阶段丢失。
 */
export function buildPoiPlanningAdmissionDiagnostics(
  slice: PoiPlanningDecisionSlice | undefined,
  afterMergePois: unknown[],
  scoredPoolPois: unknown[],
  finalTopPois: unknown[],
): PoiPlanningAdmissionDiagnostics | undefined {
  const required = slice?.poiPlan?.requiredAnchorPoiIds ?? [];
  if (required.length === 0) return undefined;

  const poolSlugSet = new Set<string>();
  for (const p of scoredPoolPois) {
    const s = resolveIcelandPlanningSlugFromPoi(p);
    if (s) poolSlugSet.add(s.trim().toLowerCase());
  }
  const finalSlugSet = new Set<string>();
  for (const p of finalTopPois) {
    const s = resolveIcelandPlanningSlugFromPoi(p);
    if (s) finalSlugSet.add(s.trim().toLowerCase());
  }

  const presence: Record<string, string> = {};
  const stage: Record<string, string> = {};

  for (const raw of required) {
    const key = raw.trim().toLowerCase();
    const inMerge = afterMergePois.find((p) => {
      if (!p || typeof p !== 'object') return false;
      const slug = String((p as Record<string, unknown>).poi_planning_anchor_slug ?? '')
        .trim()
        .toLowerCase();
      return slug === key;
    });
    if (!inMerge) {
      presence[raw] = 'absent_after_merge';
      stage[raw] = 'missing';
      continue;
    }
    const src = String((inMerge as Record<string, unknown>).source ?? '');
    presence[raw] =
      src === 'poi_planning_fallback' ? 'fallback_placeholder' : 'matched_in_research';

    if (finalSlugSet.has(key)) {
      stage[raw] = 'in_topn';
    } else if (poolSlugSet.has(key)) {
      stage[raw] = 'dropped_before_topn';
    } else {
      stage[raw] = 'not_in_scored_pool';
    }
  }

  return { requiredAnchorCandidatePresence: presence, requiredAnchorAdmissionStage: stage };
}
