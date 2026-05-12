/**
 * TripDraftState —— 草案决策单一事实源（Single Source of Truth）
 * LLM 应从「每次重算世界」演进为「state transformer」：基于当前 state 产出下一版 state。
 */

import type { UserIntentState } from '../user-intent/user-intent-state.types';

export type DraftSlot = 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'evening';

export type DraftUncertaintyType = 'weather' | 'distance' | 'availability' | 'timing';

export type DraftUncertaintyLevel = 'low' | 'medium' | 'high';

export interface TripDraftIntent {
  rawInput: string;
  destination: string;
  cities: string[];
  /** 已解析为 Place.id 的必含点 */
  mustHavePois: number[];
  /** NL 阶段景点关键词，尚未映射为 id */
  mustHavePoiKeywords?: string[];
  /** region / DSO 侧 must_include_poi_ids（slug，未必可 parse 为 number） */
  mustIncludeSlugs?: string[];
  style?: string;
  intensity?: string;
  transport?: string;
  /** 用户显式锁定的点（再规划时不可替换，除非 patch 解除） */
  lockedPlaceIds?: number[];
  /** 区域偏好（如「渋谷」），与 topology 协同 */
  preferredZones?: string[];
  /** 自然语言约束的累积（add_constraint patch） */
  constraintHints?: string[];
}

export interface TripDraftCalendarDay {
  day: number;
  date: string;
  weekday?: string;
}

export interface TripDraftSelection {
  day: number;
  slot: DraftSlot;
  placeId: number;
  zone?: string;
}

export interface TripDraftConstraintLog {
  /** day(1-based) -> 当日已用餐厅 placeId */
  mealUsed: Record<number, number[]>;
  /** placeId -> 行程中出现次数 */
  placeRepeatCount: Record<number, number>;
}

export interface TripDraftTopologyState {
  currentZone?: string;
  zoneTransitions: string[];
  lastPlaceId?: number;
}

export interface TripDraftUncertaintyItem {
  type: DraftUncertaintyType;
  targetId?: number;
  level: DraftUncertaintyLevel;
}

export interface TripDraftUncertaintyState {
  items: TripDraftUncertaintyItem[];
}

/** HYBRID：LLM 与算法双路径已联合参与（槽位仲裁 / 收敛门控） */
export type TripDraftEngineMode = 'LLM' | 'ALGO' | 'HYBRID';

export interface TripDraftState {
  tripId: string;

  intent: TripDraftIntent;

  calendar: TripDraftCalendarDay[];

  selections: TripDraftSelection[];

  constraintLog: TripDraftConstraintLog;

  topology: TripDraftTopologyState;

  uncertainty: TripDraftUncertaintyState;

  mode: TripDraftEngineMode;

  /** 每次变异递增，便于回放与 diff */
  version: number;

  /** 用户意图演化快照（与单次 intent 互补） */
  userIntent?: UserIntentState;
}
