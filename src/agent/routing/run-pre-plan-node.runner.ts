/**
 * Pre-plan 单节点：按 entry 跳过已完成节点，再跑到 stopAfter（从 ClaudeOrchestrator 迁出）。
 */

import type { RunPrePlanNodeHost } from './run-pre-plan-node.host';
import { PRE_PLAN_NODE_ORDER } from '../orchestration/graph';
import type {
  GraphNodeOutcome,
  OrchestrationNodeId,
  SharedRunContext,
} from '../orchestration/graph/orchestration-graph.types';
import type { PrePlanGraphRunParams } from '../orchestration/graph/pre-plan-graph.types';

export async function runPrePlanNode(
  host: RunPrePlanNodeHost,
  nodeId: OrchestrationNodeId,
  ctx: SharedRunContext,
): Promise<GraphNodeOutcome> {
  const params = ctx as PrePlanGraphRunParams;
  const entry = params.entry ?? 'intake';
  if (
    !params.forcePrePlanIntakeEntry &&
    PRE_PLAN_NODE_ORDER.indexOf(nodeId) < PRE_PLAN_NODE_ORDER.indexOf(entry)
  ) {
    return { kind: 'continue', decisionState: ctx.decisionState };
  }
  const segment = await host.runPrePlanFullChain({
    ...params,
    decisionState: ctx.decisionState,
    entry: nodeId,
    stopAfter: nodeId,
  });
  if (segment.kind === 'terminal') {
    return {
      kind: 'terminal',
      terminal: segment.terminal,
      result: segment.result,
      decisionState: segment.decisionState,
    };
  }
  return { kind: 'continue', decisionState: segment.decisionState };
}
