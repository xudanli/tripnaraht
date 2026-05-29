/**
 * RLHF 决策语义扩展（P0：观测链 + 两难）
 *
 * 与 `rlhf_feedback_signals.context` JSONB 对齐的一等字段；供采集、ETL、DPO 打包读取。
 */

/** 与 Kernel `researchData.observationHarness` 对齐的 RLHF 快照（不写全量 audit） */
export interface RlhfObservationHarnessSnapshot {
  schemaVersion: 1;
  parallel?: boolean;
  observationTimeoutMs?: number;
  minVoiScore?: number;
  maxActions?: number;
  executedActionCount?: number;
  auditEntryCount?: number;
  excludedPoiIdCount?: number;
  suggestDilemmaElicitation?: {
    reason: string;
    crossSpread?: number;
    hint?: string;
  };
  passabilityEvidence?: {
    passability01?: number;
    evidenceWeight?: number;
  };
  /** 来自 audit 的 evidenceKind 去重列表（非语义、可聚合） */
  evidenceKinds?: string[];
}

/** 与 Kernel `optimizationHints.dilemmaElicitationHint` 对齐 */
export interface RlhfDilemmaElicitationSnapshot {
  reason: string;
  crossSpread?: number;
  hint?: string;
}

/**
 * 用户在两个候选方案之间的犹豫（行为层；可与 FEEDBACK 的 ACCEPT join）
 * 典型轴：省钱 vs 省时 —— 由客户端上报 dwell_ms。
 */
export interface RlhfTradeoffComparisonDwell {
  schemaVersion: 1;
  option_a_id: string;
  option_b_id: string;
  /** 在对比视图中的总停留毫秒 */
  dwell_ms: number;
  resolved_to?: 'A' | 'B' | 'NONE';
  /** 产品语义轴，如 cost_vs_time */
  tradeoff_axis?: string;
  decision_point_id?: string;
}

/** 非语义分块：按 JSON 路径打 influence 分（0–1），供离线权重归因 */
export interface RlhfJsonKvInfluenceEntry {
  path: string;
  influence01: number;
  tags: Array<'utility_weight_key' | 'edit_field_match' | 'outcome_key_overlap' | 'shallow_hot_key'>;
}

export interface RlhfJsonKvInfluenceSnapshot {
  schemaVersion: 1;
  evaluatedAt: string;
  entries: RlhfJsonKvInfluenceEntry[];
  /** 截断/采样说明 */
  note?: string;
}
