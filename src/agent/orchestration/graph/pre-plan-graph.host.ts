import type { GraphNodeOutcome, OrchestrationNodeId, SharedRunContext } from './orchestration-graph.types';

/** pre_plan 子图宿主：`intake` → `context_build` */
export interface PrePlanGraphHost {
  runPrePlanNode(nodeId: OrchestrationNodeId, ctx: SharedRunContext): Promise<GraphNodeOutcome>;
}
