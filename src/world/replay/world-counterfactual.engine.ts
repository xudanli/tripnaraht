/**
 * Counterfactual — 同一前缀历史下的世界分叉（最后一跳可被替代 diff 替换）
 */

import { processWorldDiff } from '../diff/world-diff.processor';
import type { ProcessWorldDiffOptions } from '../diff/world-diff.processor';
import type { WorldDiff } from '../diff/world-diff.contract';
import type { WorldConstraintStore } from '../world-constraint.store';
import type { WorldDiffLogEntry } from './world-diff-log.types';
import { replayWorld } from './world-replay.engine';

export interface CounterfactualWorldResult {
  /** 完全按 `baseLog` 重放得到的世界 */
  readonly branchA: WorldConstraintStore;
  /** `baseLog` 去掉最后一跳后 + `overrideDiff`（若 log 为空则仅应用 overrideDiff） */
  readonly branchB: WorldConstraintStore;
  /** 分叉处的语义对比：通常为 [原最后一跳, 覆盖 diff] */
  readonly divergencePoints: readonly WorldDiff[];
}

/**
 * 反事实：保留除最后一次变迁外的历史，用 `overrideDiff` 替代最后一跳的效果。
 * 若 `baseLog` 为空，则 branchA 为初始世界，branchB 为仅应用 override 后的世界。
 */
export function counterfactualBranch(
  params: {
    readonly baseLog: readonly WorldDiffLogEntry[];
    readonly overrideDiff: WorldDiff;
    readonly options?: ProcessWorldDiffOptions;
  },
): CounterfactualWorldResult {
  const branchA = replayWorld(params.baseLog, params.options);

  const prefix =
    params.baseLog.length > 0 ? params.baseLog.slice(0, -1) : [];
  const branchB = replayWorld(prefix, params.options);
  processWorldDiff(params.overrideDiff, branchB, params.options);

  const divergencePoints: WorldDiff[] =
    params.baseLog.length > 0
      ? [
          params.baseLog[params.baseLog.length - 1]!.diff,
          params.overrideDiff,
        ]
      : [params.overrideDiff];

  return {
    branchA,
    branchB,
    divergencePoints,
  };
}
