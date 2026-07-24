/**
 * ETA-L2-EXECUTION-ACTUAL-01 — error attribution after Actual capture.
 * Do NOT retune L2 from a single sample; attribute first, then Gate Review.
 */

export type TravelEtaErrorAttributionCode =
  | 'PROVIDER_BASE_BIAS'
  | 'F_ROAD_BUFFER_INSUFFICIENT'
  | 'USER_NON_DRIVING_STOP'
  | 'TEMPORARY_REROUTE'
  | 'WEATHER_SHOCK'
  | 'ROADWORK_TEMP'
  | 'START_END_EVENT_ERROR'
  | 'DEM_OR_PROFILE_ERROR'
  | 'VEHICLE_TYPE_MISSTATED'
  | 'OTHER';

export type TravelEtaL2Blame = 'YES' | 'PARTIAL' | 'NO' | 'MARK_ONLY';

export interface TravelEtaErrorAttributionRule {
  code: TravelEtaErrorAttributionCode;
  /** Whether this class should drive L2 coefficient changes */
  blameL2: TravelEtaL2Blame;
  note: string;
}

/** Frozen attribution table — first-round Iceland Actual processing. */
export const TRAVEL_ETA_ERROR_ATTRIBUTION_TABLE: readonly TravelEtaErrorAttributionRule[] = [
  {
    code: 'PROVIDER_BASE_BIAS',
    blameL2: 'PARTIAL',
    note: 'Provider 基础 ETA 偏差；L2 只在缓冲方向上部分相关',
  },
  {
    code: 'F_ROAD_BUFFER_INSUFFICIENT',
    blameL2: 'YES',
    note: '高地 / F 路缓冲不足 — 可进入规则审查',
  },
  {
    code: 'USER_NON_DRIVING_STOP',
    blameL2: 'NO',
    note: '停车拍照等非驾驶停留 — 应剔除，不归因 L2',
  },
  {
    code: 'TEMPORARY_REROUTE',
    blameL2: 'NO',
    note: '临时改线 — INVALID / 不进 MAE',
  },
  {
    code: 'WEATHER_SHOCK',
    blameL2: 'MARK_ONLY',
    note: '天气突变 — 当前单独标记，不进 L2 改数',
  },
  {
    code: 'ROADWORK_TEMP',
    blameL2: 'MARK_ONLY',
    note: '道路临时施工 — 当前单独标记',
  },
  {
    code: 'START_END_EVENT_ERROR',
    blameL2: 'NO',
    note: '起止事件错误 — 数据质量问题',
  },
  {
    code: 'DEM_OR_PROFILE_ERROR',
    blameL2: 'YES',
    note: 'DEM 来源或 profile 错误 — 可归因工程/规则',
  },
  {
    code: 'VEHICLE_TYPE_MISSTATED',
    blameL2: 'NO',
    note: '车型信息填写错误 — 数据问题',
  },
  {
    code: 'OTHER',
    blameL2: 'MARK_ONLY',
    note: '未分类 — 先 REVIEW，禁止直接改参',
  },
] as const;

export type TravelEtaSampleDisposition = 'KEEP' | 'REVIEW' | 'INVALID';

/** Fixed processing chain after Iceland Actual arrives — no immediate retune. */
export const EXECUTION_OUTCOME_PROCESSING_CHAIN = [
  'Execution Confirmations',
  'Stop Exclusion',
  'Actual Compute',
  'Quality Classification',
  'Base vs Planning Reconciliation',
  'Error Attribution',
  'Parameter Review',
] as const;

/** @deprecated Use EXECUTION_OUTCOME_PROCESSING_CHAIN */
export const FIELD_OUTCOME_PROCESSING_CHAIN = EXECUTION_OUTCOME_PROCESSING_CHAIN;
