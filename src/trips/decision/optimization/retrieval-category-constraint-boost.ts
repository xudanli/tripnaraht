/**
 * RAG 检索主类（chunk category / API belief）→ CGUS 统一公式中的软约束惩罚 λ 加权。
 *
 * - 高压类（RULES、路况簇等）抬高默认软约束 λ（__defaultSoft）。
 * - **时效性衰减（Recency Decay）**：ROAD_STATUS / TRAFFIC_ALERT（及 GATE 动态路况）在提供 `ageHours`
 *   时，对 λ 的提升随信息变旧而减弱（例如 2h 内满强度，24h+ 接近下限）。
 */

const DEFAULT_SOFT_LAMBDA = 0.5;
const STRESS_BOOST = 1.65;

/** 与 chunk-category-derive 中 GATE 扩展簇、规则类对齐 */
const STRESS_RETRIEVAL_CATEGORIES = new Set([
  'RULES',
  'RISK_INFO',
  'ROAD_STATUS',
  'TRAFFIC_ALERT',
  'GATE',
]);

/** 参与「新鲜度」衰减的类别（路况/关口动态信息） */
const RECENCY_DECAY_CATEGORIES = new Set(['ROAD_STATUS', 'TRAFFIC_ALERT', 'GATE']);

export type RetrievalCategoryEvidence = {
  category: string;
  /**
   * 该条证据距「现在」的小时数（由调用方用 chunk.updatedAt / lastVerifiedAt 等换算）。
   * 未传则视为仍有效（乘子 1），便于无时间戳语料渐进接入。
   */
  ageHours?: number;
};

function normCat(c: string): string {
  return c.trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * 路况类信息的时效乘子：≤2h 为 1；≥24h 降至约 0.3；中间线性插值。
 * 2h 前权重高于 24h 前，符合极端天气/封路场景。
 */
export function roadTrafficRecencyMultiplier(ageHours?: number): number {
  if (ageHours === undefined || ageHours < 0) return 1;
  if (ageHours <= 2) return 1;
  if (ageHours >= 24) return 0.3;
  const t = (ageHours - 2) / (24 - 2);
  return 1 - t * (1 - 0.3);
}

function boostedLambdaBase(): number {
  return Math.min(0.95, DEFAULT_SOFT_LAMBDA * STRESS_BOOST);
}

/**
 * 若 hints 中含任一高压类别，返回 `{ __defaultSoft: λ }`；
 * 否则返回空对象。
 */
export function buildConstraintPenaltyCoefficientsFromRetrievalHints(
  hints?: string[],
): Record<string, number> {
  if (!hints?.length) return {};
  const stressed = hints.some((h) => STRESS_RETRIEVAL_CATEGORIES.has(normCat(h)));
  if (!stressed) return {};
  return { __defaultSoft: boostedLambdaBase() };
}

/**
 * 带时效的证据行：在 hints 逻辑基础上，对 ROAD_STATUS / TRAFFIC_ALERT / GATE 行按 `ageHours` 乘衰减。
 */
export function buildConstraintPenaltyCoefficientsFromRetrievalEvidence(
  evidence?: RetrievalCategoryEvidence[],
): Record<string, number> {
  if (!evidence?.length) return {};
  const cats = evidence.map((e) => normCat(e.category));
  const stressed = cats.some((c) => STRESS_RETRIEVAL_CATEGORIES.has(c));
  if (!stressed) return {};

  const λ0 = boostedLambdaBase();

  const decayRows = evidence.filter((e) => RECENCY_DECAY_CATEGORIES.has(normCat(e.category)));
  let decay = 1;
  if (decayRows.length > 0) {
    decay = Math.min(...decayRows.map((e) => roadTrafficRecencyMultiplier(e.ageHours)));
  }

  return { __defaultSoft: Math.min(0.95, λ0 * decay) };
}
