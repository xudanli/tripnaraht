/**
 * WorldMutationGateway — 道路相关写入 SSOT 的单一入口（P0 因果主链锚点）
 *
 * 业务侧应通过 `applyRoadFactMutation` 更新 `WorldConstraintStore.roads`，
 * 避免散落调用 `applyRoadDiff` / `applyWorldCommand(BLOCK_ROAD)` / `processWorldDiff`。
 *
 * 已收敛入口：`semantic-runtime-reducer`（图→SSOT）、`runInteractiveWorldLoop`（路网命令）。
 * 回放/反事实仍用 `processWorldDiff` 作解释器，与「外部业务写入」分流。
 */

import type { WorldConstraintDiff } from './world-diff.engine';
import type { WorldConstraintStore } from './world-constraint.store';
import { applyRoadDiff, type ApplyRoadDiffOptions } from './apply-road-diff';
import { applyWorldCommand, type ApplyWorldCommandOptions } from './world-command.service';
import type { WorldCommand } from './world-command.types';
import type { RoadConstraintDiff } from './road-constraint-diff.types';
import type { WorldDiff } from './diff/world-diff.contract';
import {
  processWorldDiff,
  type ProcessWorldDiffOptions,
} from './diff/world-diff.processor';

export type RoadWorldCommand = Extract<
  WorldCommand,
  { type: 'BLOCK_ROAD' | 'UNBLOCK_ROAD' }
>;

export type RoadFactMutation =
  | { readonly channel: 'USER_COMMAND'; readonly cmd: RoadWorldCommand }
  | {
      readonly channel: 'GRAPH_SSOT_DIFF';
      readonly diff: RoadConstraintDiff;
      readonly options?: ApplyRoadDiffOptions;
    }
  | {
      readonly channel: 'WORLD_DIFF_CONTRACT';
      readonly diff: WorldDiff;
      readonly options?: ProcessWorldDiffOptions;
    };

export interface WorldRoadMutationResult {
  readonly store: WorldConstraintStore;
  readonly constraintDiff: WorldConstraintDiff;
  readonly channel: RoadFactMutation['channel'];
}

/**
 * 所有「道路事实」写入 `WorldConstraintStore` 应经此函数（replay / live / graph 结果落地）。
 */
export function applyRoadFactMutation(
  store: WorldConstraintStore,
  mutation: RoadFactMutation,
  shared?: ApplyWorldCommandOptions & { readonly atMs?: number },
): WorldRoadMutationResult {
  if (mutation.channel === 'WORLD_DIFF_CONTRACT') {
    if (mutation.diff.domain !== 'ROAD') {
      throw new Error(
        `applyRoadFactMutation: expected ROAD domain, got ${mutation.diff.domain}`,
      );
    }
    const r = processWorldDiff(mutation.diff, store, {
      tripPlan:
        mutation.options?.tripPlan ?? shared?.tripPlan,
      ...mutation.options,
    });
    return {
      store: r.store,
      constraintDiff: r.constraintDiff,
      channel: mutation.channel,
    };
  }

  if (mutation.channel === 'GRAPH_SSOT_DIFF') {
    const r = applyRoadDiff(store, mutation.diff, mutation.options);
    return {
      store: r.store,
      constraintDiff: r.diff,
      channel: mutation.channel,
    };
  }

  const r = applyWorldCommand(store, mutation.cmd, {
    tripPlan: shared?.tripPlan,
    atMs: shared?.atMs,
  });
  return {
    store: r.store,
    constraintDiff: r.diff,
    channel: mutation.channel,
  };
}
