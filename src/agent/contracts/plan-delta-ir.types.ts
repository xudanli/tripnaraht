/**
 * Plan Delta IR — DOS 意图差异中间表示（Step 2 信号原子化契约）。
 * 由 NLU/LLM 编译器产出；Research 引擎按节点级依赖图做精准失效。
 */

export type DeltaOpType = 'ADD' | 'REMOVE' | 'REPLACE';

export type DeltaTargetType =
  | 'POI'
  | 'HOTEL'
  | 'FLIGHT'
  | 'ROUTE_CONSTRAINT'
  | 'RESTRICTION';

export interface DeltaNode {
  type: DeltaTargetType;
  /** REMOVE/REPLACE 时目标实体唯一 ID（如 itinerary itemId） */
  id?: string;
  /** 作用的绝对天数索引（0-based；0 表示第一天） */
  dayIndex?: number;
  /** 地理栅格 / 商圈 ID（跨天或区域级失效） */
  zoneId?: string;
}

/** 统一计划差异中间表示 (Plan Delta Intermediate Representation) */
export interface PlanDeltaIR {
  op: DeltaOpType;
  target: DeltaNode;
  payload: {
    query?: string;
    rawAsset?: unknown;
    patchMeta?: Record<string, unknown>;
  };
}
