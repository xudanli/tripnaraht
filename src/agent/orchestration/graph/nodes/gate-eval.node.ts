import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type GateEvalPrePlanSegmentInput,
} from './base.node';
import type { GateEvalNodeHost, GateEvalPrePlanSegmentResult } from './gate-eval-node.host';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';

/**
 * pre_plan 子图 GATE_EVAL 节点（Phase 4b pre_plan 收官之一）。
 * Harness 失败 → BLOCK 在 Kernel 内铁腕合成；节点负责 pre_plan 终端与影子辩论短路。
 */
export class GateEvalOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'gate_eval' as const;

  constructor(private readonly host: GateEvalNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as GateEvalPrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('GateEvalOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runGateEvalPrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  async runPrePlanSegment(input: GateEvalPrePlanSegmentInput): Promise<GateEvalPrePlanSegmentResult> {
    return runGateEvalPrePlanSegment(this.host, input);
  }
}

export async function runGateEvalPrePlanSegment(
  host: GateEvalNodeHost,
  input: GateEvalPrePlanSegmentInput,
): Promise<GateEvalPrePlanSegmentResult> {
  const { request, context, state, llmProvider, prePlan, deadline } = input;
  const startTime = prePlan.startTime;
  let decisionState = input.decisionState;

  host.touchAsyncTaskProgress('GATE_EVAL');
  decisionState =
    (await host.executeGateEvalPhase(decisionState, state, request, context, llmProvider)) ??
    decisionState;
  host.relaxGateForPartialIfEligible(state);
  host.applyMarathonPipelineSignals(state, request);
  host.maybeStartGuardiansDebateShadowAfterGate(request, state);

  const debateShortCircuit = await host.maybeAwaitGuardiansDebateFuseAndShortCircuit(
    request,
    state,
    decisionState,
    context,
    startTime,
    deadline,
  );
  if (debateShortCircuit) {
    host.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
    host.maybeSnapshot(state, 'CHECKPOINT');
    return prePlan.prePlanTerminal('terminal_clarification', debateShortCircuit);
  }

  host.maybeSnapshot(state, 'AUTO');

  if (host.isGateBlocked(state)) {
    host.recordPoiPlanningOutcomeAfterItinerary(state, decisionState);
    host.maybeSnapshot(state, 'CHECKPOINT');
    return prePlan.prePlanTerminal(
      'terminal_blocked',
      host.buildBlockedResult(state, startTime, decisionState, context),
    );
  }

  const stop = prePlan.maybeStopAfter('gate_eval');
  if (stop) {
    return stop;
  }
  return { kind: 'continue', decisionState };
}
