/**
 * 从 KnowledgeFile 与 chunk 特征推导 chunks.category（与 RAG chunkCategory 过滤对齐）。
 *
 * **标签降级（Label Fallback）**：数据库可存细分标签（如 RISK_INFO、ROUTE_INFO），
 * API/意图层传入「核心 chunkCategory」时，用 `expandChunkCategoryForRetrievalFilter`
 * 展开为 SQL 的 OR 条件，避免丢失细分语料。
 */

export type ChunkCategoryLabel =
  | 'POI_INFO'
  | 'RULES'
  | 'DECISION_SUPPORT'
  | 'WEATHER'
  | 'GENERAL'
  | 'ROUTE_INFO'
  | 'RISK_INFO'
  | 'PRACTICAL'
  | 'GEOGRAPHY'
  | 'POI_HOURS'
  | 'ROAD_STATUS'
  | 'TRAFFIC_ALERT';

/**
 * 检索 API / QueryIntent 使用的核心 chunkCategory（可扩展；未知值按原字符串精确匹配）。
 */
export type ApiCoreChunkCategory =
  | 'RULES'
  | 'POI_INFO'
  | 'GATE'
  | 'WEATHER'
  | 'GENERAL'
  | 'DECISION_SUPPORT';

/**
 * 核心 API 类别 → 数据库 `chunks.category` 可匹配集合（保持库内细分标签，不合并写回）。
 *
 * - ROUTE_INFO → 由 DECISION_SUPPORT 检索一并命中（路线规划独立于 POI）
 * - RISK_INFO → 由 RULES 命中（风险与通行/安全规则强相关）
 * - PRACTICAL → 由 GENERAL 命中
 * - GEOGRAPHY / POI_HOURS → 由 POI_INFO 命中
 * - GATE → 动态路况簇：GATE、ROAD_STATUS、TRAFFIC_ALERT（Vegagerðin / 封路等）
 */
const API_CHUNK_CATEGORY_TO_DB_LABELS: Record<string, readonly string[]> = {
  RULES: ['RULES', 'RISK_INFO'],
  POI_INFO: ['POI_INFO', 'GEOGRAPHY', 'POI_HOURS'],
  GATE: ['GATE', 'ROAD_STATUS', 'TRAFFIC_ALERT'],
  WEATHER: ['WEATHER'],
  GENERAL: ['GENERAL', 'PRACTICAL'],
  DECISION_SUPPORT: ['DECISION_SUPPORT', 'ROUTE_INFO'],
};

/**
 * 将 API 传入的 chunkCategory 展开为数据库侧可匹配的 category 列表（去重、保序）。
 * 非映射表中的值（如已直接存库的 `ROUTE_INFO`）原样单元素返回，便于高级调用方精确过滤。
 */
export function expandChunkCategoryForRetrievalFilter(chunkCategory: string): string[] {
  const raw = chunkCategory.trim();
  if (!raw) return [];
  const key = raw.replace(/\s+/g, '_').toUpperCase();
  const mapped = API_CHUNK_CATEGORY_TO_DB_LABELS[key];
  if (mapped) return [...mapped];
  return [raw];
}

function normalizeFilename(name: string): string {
  return name.toLowerCase();
}

function metadataType(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const t = (metadata as Record<string, unknown>).type;
  return typeof t === 'string' ? t : undefined;
}

export function deriveChunkCategory(input: {
  filename: string;
  fileCategory: string;
  chunkType: string;
  metadata?: unknown;
}): ChunkCategoryLabel {
  const fn = normalizeFilename(input.filename);
  const fc = input.fileCategory.toLowerCase();
  const ct = (input.chunkType || '').toLowerCase();
  const metaType = (metadataType(input.metadata) || '').toLowerCase();

  if (metaType === 'traffic_alert' || metaType === 'traffic-alert') {
    return 'TRAFFIC_ALERT';
  }
  if (metaType === 'road_status') {
    return 'ROAD_STATUS';
  }

  if (
    fc === 'road_status' ||
    /road-status|road_status|vegagerd|vegagerð|vegamál|closure.*road|road.*clos/i.test(fn)
  ) {
    return 'ROAD_STATUS';
  }

  if (
    /weather|tide|seasonal|climate|ferry|terrain/.test(fn) ||
    fc === 'geography_seasonal' ||
    fc === 'weather_windows' ||
    fc === 'ferry_schedules'
  ) {
    return 'WEATHER';
  }

  if (metaType === 'f-road' || metaType === 'f_road' || metaType === 'froad') {
    return 'RULES';
  }

  if (
    fc === 'pois' ||
    /poi|accommodation|attraction|service|supplies|campsite|campground|gas|fuel|charging/.test(fn)
  ) {
    return 'POI_INFO';
  }

  if (
    fc === 'compliance_rules' ||
    fc === 'official_regulations' ||
    fc === 'official_policy' ||
    fc === 'official_government' ||
    fc === 'official_visa' ||
    /rules|laws|compliance|regulation|ordinance/.test(fn)
  ) {
    return 'RULES';
  }

  if (
    ct.includes('decision') ||
    ct.includes('path') ||
    fc === 'decision_support' ||
    /rhythm|persona|feasibility/.test(fn)
  ) {
    return 'DECISION_SUPPORT';
  }

  const fileFallback: Record<string, ChunkCategoryLabel> = {
    routes: 'ROUTE_INFO',
    safety: 'RISK_INFO',
    practical_guides: 'PRACTICAL',
    general: 'GENERAL',
    'knowledge-base': 'GENERAL',
    culture: 'GENERAL',
    logistics: 'GENERAL',
    accessibility: 'GENERAL',
    official_tourism: 'GENERAL',
    official_national: 'GENERAL',
    official_regional: 'GENERAL',
    official_resources: 'GENERAL',
    official_tourism_board: 'GENERAL',
  };

  if (fileFallback[fc]) {
    return fileFallback[fc];
  }

  return 'GENERAL';
}
