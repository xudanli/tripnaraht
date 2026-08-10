/**
 * 将 Place / EntityResolution 行映射为 poi.search 证据字段。
 * 让 LLM enrich 的 description / visitTipCN / 时长能进入 RESEARCH→PLAN。
 */

export type PoiSearchEvidenceFields = {
  description?: string;
  visitTipCN?: string;
  tags?: string[];
  duration_minutes?: number;
  estimated_duration_min?: number;
  level?: string;
};

function firstPositive(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8);
}

/**
 * 从 place 行 / entity resolution 结果提取可供行程生成消费的文案与时长。
 */
export function extractPoiSearchEvidenceFields(source: {
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  category?: string | null;
}): PoiSearchEvidenceFields {
  const meta =
    source.metadata && typeof source.metadata === 'object'
      ? (source.metadata as Record<string, unknown>)
      : {};
  const llm =
    meta.llmDescription && typeof meta.llmDescription === 'object'
      ? (meta.llmDescription as Record<string, unknown>)
      : {};

  const description = String(source.description ?? meta.description ?? '').trim() || undefined;
  const visitTipCN =
    String(meta.visitTipCN ?? llm.visitTipCN ?? '').trim() || undefined;
  const tags = asStringArray(
    Array.isArray(meta.highlights) && meta.highlights.length > 0 ? meta.highlights : llm.tags,
  );
  const duration =
    firstPositive(
      meta.estimated_duration_min,
      meta.duration_minutes,
      meta.visit_duration_minutes,
      meta.avgVisitDuration,
      (meta.physicalMetadata as Record<string, unknown> | undefined)?.estimated_duration_min,
    ) ?? undefined;

  const level = String(meta.level ?? '').trim() || undefined;

  return {
    ...(description ? { description } : {}),
    ...(visitTipCN ? { visitTipCN } : {}),
    ...(tags.length ? { tags } : {}),
    ...(duration != null
      ? { duration_minutes: duration, estimated_duration_min: duration }
      : {}),
    ...(level ? { level } : {}),
  };
}
