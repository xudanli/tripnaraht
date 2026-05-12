/**
 * WorldDiff Contract V1 — 跨域唯一物理变更语言（domain 只「产出」统一 diff，不自定义形状）
 */

import type { ConstraintDomain, WorldTimeRange } from '../constraint-field.interface';

export type WorldDiffDomain = ConstraintDomain;

export type WorldDiffMutationType =
  | 'STATE_CHANGE'
  | 'CONSTRAINT_ADDED'
  | 'CONSTRAINT_REMOVED'
  | 'TEMPORAL_SHIFT';

export type WorldDiffPropagationHint = 'LOCAL' | 'SEQUENCE' | 'GLOBAL';

/** 与合约一致：图引擎 / 人机命令 / 系统任务 */
export type WorldDiffOrigin = 'GRAPH' | 'COMMAND' | 'SYSTEM';

export interface WorldDiff {
  readonly id: string;
  readonly domain: WorldDiffDomain;
  readonly type: WorldDiffMutationType;
  /** roadId | calendar date id | slotId / 合成策略 id 等 */
  readonly entityId: string;
  readonly stateBefore: string;
  readonly stateAfter: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly temporalScope: WorldTimeRange;
  readonly impactedSlots: readonly string[];
  readonly propagationHint: WorldDiffPropagationHint;
  readonly source: WorldDiffOrigin;
}
