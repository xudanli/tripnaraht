import type { SharedRunContext } from '../../graph/orchestration-graph.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
} from '../../graph/nodes/base.node';
import type { NarrateNodeHost } from '../narrate-node.host';

/**
 * post_plan 子图 NARRATE 节点：生命周期调度 + 执行体委托（不内嵌业务 Service 海）。
 */
export class NarrateOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'narrate' as const;

  constructor(private readonly host: NarrateNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return runPostPlanNarrateSegment(this.host, context);
  }

  async runPostPlanSegment(context: SharedRunContext): Promise<NodeExecutionResult> {
    return runPostPlanNarrateSegment(this.host, context);
  }
}

export async function runPostPlanNarrateSegment(
  host: NarrateNodeHost,
  context: SharedRunContext,
): Promise<NodeExecutionResult> {
  const { request, context: agentContext, state, decisionState } = context;

  host.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
  host.touchAsyncTaskProgress('NARRATE');

  await host.runNarratePhase({
    request,
    context: agentContext,
    state,
    decisionState,
  });

  host.maybeSnapshot(state, 'AUTO');

  return {
    success: true,
    decisionState,
  };
}
