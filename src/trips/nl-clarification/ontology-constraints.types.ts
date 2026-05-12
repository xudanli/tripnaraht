/**
 * OntologyConstraints
 *
 * 目的地“物理边界/本体约束”协议（v2 增量引入，旧 config 字段仍保留）。
 * - 给 LLM：通常只注入其摘要（human-readable），用于 needsClarification 与问题生成。
 * - 给 Solver：使用该结构做可行性预检与骨架求解。
 */
export interface OntologyConstraints {
  /**
   * 季节性与封闭区域（示例：冬季高海拔封路、内陆封闭）。
   * month: 1-12
   */
  seasonality?: Array<{
    month: number;
    blockedRegions: string[];
    reason?: string;
  }>;

  /**
   * 交通/车辆逻辑硬边界（示例：冰岛内陆必须 4WD）。
   * 以“声明列表”方式表达，便于 LLM/人类阅读；solver 可在后续版本结构化。
   */
  transportationLogic?: string[];

  /**
   * 时间密度（每天景点/活动数量范围）。
   * min/max: number of POI-like activities per day (soft/hard depending on solver policy).
   */
  timeDensity?: { min: number; max: number };

  /** 目的地每日最低预算（用于 solver feasibility 与澄清引导） */
  budgetFloor?: number;

  /** 扩展字段：允许目的地自定义更多约束 */
  [key: string]: unknown;
}

