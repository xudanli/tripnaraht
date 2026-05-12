/**
 * Goal → DAG bridge: uses existing truth DAG builder only (no alternate execution semantics).
 * Goal types select future specializations; today all paths share one deterministic DAG compile.
 */

import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type { TripPlan } from '../decision/plan-model';
import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionGoal } from './execution-goal.types';

export interface GoalCompilationContext {
  plan: TripPlan;
  overlayFrames: ExecutionOverlayFrame[];
}

export function compileGoalToDAG(goal: ExecutionGoal, ctx: GoalCompilationContext): ExecutionTruthDAG {
  switch (goal.type) {
    case 'EXPLORE_AURORA':
      return buildExecutionTruthDAG({ plan: ctx.plan, overlayFrames: ctx.overlayFrames });
    case 'REDUCE_RISK':
      return buildExecutionTruthDAG({ plan: ctx.plan, overlayFrames: ctx.overlayFrames });
    case 'MINIMIZE_COST':
      return buildExecutionTruthDAG({ plan: ctx.plan, overlayFrames: ctx.overlayFrames });
    case 'OPTIMIZE_EXPERIENCE':
      return buildExecutionTruthDAG({ plan: ctx.plan, overlayFrames: ctx.overlayFrames });
    case 'IMPROVE_STABILITY':
      return buildExecutionTruthDAG({ plan: ctx.plan, overlayFrames: ctx.overlayFrames });
  }
}
