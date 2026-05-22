import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type ResearchPrePlanSegmentInput,
} from './base.node';
import type { ResearchNodeHost, ResearchPrePlanSegmentResult } from './research-node.host';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';

/**
 * pre_plan 子图 RESEARCH 节点（Phase 4b P0 标杆）。
 * 内核 RESEARCH 经 {@link ResearchNodeHost.executeResearchPhase} → DecisionKernel（Lint/Harness）。
 */
export class ResearchOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'research' as const;

  constructor(private readonly host: ResearchNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as ResearchPrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('ResearchOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runResearchPrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  /** 供 runPrePlanFullChain 直接调用（与图调度 execute 等价） */
  async runPrePlanSegment(input: ResearchPrePlanSegmentInput): Promise<ResearchPrePlanSegmentResult> {
    return runResearchPrePlanSegment(this.host, input);
  }
}

export async function runResearchPrePlanSegment(
  host: ResearchNodeHost,
  input: ResearchPrePlanSegmentInput,
): Promise<ResearchPrePlanSegmentResult> {
  const { request, context, state, llmProvider, prePlan } = input;
  let decisionState = input.decisionState;

  host.touchAsyncTaskProgress('RESEARCH');
  decisionState = await host.executeResearchPhase(decisionState, state, request, context, llmProvider);
  host.maybeSnapshot(state, 'AUTO');

  const transportIntercept = host.maybeInterceptDegradedTransportEvidence(
    state,
    decisionState,
    prePlan.startTime,
    context,
  );
  if (transportIntercept) {
    host.logger.warn(
      '[Claude Orchestrator] RESEARCH 拦截：交通证据需澄清端点（ClarifyEndpoints），已返回 NEED_USER_CONFIRM',
    );
    return prePlan.prePlanTerminal('terminal_clarification', transportIntercept);
  }
  host.clearTransportClarifyReinjectFlag(state);

  await host.runShadowConflictEarlyWarning(decisionState, state, request);
  host.applyIntakePredictiveFailureReport(decisionState, state);

  const ewTerminal = await host.runEarlyWarningClarificationIntercept(input, decisionState);
  if (ewTerminal) {
    return ewTerminal;
  }

  const stop = prePlan.maybeStopAfter('research');
  if (stop) {
    return stop;
  }
  return { kind: 'continue', decisionState };
}
