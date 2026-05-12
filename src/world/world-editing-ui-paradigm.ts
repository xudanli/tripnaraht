/**
 * World Editing Interface — 三层 UI + Diff Stream 与后端模块对齐（产品范式）
 *
 * 仅导出常量与类型，供 Web/Mobile 与 BFF 共享「界面分层」约定。
 */

import type { WorldConstraintStoreSnapshot } from './world-snapshot';
import type { WorldDiffStreamEvent } from './world-diff-stream.types';

/** ① 世界约束编辑：直接绑定 WorldConstraintStore */
export const WORLD_UI_LAYER_MAP = 'WORLD_MAP_CONSTRAINT_EDITOR' as const;

/** ② 执行时间轴：由约束 diff + partial replan 重塑，而非手工改钟点 */
export const WORLD_UI_LAYER_TIMELINE = 'EXECUTION_TIMELINE' as const;

/** ③ 因果叙事：绑定 UnifiedExecutionSemanticView / 叙事生成器 */
export const WORLD_UI_LAYER_NARRATIVE = 'EXECUTION_STORY' as const;

/** ④ Diff 流：单一推送源，联动 Map / Timeline / Narrative */
export const WORLD_UI_LAYER_DIFF_STREAM = 'WORLD_DIFF_STREAM' as const;

export type WorldUiLayerId =
  | typeof WORLD_UI_LAYER_MAP
  | typeof WORLD_UI_LAYER_TIMELINE
  | typeof WORLD_UI_LAYER_NARRATIVE
  | typeof WORLD_UI_LAYER_DIFF_STREAM;

/**
 * 系统 ↔ UI 对齐（单页/设计文档共用）
 */
export const WORLD_EDITING_SYSTEM_UI_ALIGNMENT = [
  {
    layer: WORLD_UI_LAYER_MAP,
    system: 'WorldConstraintStore (SSOT)',
    renders: 'Road / Weather / Booking constraint fields',
  },
  {
    layer: WORLD_UI_LAYER_DIFF_STREAM,
    system: 'WorldConstraintDiff → WorldDiffStreamEvent',
    renders: 'Toast / stream sidebar / sync Map+Timeline+Story',
  },
  {
    layer: WORLD_UI_LAYER_TIMELINE,
    system: 'Partial replan + temporal propagation',
    renders: 'Delay markers, reroute steps, slot shifts',
  },
  {
    layer: WORLD_UI_LAYER_NARRATIVE,
    system: 'Execution semantic overlay + narrative engine',
    renders: 'Causal story, no raw tables',
  },
] as const;

export interface WorldEditingSessionViewModel {
  readonly constraints: WorldConstraintStoreSnapshot;
  /** 最近一条或拼接后的流；Timeline hover/click 锚定同一 id */
  readonly diffStream: readonly WorldDiffStreamEvent[];
}
