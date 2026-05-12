/**
 * KnowledgeFile / 管理端文档 taxonomy：
 * — 六类 canonical collection（与 DB category 存储对齐，推荐写入下列值）
 * — 每类允许的 subType（varchar + 后端校验）
 * — 旧集合名 / Loader category → canonical 与列表筛选 expansion
 */

export const CANONICAL_COLLECTIONS = [
  'decision-support',
  'geography',
  'pois',
  'practical',
  'risks',
  'routes',
] as const;

export type CanonicalCollection = (typeof CANONICAL_COLLECTIONS)[number];

export const SUB_TYPES_BY_COLLECTION: Record<
  CanonicalCollection,
  readonly string[]
> = {
  'decision-support': [
    'persona',
    'scoring_matrix',
    'decision_case',
    'admission_standard',
  ],
  geography: ['climate', 'admin_divisions', 'landform'],
  pois: ['attraction', 'hotel', 'restaurant'],
  practical: ['visa', 'connectivity', 'clothing', 'driving'],
  risks: ['weather_threshold', 'road_closure', 'rescue_point'],
  routes: ['itinerary_template'],
};

/** DB / Loader 里可能出现的 category 字符串 → 归入哪一类 canonical（用于 outbound 展示与校验） */
export const COLLECTION_DB_EXPANSION: Record<
  CanonicalCollection,
  readonly string[]
> = {
  'decision-support': ['decision-support', 'decision_support'],
  geography: ['geography', 'geography_seasonal'],
  pois: ['pois'],
  practical: ['practical', 'practical_guides', 'compliance_rules'],
  risks: ['risks', 'safety'],
  routes: [
    'routes',
    'travel_guides',
    'general',
    'knowledge-base',
    'knowledge_base',
    'accessibility',
  ],
};

const CANONICAL_SET = new Set<string>(CANONICAL_COLLECTIONS);

/** 请求体 / 查询参数中的旧名称 → canonical（写入或列表筛选归一化） */
const COLLECTION_ALIAS_TO_CANONICAL: Record<string, CanonicalCollection> = {
  travel_guides: 'routes',
  'travel-guides': 'routes',
  logic_assets: 'decision-support',
  'logic-assets': 'decision-support',
  compliance_rules: 'practical',
  'compliance-rules': 'practical',
  decision_support: 'decision-support',
  geography_seasonal: 'geography',
  'geography-seasonal': 'geography',
  practical_guides: 'practical',
  'practical-guides': 'practical',
  safety: 'risks',
  knowledge_base: 'routes',
  'knowledge-base': 'routes',
  general: 'routes',
  accessibility: 'routes',
};

export function tryNormalizeCollection(
  input: string,
): CanonicalCollection | null {
  const t = input.trim();
  if (!t) return null;
  if (COLLECTION_ALIAS_TO_CANONICAL[t]) {
    return COLLECTION_ALIAS_TO_CANONICAL[t];
  }
  const hyphen = t.replace(/_/g, '-').toLowerCase();
  if (COLLECTION_ALIAS_TO_CANONICAL[hyphen]) {
    return COLLECTION_ALIAS_TO_CANONICAL[hyphen];
  }
  if (COLLECTION_ALIAS_TO_CANONICAL[t.replace(/_/g, '-')]) {
    return COLLECTION_ALIAS_TO_CANONICAL[t.replace(/_/g, '-')];
  }
  if (CANONICAL_SET.has(hyphen)) {
    return hyphen as CanonicalCollection;
  }
  return null;
}

export function normalizeCollectionForWrite(input: string): CanonicalCollection {
  const n = tryNormalizeCollection(input);
  if (!n) {
    throw new Error(
      `collection 无效或不支持: ${input}。允许: ${CANONICAL_COLLECTIONS.join(', ')}；或旧别名如 travel_guides、compliance_rules（将映射到新分类）。`,
    );
  }
  return n;
}

/** 列表 / 统计：按 collection 参数展开为 DB 中可能出现的 category 值 */
export function expandCollectionForFilter(input: string): string[] {
  const canonical = tryNormalizeCollection(input);
  if (canonical) {
    return [...COLLECTION_DB_EXPANSION[canonical]];
  }
  return [input.trim()];
}

/**
 * 将表中存的一条 category 转为对外 canonical 字符串（列表/详情 collection 字段）
 */
export function outboundCollection(dbCategory: string): string {
  const direct = tryNormalizeCollection(dbCategory);
  if (direct) return direct;
  for (const canon of CANONICAL_COLLECTIONS) {
    if (COLLECTION_DB_EXPANSION[canon].includes(dbCategory)) {
      return canon;
    }
  }
  return dbCategory;
}

export function assertSubTypeAllowed(
  collection: CanonicalCollection,
  subType: string | undefined | null,
): void {
  if (subType === undefined || subType === null || subType.trim() === '') {
    return;
  }
  const s = subType.trim();
  const allowed = SUB_TYPES_BY_COLLECTION[collection];
  if (!allowed.includes(s)) {
    throw new Error(
      `subType「${s}」不属于 collection「${collection}」。允许: ${allowed.join(', ')}`,
    );
  }
}

/** 更新 subType 校验时用：由表中已有 category 得到 canonical */
export function canonicalFromStoredCategory(
  dbCategory: string,
): CanonicalCollection {
  const o = outboundCollection(dbCategory);
  const n = tryNormalizeCollection(o);
  if (n) return n;
  throw new Error(`无法将已存储的 category「${dbCategory}」映射到标准集合，请先迁移或修正数据`);
}
