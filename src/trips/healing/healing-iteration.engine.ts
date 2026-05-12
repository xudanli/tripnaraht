/**
 * Healing Iteration Engine — 单轮：约束 diff → 影响子图 → partial replan → 语义视图重建
 */

import type { TripPlan } from '../decision/plan-model';
import type { UnifiedExecutionSemanticView } from '../decision/execution/unified-execution-semantic-view';
import { buildPartialReplanGraphFromPlan } from '../replan/build-partial-replan-graph';
import { extractImpactSubgraph } from '../replan/impact-subgraph.extractor';
import {
  executePartialReplan,
  type PartialReplanResult,
} from '../replan/partial-replan.executor';
import { applySlotUpdates } from '../repair/plan-mutation.engine';
import type { ConstraintDiff } from '../stream/constraint-stream.types';

export interface HealingIterationContext {
  readonly plan: TripPlan;
  readonly diff: ConstraintDiff;
  /** 由调用方注入（通常 wrap `buildTripExecutionSemanticViewSnapshot`） */
  readonly buildSemanticView: (plan: TripPlan) => UnifiedExecutionSemanticView;
}

export interface HealingIterationResult {
  readonly updatedPlan: TripPlan;
  readonly semanticView: UnifiedExecutionSemanticView;
  readonly partialResult: PartialReplanResult;
}

/**
 * 执行一轮自愈迭代：对 `diff.changedSlots` 闭包做局部重规划并合并回计划。
 */
export function runHealingIteration(
  context: HealingIterationContext,
): HealingIterationResult {
  const graph = buildPartialReplanGraphFromPlan(context.plan);
  const seeds =
    context.diff.changedSlots.length > 0
      ? [...context.diff.changedSlots]
      : [];
  const subgraph = extractImpactSubgraph(graph, seeds);
  const partialResult = executePartialReplan(subgraph, context.plan);
  const updatedPlan = applySlotUpdates(context.plan, partialResult.updatedSlots);
  const semanticView = context.buildSemanticView(updatedPlan);

  return {
    updatedPlan,
    semanticView,
    partialResult,
  };
}
