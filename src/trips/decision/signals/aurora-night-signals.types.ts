/**
 * 极光 / 夜间户外观测 — 世界模型一等公民信号（与 weatherByDate、daylightFeasibility 并列）。
 *
 * 数据源可为 NOAA / AuroraWatch / OpenWeather（云量）等；决策侧只消费结构化事实与可行性。
 */

/** ISO calendar date YYYY-MM-DD（与 world-model.ISODate 对齐，避免与 world-model 循环依赖） */
export type ISODate = string;
/** ISO datetime string */
export type ISODatetime = string;
/** local wall time HH:mm（与 world-model.ISOTime 对齐） */
export type ISOTime = string;

/** 单点解析后的极光与环境因子（可按地点写入，支撑「首都圈云厚 vs 南岸晴空」） */
export interface AuroraNightObservationSignal {
  kpIndex: number;
  /** 0–100，OpenWeather `clouds.all` 等 */
  cloudCoveragePct?: number;
  /** 可选：太阳风或其它预报字段 */
  solarWindKms?: number;
  /** 0–1，可由 KP/能见度/历史命中率推导；缺省时由 calculateAuroraNightObservationFeasibility 推断 */
  auroraProbability?: number;
  /** 与 IcelandAuroraAdapter.calculateAuroraVisibility 对齐的档位 */
  visibility: 'none' | 'low' | 'moderate' | 'high';
  /**
   * 在该解析点开展「夜间户外极光观测」的可行性（云 + KP 合成）。
   * - blocked：宜触发取消/换区/改日
   * - marginal：可保留但降级期望
   * - feasible：可执行
   */
  observationFeasibility: 'blocked' | 'marginal' | 'feasible';
  resolvedLat?: number;
  resolvedLng?: number;
  source?: string;
  updatedAt: ISODatetime;
}

/**
 * 从 PlanSlot + auroraByDate 汇总出的摘要，供 Agent / RepairEvaluator / Neptune 走廊读取。
 */
export interface NightObservationFeasibilitySignalSummary {
  /** 当日极光观测被判定为不可行时，对应夜间观测槽位 id（见 PlanSlot.semanticTags） */
  infeasibleAuroraSlotIds: string[];
  /** 观测被阻断的日期（例如首都圈云层阻塞） */
  blockedObservationDates: ISODate[];
  notes?: string[];
}
