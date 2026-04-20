import { ICELAND_POI_SLUG_KEYWORDS } from '../regions/iceland-poi-slugs';
import {
  GOLDEN_CIRCLE_ANCHOR_MAPPINGS,
  type GoldenCircleAnchorSlug,
  aliasesForGoldenCircleAnchor,
} from '../regions/golden-circle-anchor-mappings';

/** 与 Orchestrator `Itinerary` 对齐的最小形状，避免 planning-policy 依赖 agent 层 */
export type MinimalItineraryItem = {
  type?: string;
  location_ref?: { name?: string };
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type MinimalItinerary = {
  days?: Array<{ items?: MinimalItineraryItem[] }>;
};

const GC_SLUGS: GoldenCircleAnchorSlug[] = ['thingvellir', 'geysir', 'gullfoss'];

const ALL_KNOWN_SLUGS = new Set([
  ...Object.keys(ICELAND_POI_SLUG_KEYWORDS),
  ...GC_SLUGS,
]);

function haystackFromPoi(poi: Record<string, unknown>): string {
  return `${poi?.name ?? ''} ${poi?.nameCN ?? ''} ${poi?.id ?? ''}`;
}

/** 第一层：锚点字段 → canonical（显式表 + 已知 slug） */
function resolveFromAnchorField(anchorRaw: string): string | null {
  const s = anchorRaw.trim().toLowerCase();
  if (!s) return null;
  if (ALL_KNOWN_SLUGS.has(s)) return s;
  for (const key of GC_SLUGS) {
    const aliases = aliasesForGoldenCircleAnchor(key);
    if (aliases.includes(s)) return key;
  }
  return null;
}

/** 第二层：id 精确等于已知 planning slug */
function resolveFromIdField(idRaw: string): string | null {
  const low = idRaw.trim().toLowerCase();
  if (!low) return null;
  return ALL_KNOWN_SLUGS.has(low) ? low : null;
}

/** 第三层：黄金圈显式别名（按别名长度降序，减少误命中） */
export function matchGoldenCircleSlugFromHaystack(haystackLower: string): GoldenCircleAnchorSlug | null {
  const hay = haystackLower;
  type Hit = { slug: GoldenCircleAnchorSlug; len: number };
  const hits: Hit[] = [];
  for (const slug of GC_SLUGS) {
    const { aliases } = GOLDEN_CIRCLE_ANCHOR_MAPPINGS[slug];
    for (const a of aliases) {
      const al = a.toLowerCase();
      if (hay.includes(al)) {
        hits.push({ slug, len: al.length });
      }
    }
    const can = slug.toLowerCase();
    if (hay.includes(can)) {
      hits.push({ slug, len: can.length });
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.len - a.len);
  return hits[0]!.slug;
}

/** 第四层：其余冰岛 slug 的 ICELAND_POI_SLUG_KEYWORDS（不含三锚点，避免与第三层重复口径） */
function matchOtherIcelandSlugsFromHaystack(haystackLower: string): string | null {
  const hay = haystackLower;
  for (const [slug, kws] of Object.entries(ICELAND_POI_SLUG_KEYWORDS)) {
    if (slug === 'thingvellir' || slug === 'geysir' || slug === 'gullfoss') continue;
    if (kws.some((k) => hay.includes(k.toLowerCase()))) return slug;
  }
  return null;
}

/**
 * 分层：① poi_planning_anchor_slug ② id ③ 黄金圈显式别名 ④ 其它冰岛关键词
 */
export function resolveIcelandPlanningSlugFromPoi(poi: unknown): string | null {
  if (!poi || typeof poi !== 'object') return null;
  const p = poi as Record<string, unknown>;

  const anchor = p.poi_planning_anchor_slug;
  if (typeof anchor === 'string' && anchor.trim()) {
    const r = resolveFromAnchorField(anchor);
    if (r) return r;
  }

  const id = p.id;
  if (typeof id === 'string' && id.trim()) {
    const r = resolveFromIdField(id);
    if (r) return r;
  }

  const hay = haystackFromPoi(p).toLowerCase();
  const gc = matchGoldenCircleSlugFromHaystack(hay);
  if (gc) return gc;

  return matchOtherIcelandSlugsFromHaystack(hay);
}

export function extractPlanningSlugsFromPois(pois: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const poi of pois) {
    const slug = resolveIcelandPlanningSlugFromPoi(poi);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

export function resolveIcelandPlanningSlugFromItineraryItem(item: MinimalItineraryItem): string | null {
  const meta = item.metadata as Record<string, unknown> | undefined;
  const anchor = meta?.poi_planning_anchor_slug ?? meta?.planning_poi_slug;
  if (typeof anchor === 'string' && anchor.trim()) {
    const r = resolveFromAnchorField(anchor);
    if (r) return r;
  }
  const hay = `${item.location_ref?.name ?? ''} ${item.notes ?? ''}`.toLowerCase();
  const gc = matchGoldenCircleSlugFromHaystack(hay);
  if (gc) return gc;
  return matchOtherIcelandSlugsFromHaystack(hay);
}

export function extractPlanningSlugsFromItinerary(itinerary: MinimalItinerary | undefined): string[] {
  if (!itinerary?.days?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const day of itinerary.days) {
    for (const item of day.items ?? []) {
      const slug = resolveIcelandPlanningSlugFromItineraryItem(item);
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        out.push(slug);
      }
    }
  }
  return out;
}

/** 必选锚点在 POI_SELECTION 最终列表中的 1-based 名次（未出现为 null）。 */
export function computeTopAnchorRanksInSelection(
  requiredAnchors: string[],
  scoredPois: unknown[],
): Record<string, number | null> {
  const ranks: Record<string, number | null> = {};
  const indexBySlug = new Map<string, number>();
  for (let i = 0; i < scoredPois.length; i++) {
    const slug = resolveIcelandPlanningSlugFromPoi(scoredPois[i]);
    if (slug && !indexBySlug.has(slug)) {
      indexBySlug.set(slug, i + 1);
    }
  }
  for (const a of requiredAnchors) {
    const key = a.trim().toLowerCase();
    ranks[a] = indexBySlug.get(key) ?? null;
  }
  return ranks;
}

export function countPoiPlanningFallbackInPois(pois: unknown[]): number {
  let n = 0;
  for (const poi of pois) {
    if (!poi || typeof poi !== 'object') continue;
    if ((poi as { source?: string }).source === 'poi_planning_fallback') n++;
  }
  return n;
}

/** Phase 2.3：缺失锚点的可解释原因（用于 coverage=0 排障） */
export type UnresolvedAnchorReason = 'not_in_topn' | 'name_unresolved' | 'slug_unmatched';

function haystackMatchesAnchorAlias(hayLower: string, anchorSlug: string): boolean {
  const aliases =
    anchorSlug === 'thingvellir' || anchorSlug === 'geysir' || anchorSlug === 'gullfoss'
      ? aliasesForGoldenCircleAnchor(anchorSlug)
      : [anchorSlug, ...(ICELAND_POI_SLUG_KEYWORDS[anchorSlug] ?? []).map((x) => x.toLowerCase())];
  return aliases.some((a) => a.length > 0 && hayLower.includes(a.toLowerCase()));
}

/**
 * 对「未进入 resolvedSlugs 的必选锚点」给出原因（POI 行 / itinerary 项共用逻辑）。
 * - not_in_topn：候选中无任何文本命中该锚点别名
 * - name_unresolved：有别名命中但分层解析仍得 null
 * - slug_unmatched：解析到其它 slug（与文本暗示的锚点不一致）
 */
export function computeUnresolvedAnchorReasons(
  requiredAnchors: string[],
  resolvedSlugs: string[],
  candidates: unknown[],
  options: {
    resolve: (c: unknown) => string | null;
    haystackLower: (c: unknown) => string;
  },
): Partial<Record<string, UnresolvedAnchorReason>> | undefined {
  if (!requiredAnchors.length || !candidates.length) return undefined;
  const resolved = new Set(resolvedSlugs.map((s) => s.trim().toLowerCase()));
  const out: Partial<Record<string, UnresolvedAnchorReason>> = {};
  const { resolve, haystackLower } = options;

  for (const raw of requiredAnchors) {
    const key = raw.trim().toLowerCase();
    if (resolved.has(key)) continue;

    let anyAliasHit = false;
    let sawNull = false;
    let sawWrong = false;

    for (const c of candidates) {
      const hay = haystackLower(c);
      if (!haystackMatchesAnchorAlias(hay, key)) continue;
      anyAliasHit = true;
      const got = resolve(c);
      if (got === null) sawNull = true;
      else if (got !== key) sawWrong = true;
    }

    if (!anyAliasHit) {
      out[raw] = 'not_in_topn';
    } else if (sawWrong) {
      out[raw] = 'slug_unmatched';
    } else if (sawNull) {
      out[raw] = 'name_unresolved';
    } else {
      out[raw] = 'not_in_topn';
    }
  }

  return Object.keys(out).length ? out : undefined;
}

/** POI_SELECTION TopN 行：候选为 research/scored POI 对象 */
export function computeUnresolvedAnchorReasonsForPoiRows(
  requiredAnchors: string[],
  resolvedSlugs: string[],
  scoredPois: unknown[],
): Partial<Record<string, UnresolvedAnchorReason>> | undefined {
  return computeUnresolvedAnchorReasons(requiredAnchors, resolvedSlugs, scoredPois, {
    resolve: resolveIcelandPlanningSlugFromPoi,
    haystackLower: (poi) => haystackFromPoi(poi as Record<string, unknown>).toLowerCase(),
  });
}

/** 最终 itinerary 项 */
export function computeUnresolvedAnchorReasonsForItineraryItems(
  requiredAnchors: string[],
  resolvedSlugs: string[],
  items: MinimalItineraryItem[],
): Partial<Record<string, UnresolvedAnchorReason>> | undefined {
  return computeUnresolvedAnchorReasons(requiredAnchors, resolvedSlugs, items, {
    resolve: (item) => resolveIcelandPlanningSlugFromItineraryItem(item as MinimalItineraryItem),
    haystackLower: (item) => {
      const it = item as MinimalItineraryItem;
      return `${it.location_ref?.name ?? ''} ${it.notes ?? ''}`.toLowerCase();
    },
  });
}
