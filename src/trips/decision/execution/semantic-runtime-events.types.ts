/**
 * Semantic Runtime — 事件模型
 *
 * - `ENGINE_FULL_REBUILD`：权威全量输入（生产默认）
 * - `SEMANTIC_DELTA`：Phase 3 语义修饰入口；v0 必须携带 `fullRebuildFallback` 直至增量合并落地
 */

import type { RoadConstraintEvent } from '../../../iceland-road/road-constraint.propagation';
import type { RoadConstraintGraph } from '../../../iceland-road/road-constraint.graph';
import type { SemanticDeltaEvent } from './semantic-delta-event.types';
import type { BuildUnifiedExecutionSemanticViewInput } from './unified-execution-semantic-view';
import type { ConstraintDomainOutput } from '../../constraints/constraint-domain-output.types';
import type { TripPlan } from '../plan-model';
import type { WorldConstraintStore } from '../../../world/world-constraint.store';

export type SemanticRuntimeEventKind =
  | 'ENGINE_FULL_REBUILD'
  | 'SEMANTIC_DELTA'
  /** 路况 → 传播 → 与 ROAD_CONSTRAINT_CHANGE 对齐的语义重建（v0 仍全量 fullRebuildFallback） */
  | 'ROAD_CONSTRAINT_UPDATE'
  /** 多域 ConstraintDomainOutput → fuseConstraints → SLOT_BLOCKED */
  | 'CONSTRAINT_FUSION_UPDATE';

/** 引擎单次 pass 完成后对 Layer A 的全量再解释 */
export interface SemanticRuntimeEventEngineFullRebuild {
  kind: 'ENGINE_FULL_REBUILD';
  /** 幂等 / 日志关联 */
  id: string;
  at: string;
  payload: BuildUnifiedExecutionSemanticViewInput;
}

/**
 * 增量语义意图（taxonomy + payload）；正确性仍由 `fullRebuildFallback` 全量快照保证。
 */
export interface SemanticRuntimeEventSemanticDelta {
  kind: 'SEMANTIC_DELTA';
  id: string;
  at: string;
  delta: SemanticDeltaEvent;
  fullRebuildFallback: BuildUnifiedExecutionSemanticViewInput;
}

/** Physical road subsystem → 与 Neptune / Layer A 对齐的运行时入口 */
export interface SemanticRuntimeEventRoadConstraintUpdate {
  kind: 'ROAD_CONSTRAINT_UPDATE';
  id: string;
  at: string;
  constraintEvent: RoadConstraintEvent;
  fullRebuildFallback: BuildUnifiedExecutionSemanticViewInput;
  graph?: RoadConstraintGraph;
  /** 提供时运行 Trip Impact Resolver，写入 delta payload + lineage 轨迹 */
  tripPlan?: TripPlan;
  /**
   * 若提供：图传播结果经 `applyRoadDiff` 写入 SSOT（World 为唯一路况事实源）。
   */
  worldConstraintStore?: WorldConstraintStore;
}

export interface SemanticRuntimeEventConstraintFusionUpdate {
  kind: 'CONSTRAINT_FUSION_UPDATE';
  id: string;
  at: string;
  readonly domainOutputs: readonly ConstraintDomainOutput[];
  fullRebuildFallback: BuildUnifiedExecutionSemanticViewInput;
  /** 提供时：阻断槽位上构建局部重规划子图并发出 PARTIAL_REPLAN_EXECUTED；同时写入 repair trace 供审计 */
  tripPlan?: TripPlan;
}

export type SemanticRuntimeEvent =
  | SemanticRuntimeEventEngineFullRebuild
  | SemanticRuntimeEventSemanticDelta
  | SemanticRuntimeEventRoadConstraintUpdate
  | SemanticRuntimeEventConstraintFusionUpdate;
