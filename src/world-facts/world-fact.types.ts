/**
 * Canonical World Fact — Phase 1 POC types（不含 Gate / Planner 契约）。
 */

export interface WorldFactAppendInput {
  /** 确定性键，例如 road:f35:snow_probability、country:IS:aggregated_wind_mps */
  factKey: string;
  subjectType: string;
  subjectId: string;
  predicate: string;
  valueJson: Record<string, unknown>;
  confidence?: number | null;
  severity?: string | null;
  sourceType: string;
  sourceRef?: string | null;
  validFrom?: Date | null;
  validTo?: Date | null;
  observedAt?: Date | null;
  snapshotVersion?: string | null;
}

/** Readiness 投影条目（供 Context Block / UI Explainability） */
export interface ReadinessProjectionItem {
  message: string;
  derivedFromFactIds: string[];
  /** 可选：便于调试 */
  templateId?: string;
}
