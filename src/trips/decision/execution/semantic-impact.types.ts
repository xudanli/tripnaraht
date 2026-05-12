/**
 * Semantic Impact Model — v0（结构化差分声明，无局部 mutation）
 *
 * 约束「delta 声称影响了什么」与「快照中哪些切片视为陈旧」，与全量 rebuild 路径兼容。
 */

import type { ISODate } from '../world-model';

/** 语义权威域（与 Layer A 消费边界对齐） */
export type SemanticImpactDomain =
  | 'WEATHER'
  | 'BOOKING'
  | 'TEMPORAL'
  | 'ROUTING'
  /** 物理世界约束（路网 / 可达性 / F-road） */
  | 'PHYSICAL'
  /** 多约束融合（slot-level arbitration） */
  | 'CONSTRAINT_FUSION';

/** 影响在日历 / 时间轴上的粒度 */
export type SemanticImpactScope = 'GLOBAL' | 'DAY' | 'SLOT';

/**
 * `UnifiedExecutionSemanticView` 内可标记陈旧的逻辑切片（非字段级 diff）。
 * `FULL_SNAPSHOT` = 保守边界，等价「须整视图失效后再解释」。
 */
export type SemanticViewStaleRegion =
  | 'FULL_SNAPSHOT'
  | 'EXECUTION_BY_DATE'
  | 'TEMPORAL_SCOPE'
  | 'TEMPORAL_PROPAGATION'
  | 'GLOBAL_ALERTS';

/** 生产者对单次 delta 的语义影响声明（与 payload 分离，专门用于治理 / 回放） */
export interface SemanticImpactDeclaration {
  readonly affectedDomains: readonly SemanticImpactDomain[];
  readonly impactScope: SemanticImpactScope;
  /** `DAY` / `SLOT` 时应给出日历锚点；`GLOBAL` 通常省略 */
  readonly affectedDates?: readonly ISODate[];
}

/** 写入 lineage 的轻量轨迹（审计 / Phase 3 因果图预留） */
export interface SemanticImpactTraceV0 {
  readonly affectedDomains: readonly SemanticImpactDomain[];
  readonly impactScope: SemanticImpactScope;
  readonly staleRegions: readonly SemanticViewStaleRegion[];
}
