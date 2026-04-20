/**
 * 检索结果 → CGUS `RetrievalCategoryEvidence[]`（最强信号优先）。
 *
 * - **同类合并**：同一 `category` 多条命中时，保留 **最鲜** 证据（`ageHours` 最小 = `updated_at` 最晚）。
 * - **置信度过滤**：默认按 `hybridScore ?? similarity ?? denseScore` 打分；`scoreThreshold` 未设置则**不过滤**（避免 RRF hybrid≈0.001 被误杀）。Dense 主路径可设 `0.6`。
 * - **输出顺序**：规则/风险类优先于路况类，便于日志阅读（不影响 CGUS 聚合逻辑）。
 *
 * 端到端示例（编排层）：
 * ```ts
 * const chunks = await this.chunkRetrieval.retrieve({ query, limit: 12 });
 * const evidence = RetrievalEvidenceMapper.toEvidence(chunks, {
 *   scoreThreshold: 0.25,
 *   now: new Date(),
 * });
 * await this.cgusSearch.search(candidates, context, { retrievalCategoryEvidence: evidence });
 * ```
 */
import type { ChunkRetrievalResult } from '../services/chunk-retrieval.service';
import type { RetrievalCategoryEvidence } from '../../trips/decision/optimization/retrieval-category-constraint-boost';

export type RetrievalEvidenceMapperOptions = {
  /** 参考时间，默认 `Date.now()` */
  now?: Date;
  /**
   * 低于该打分的 chunk 不参与证据聚合。不传则不做分数过滤。
   * Dense 相似度多在 0–1，可用 `0.25`–`0.6`；Hybrid RRF 分数很小，请传极低阈值或留空。
   */
  scoreThreshold?: number;
  /** 自定义打分；默认 `hybridScore ?? similarity ?? denseScore` */
  selectScore?: (chunk: ChunkRetrievalResult) => number;
};

/** 输出排序：高压规则类在前，路况动态类次之，其余按字典序 */
const CATEGORY_PRIORITY: readonly string[] = [
  'RULES',
  'RISK_INFO',
  'ROAD_STATUS',
  'TRAFFIC_ALERT',
  'GATE',
  'DECISION_SUPPORT',
  'WEATHER',
  'POI_INFO',
  'GEOGRAPHY',
  'POI_HOURS',
  'ROUTE_INFO',
  'PRACTICAL',
  'GENERAL',
] as const;

function categoryRank(category: string): number {
  const i = CATEGORY_PRIORITY.indexOf(category as (typeof CATEGORY_PRIORITY)[number]);
  return i === -1 ? 100 + category.charCodeAt(0) : i;
}

function pushDerivedCategoriesFromStructuredData(
  out: Set<string>,
  metadata: unknown,
): void {
  const structured = (metadata as any)?.structured_data as any;
  if (!structured || typeof structured !== 'object') return;

  const fRoad = structured.f_road_required;
  const fRoadRequired =
    typeof fRoad?.required === 'boolean'
      ? fRoad.required
      : typeof fRoad?.required === 'string'
        ? ['true', '1', 'yes', 'y'].includes(String(fRoad.required).toLowerCase())
        : false;
  const roads: string[] = Array.isArray(fRoad?.roads) ? fRoad.roads.map((r: any) => String(r)) : [];
  const mentionsFRoad = roads.some((r) => /^F\d+/i.test(r.trim())) || roads.some((r) => /(^|\s)F\d+/i.test(r));

  // F-road / 4x4 constraints should affect feasibility and "rules/road status" stress in CGUS.
  if (fRoadRequired || mentionsFRoad) {
    out.add('RULES');
    out.add('ROAD_STATUS');
  }

  const opening = structured.opening_seasonal;
  const hasSeasonalSignal =
    (typeof opening?.summary === 'string' && opening.summary.trim().length > 0) ||
    Number.isFinite(opening?.open_month_from) ||
    Number.isFinite(opening?.open_month_to) ||
    Array.isArray(opening?.exceptions);

  // Seasonal opening is usually an accessibility/road condition gate (esp. highlands / passes).
  if (hasSeasonalSignal) {
    out.add('ROAD_STATUS');
  }

  const cost = structured.cost_info;
  const hasCostSignal =
    (typeof cost?.summary === 'string' && cost.summary.trim().length > 0) ||
    typeof cost?.currency === 'string' ||
    (Array.isArray(cost?.amounts) && cost.amounts.length > 0);
  if (hasCostSignal) {
    out.add('PRACTICAL');
  }
}

export class RetrievalEvidenceMapper {
  /**
   * 默认检索置信度分数（0–1 语义为主；RRF hybrid 为另一量级，勿与 0.6 阈值混用除非自定义 selectScore）。
   */
  static selectDefaultScore(chunk: ChunkRetrievalResult): number {
    const h = chunk.hybridScore;
    if (h !== undefined && h !== null && !Number.isNaN(h) && h > 0) {
      return h;
    }
    const d = chunk.denseScore;
    if (d !== undefined && d !== null && !Number.isNaN(d)) {
      return d;
    }
    return chunk.similarity ?? 0;
  }

  /**
   * 将 Chunk 列表转为 CGUS 证据行：每类至多一条，取该类下 **最鲜**（最小 `ageHours`）的一条。
   */
  static toEvidence(
    chunks: ChunkRetrievalResult[],
    options?: RetrievalEvidenceMapperOptions,
  ): RetrievalCategoryEvidence[] {
    const now = options?.now ?? new Date();
    const threshold = options?.scoreThreshold;
    const scoreOf = options?.selectScore ?? RetrievalEvidenceMapper.selectDefaultScore;

    /** category → 当前见到的最小 ageHours（最鲜）；无时间戳用 +∞ 表示「不参与抢鲜」 */
    const freshestAgeByCategory = new Map<string, number>();

    for (const chunk of chunks) {
      if (threshold !== undefined) {
        const s = scoreOf(chunk);
        if (!Number.isFinite(s) || s < threshold) {
          continue;
        }
      }

      const categories = new Set<string>();
      const baseCategory = chunk.category?.trim();
      if (baseCategory) {
        categories.add(baseCategory);
      }
      // Optional: derive stress-relevant evidence categories from structured_data without mutating stored labels.
      pushDerivedCategoriesFromStructuredData(categories, chunk.metadata);
      if (categories.size === 0) continue;

      const ageHours =
        chunk.chunkUpdatedAt !== undefined && chunk.chunkUpdatedAt !== null
          ? Math.max(0, (now.getTime() - chunk.chunkUpdatedAt.getTime()) / 3_600_000)
          : Number.POSITIVE_INFINITY;

      for (const category of categories) {
        const prev = freshestAgeByCategory.get(category);
        if (prev === undefined || ageHours < prev) {
          freshestAgeByCategory.set(category, ageHours);
        }
      }
    }

    const rows: RetrievalCategoryEvidence[] = [];
    for (const [category, ageVal] of freshestAgeByCategory) {
      if (ageVal === Number.POSITIVE_INFINITY) {
        rows.push({ category });
      } else {
        rows.push({ category, ageHours: ageVal });
      }
    }

    rows.sort((a, b) => {
      const dr = categoryRank(a.category) - categoryRank(b.category);
      if (dr !== 0) return dr;
      return a.category.localeCompare(b.category);
    });

    return rows;
  }
}
