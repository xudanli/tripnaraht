import { OrchestrationGraphScheduler } from './orchestration-graph.scheduler';
import type { PrePlanGraphHost } from './pre-plan-graph.host';
import type { PrePlanGraphRunParams } from './pre-plan-graph.types';
import type { GraphRunOutcome, OrchestrationGraphNodeHandler, OrchestrationNodeId } from './orchestration-graph.types';

/** pre_plan 节点顺序（与 main-chain 一致，guard 合并在节点实现内） */
export const PRE_PLAN_NODE_ORDER: OrchestrationNodeId[] = [
  'intake',
  'state_update',
  'research',
  'poi_selection',
  'gate_eval',
  'context_build',
];

export function resolvePrePlanNext(from: OrchestrationNodeId): OrchestrationNodeId | 'END' | undefined {
  const idx = PRE_PLAN_NODE_ORDER.indexOf(from);
  if (idx < 0) return undefined;
  if (idx >= PRE_PLAN_NODE_ORDER.length - 1) return 'END';
  return PRE_PLAN_NODE_ORDER[idx + 1];
}

function resolvePrePlanEntry(params: PrePlanGraphRunParams): OrchestrationNodeId {
  if (params.forcePrePlanIntakeEntry) {
    return 'intake';
  }
  if (params.entry) {
    if (params.resumeSkipIntake && params.entry === 'intake') {
      return 'state_update';
    }
    return params.entry;
  }
  return params.resumeSkipIntake ? 'state_update' : 'intake';
}

function createPrePlanHandler(host: PrePlanGraphHost): OrchestrationGraphNodeHandler {
  return {
    runNode: (nodeId, ctx) => host.runPrePlanNode(nodeId, ctx),
  };
}

export async function runPrePlanUntilContextBuild(
  host: PrePlanGraphHost,
  params: PrePlanGraphRunParams,
): Promise<GraphRunOutcome> {
  const scheduler = new OrchestrationGraphScheduler();
  return scheduler.run(createPrePlanHandler(host), params, {
    entry: resolvePrePlanEntry(params),
    resolveNext: resolvePrePlanNext,
    maxSteps: PRE_PLAN_NODE_ORDER.length + 2,
  });
}
