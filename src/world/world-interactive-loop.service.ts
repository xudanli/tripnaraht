/**
 * Interactive Diff Loop — 命令 → SSOT → Diff →（可选）Partial Replan → 语义层挂载材料
 */

import type { TripPlan } from '../trips/decision/plan-model';
import { buildPartialReplanGraphFromPlan } from '../trips/replan/build-partial-replan-graph';
import { extractImpactSubgraph } from '../trips/replan/impact-subgraph.extractor';
import {
  executePartialReplan,
  type PartialReplanResult,
} from '../trips/replan/partial-replan.executor';
import type { ApplyWorldCommandResult } from './world-command.service';
import { applyWorldCommand } from './world-command.service';
import type { WorldCommand } from './world-command.types';
import {
  applyRoadFactMutation,
  type RoadWorldCommand,
} from './world-mutation.gateway';
import {
  buildExecutionSemanticWorldOverlay,
} from './world-constraint.pipeline';
import type { WorldConstraintStore } from './world-constraint.store';

function isRoadWorldCommand(cmd: WorldCommand): cmd is RoadWorldCommand {
  return cmd.type === 'BLOCK_ROAD' || cmd.type === 'UNBLOCK_ROAD';
}

export interface RunInteractiveWorldLoopOptions {
  readonly tripPlan?: TripPlan;
  readonly runPartialReplan?: boolean;
  readonly atMs?: number;
}

export interface InteractiveWorldLoopResult {
  readonly commandResult: ApplyWorldCommandResult;
  readonly partialReplan?: PartialReplanResult;
  readonly worldOverlay: ReturnType<typeof buildExecutionSemanticWorldOverlay>;
}

/**
 * 单次人机交互闭环：世界命令 → diff → 可选局部重规划 → `ExecutionSemanticWorldOverlay`
 */
export function runInteractiveWorldLoop(
  store: WorldConstraintStore,
  cmd: WorldCommand,
  options?: RunInteractiveWorldLoopOptions,
): InteractiveWorldLoopResult {
  let commandResult: ApplyWorldCommandResult;
  if (isRoadWorldCommand(cmd)) {
    const r = applyRoadFactMutation(
      store,
      { channel: 'USER_COMMAND', cmd },
      {
        tripPlan: options?.tripPlan,
        atMs: options?.atMs,
      },
    );
    commandResult = {
      store: r.store,
      diff: r.constraintDiff,
      emittedKind: 'WORLD_CONSTRAINT_DIFF',
      command: cmd,
    };
  } else {
    commandResult = applyWorldCommand(store, cmd, {
      tripPlan: options?.tripPlan,
      atMs: options?.atMs,
    });
  }

  let partialReplan: PartialReplanResult | undefined;
  if (options?.runPartialReplan && options.tripPlan && commandResult.diff.hasImpact) {
    const graph = buildPartialReplanGraphFromPlan(options.tripPlan);
    const subgraph = extractImpactSubgraph(graph, [
      ...commandResult.diff.affectedSlots,
    ]);
    partialReplan = executePartialReplan(subgraph, options.tripPlan);
  }

  const worldOverlay = buildExecutionSemanticWorldOverlay(
    commandResult.store,
    commandResult.diff,
  );

  return {
    commandResult,
    ...(partialReplan !== undefined ? { partialReplan } : {}),
    worldOverlay,
  };
}
