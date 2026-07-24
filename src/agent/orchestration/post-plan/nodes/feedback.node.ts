import type { SharedRunContext } from '../../graph/orchestration-graph.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
} from '../../graph/nodes/base.node';
import type { PostPlanGraphHost } from '../post-plan-graph.host';

export class FeedbackOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'feedback' as const;

  constructor(private readonly host: PostPlanGraphHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return runPostPlanFeedbackSegment(this.host, context);
  }

  async runPostPlanSegment(context: SharedRunContext): Promise<NodeExecutionResult> {
    return runPostPlanFeedbackSegment(this.host, context);
  }
}

export async function runPostPlanFeedbackSegment(
  host: PostPlanGraphHost,
  context: SharedRunContext,
): Promise<NodeExecutionResult> {
  const { state, decisionState } = context;

  const synced = await host.runFeedbackPhase({ state, decisionState });
  host.maybeSnapshot(state, 'AUTO');

  return {
    success: true,
    decisionState: synced ?? decisionState,
  };
}
