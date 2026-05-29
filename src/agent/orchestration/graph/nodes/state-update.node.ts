import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type StateUpdatePrePlanSegmentInput,
} from './base.node';
import type { StateUpdateNodeHost, StateUpdatePrePlanSegmentResult } from './state-update-node.host';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';

/**
 * pre_plan 子图 STATE_UPDATE 节点（Phase 4b P0 第三项）。
 * DSO 原子提交 + 澄清/终止守卫 + 研究作用域 COW 无效化。
 */
export class StateUpdateOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'state_update' as const;

  constructor(private readonly host: StateUpdateNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as StateUpdatePrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('StateUpdateOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runStateUpdatePrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  async runPrePlanSegment(
    input: StateUpdatePrePlanSegmentInput,
  ): Promise<StateUpdatePrePlanSegmentResult> {
    return runStateUpdatePrePlanSegment(this.host, input);
  }
}

export async function runStateUpdatePrePlanSegment(
  host: StateUpdateNodeHost,
  input: StateUpdatePrePlanSegmentInput,
): Promise<StateUpdatePrePlanSegmentResult> {
  const { request, state, prePlan } = input;
  let decisionState = input.decisionState;

  decisionState = (await host.executeStateUpdateStep(state, decisionState)) ?? decisionState;
  host.maybeSnapshot(state, 'AUTO');

  decisionState = await host.applyRelaxationFingerprintToDso(state, decisionState);

  const terminalOutcome = await host.maybeHaltTerminalNoSolution(input, decisionState);
  if (terminalOutcome) {
    return terminalOutcome;
  }

  const structuredIntakeOutcome = await host.maybeHaltStructuredIntakeClarification(input, decisionState);
  if (structuredIntakeOutcome) {
    return structuredIntakeOutcome;
  }

  const clarificationOutcome = await host.maybeHaltHardGapsClarification(input, decisionState);
  if (clarificationOutcome) {
    return clarificationOutcome;
  }

  await host.applyResearchScopeInvalidationCow(request, state);

  const stop = prePlan.maybeStopAfter('state_update');
  if (stop) {
    return stop;
  }
  return { kind: 'continue', decisionState };
}
