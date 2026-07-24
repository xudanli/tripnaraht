/**
 * 离线 Entity Resolution 目录查找（不依赖 Qdrant 运行时）。
 * 与 `buildErQdrantCatalog` 同源，供 POI candidate pipeline entity_align 使用。
 */

import { buildErQdrantCatalog, type ErQdrantCatalogEntry } from './entity-resolution-qdrant-catalog';

let cachedByNormalizedName: Map<string, ErQdrantCatalogEntry> | null = null;

function normalizeLabel(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function ensureIndex(): Map<string, ErQdrantCatalogEntry> {
  if (cachedByNormalizedName) return cachedByNormalizedName;
  const map = new Map<string, ErQdrantCatalogEntry>();
  for (const entry of buildErQdrantCatalog()) {
    const key = normalizeLabel(entry.standard_name);
    if (key) map.set(key, entry);
  }
  cachedByNormalizedName = map;
  return map;
}

/** 测试用：重置缓存 */
export function resetErCatalogLookupCacheForTests(): void {
  cachedByNormalizedName = null;
}

export function lookupErCatalogByName(
  name: string | undefined | null,
): ErQdrantCatalogEntry | undefined {
  const key = normalizeLabel(String(name ?? ''));
  if (!key) return undefined;
  return ensureIndex().get(key);
}

/**
 * 对 POI 名称做 catalog 对齐：命中则写入 canonical entity 字段。
 */
export function alignPoiWithErCatalog<T extends Record<string, unknown>>(poi: T): T {
  const name = String(poi.name ?? poi.nameCN ?? '').trim();
  const hit = lookupErCatalogByName(name);
  if (!hit) return poi;
  return {
    ...poi,
    __er_entity_id: hit.entity_id,
    __er_standard_name: hit.standard_name,
    __er_kind: hit.kind,
    ...(hit.parent_destination ? { __er_parent_destination: hit.parent_destination } : {}),
  };
}
