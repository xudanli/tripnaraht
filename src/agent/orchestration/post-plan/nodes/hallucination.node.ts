import type { SharedRunContext } from '../../graph/orchestration-graph.types';
import type { GraphNodeOutcome } from '../../graph/orchestration-graph.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
} from '../../graph/nodes/base.node';
import type { PostPlanGraphHost } from '../post-plan-graph.host';

export class HallucinationOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'hallucination' as const;

  constructor(private readonly host: PostPlanGraphHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return runPostPlanHallucinationSegment(this.host, context);
  }

  async runPostPlanSegment(context: SharedRunContext): Promise<NodeExecutionResult> {
    return runPostPlanHallucinationSegment(this.host, context);
  }
}

export async function runPostPlanHallucinationSegment(
  host: PostPlanGraphHost,
  context: SharedRunContext,
): Promise<NodeExecutionResult> {
  const { request, context: agentContext, state, decisionState, startTime } = context;

  const outcome = await host.runHallucinationPhase({ request, context: agentContext, state });
  host.maybeSnapshot(state, 'AUTO');

  if (outcome.blocked) {
    state.current_step = 'HALLUCINATION_DETECTION';
    state.metadata.last_updated_at = new Date().toISOString();
    host.maybeSnapshot(state, 'CHECKPOINT');
    const err = new Error(
      outcome.errorMessage ?? 'Hallucination delivery gate blocked DONE',
    );
    const graphOutcome: GraphNodeOutcome = {
      kind: 'terminal',
      terminal: 'terminal_failed',
      result: host.buildErrorResult(
        state,
        err,
        startTime,
        decisionState,
        'HALLUCINATION_DETECTION',
        undefined,
        agentContext,
      ),
      decisionState,
    };
    return {
      success: false,
      decisionState,
      graphOutcome,
      error: new Error('terminal:terminal_failed'),
    };
  }

  state.current_step = 'DONE';
  state.metadata.last_updated_at = new Date().toISOString();
  state.metadata.total_duration_ms = Date.now() - startTime;
  host.maybeSnapshot(state, 'CHECKPOINT');

  const graphOutcome: GraphNodeOutcome = {
    kind: 'terminal',
    terminal: 'terminal_done',
    result: host.buildSuccessResult(state, startTime, decisionState, agentContext),
    decisionState,
  };

  return {
    success: false,
    decisionState,
    graphOutcome,
    error: new Error('terminal:terminal_done'),
  };
}
