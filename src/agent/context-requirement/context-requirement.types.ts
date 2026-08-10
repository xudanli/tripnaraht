/**
 * Context Requirement Engine — 核心类型（P0）。
 */

import type { CreExecutionLevel, CreOperation } from './operation.types';

/** 字段必要性 */
export type CreNecessity =
  | 'REQUIRED'
  | 'CONDITIONAL'
  | 'APPLY_REQUIRED'
  | 'OPTIONAL';

/** 缺口/字段状态 */
export type CreFactStatus =
  | 'AVAILABLE'
  | 'DERIVABLE'
  | 'FETCHABLE'
  | 'STALE'
  | 'UNCERTAIN'
  | 'USER_REQUIRED'
  | 'BLOCKING'
  | 'OPTIONAL';

/** 建议数据源 */
export type CreContextSource =
  | 'USER_INPUT'
  | 'PAGE_FOCUS'
  | 'TRIP_STATE'
  | 'TEAM_PROFILE'
  | 'USER_PROFILE'
  | 'PRODUCT_CATALOG'
  | 'KNOWLEDGE_BASE'
  | 'WEATHER_SERVICE'
  | 'ROAD_SERVICE'
  | 'DERIVED'
  | 'USER_PROMPT';

export type CreNextAction =
  | 'ANSWER'
  | 'FETCH_CONTEXT'
  | 'ASK_USER'
  | 'PROCEED_TO_GATE';

/** 合同字段声明（可配置、可单测） */
export interface CreContractField {
  key: string;
  necessity: CreNecessity;
  source: CreContextSource;
  /** 缺失时是否阻断继续执行（REQUIRED 默认真） */
  blocking?: boolean;
  /** 条件展开，如 travelMode === 'SELF_DRIVE' */
  when?: string;
  /** 新鲜度提示，如 6h */
  freshness?: string;
  labelZh?: string;
}

export interface CreContextContract {
  operation: CreOperation;
  executionLevel: CreExecutionLevel;
  labelZh: string;
  fields: CreContractField[];
}

export interface CreResolvedRequirement {
  key: string;
  necessity: CreNecessity;
  source: CreContextSource;
  status: CreFactStatus;
  blocking: boolean;
  freshness?: string;
  labelZh?: string;
  note?: string;
}

export interface CreOperationResolveResult {
  operation: CreOperation;
  confidence: number;
  target: {
    dayIndex?: number;
    experienceHint?: string;
    scope?: string;
  };
  reason: string;
}

/** 运行时可用的上下文提示（不拉全量世界态） */
export interface CreContextHints {
  message?: string;
  tripId?: string | null;
  focusDayIndex?: number | null;
  pageHint?: string | null;
  hasDayPlan?: boolean;
  hasAccommodationOnTargetDay?: boolean;
  hasParticipants?: boolean;
  hasVehicleProfile?: boolean;
  hasWeather?: boolean;
  hasRoadStatus?: boolean;
  hasExperienceProduct?: boolean;
  travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
  containsOutdoorActivity?: boolean;
  containsReservableActivity?: boolean;
  destinationKnown?: boolean;
}

export interface CreAcquisitionFlags {
  /** LIGHTWEIGHT / ASK：跳过偏好 bias 与重装载 */
  slimLoad: boolean;
  /** 关闭 RAG query expansion */
  skipQueryExpansion: boolean;
  /** 跳过 risks 类检索（餐饮简单问答） */
  skipRisksRag: boolean;
  /** 允许的 fetch 白名单键 */
  fetchKeys: string[];
}

export interface ContextRequirementPlan {
  operation: CreOperation;
  confidence: number;
  executionLevel: CreExecutionLevel;
  target: CreOperationResolveResult['target'];
  requirements: CreResolvedRequirement[];
  blockingGaps: CreResolvedRequirement[];
  userQuestions: string[];
  nextAction: CreNextAction;
  acquisition: CreAcquisitionFlags;
  reason: string;
}
