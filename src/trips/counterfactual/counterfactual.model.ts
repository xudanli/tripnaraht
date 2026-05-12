/**
 * Counterfactual simulation — 假设世界前提下的分支执行（what-if）
 */

import type { RoadAccessStatus } from '../stream/constraint-stream.types';

/** 日历或区间锚点（ISO 8601 date 或 datetime 字符串） */
export interface TimeRange {
  readonly start: string;
  readonly end: string;
}

/**
 * 与 ConstraintStateStore 对齐的「分支世界」补丁（非全量快照 log）。
 * 路网键为 roadId；后续可扩展 booking/poi。
 */
export interface CounterfactualConstraintState {
  readonly roads?: Readonly<Record<string, RoadAccessStatus>>;
}

export interface CounterfactualScenario {
  readonly id: string;
  /** 人类可读前提，如「F208 为 OPEN」 */
  readonly assumption: string;
  readonly patchedConstraints: CounterfactualConstraintState;
  readonly simulationMode: 'FULL_REPLAY' | 'PARTIAL_REPLAY';
  readonly horizon: TimeRange;
  /**
   * PARTIAL_REPLAY 时用于子图种子；缺省则退化为全日程槽位闭包。
   */
  readonly hypothesizedSlotIds?: readonly string[];
}

/** 语义视图叠加：与单次快照对齐，不参与 fingerprint digest */
export interface ExecutionSemanticCounterfactualOverlay {
  readonly scenarios: readonly CounterfactualScenario[];
  readonly bestAlternative: string;
}
