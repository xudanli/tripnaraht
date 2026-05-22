import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type ContextBuildPrePlanSegmentInput,
} from './base.node';
import type { ContextBuildNodeHost, ContextBuildPrePlanSegmentResult } from './context-build-node.host';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';

/**
 * pre_plan 子图 CONTEXT_BUILD 节点（Phase 4b pre_plan 收官）。
 * 将前置节点沉淀的 DSO 聚合为 PLAN_GEN 可用的 Context Package。
 */
export class ContextBuildOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'context_build' as const;

  constructor(private readonly host: ContextBuildNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as ContextBuildPrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('ContextBuildOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runContextBuildPrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  async runPrePlanSegment(
    input: ContextBuildPrePlanSegmentInput,
  ): Promise<ContextBuildPrePlanSegmentResult> {
    return runContextBuildPrePlanSegment(this.host, input);
  }
}

export async function runContextBuildPrePlanSegment(
  host: ContextBuildNodeHost,
  input: ContextBuildPrePlanSegmentInput,
): Promise<ContextBuildPrePlanSegmentResult> {
  const { request, context, state, prePlan } = input;
  let decisionState = input.decisionState;

  decisionState =
    (await host.executeContextBuildStep(request, context, state, decisionState)) ?? decisionState;
  host.maybeSnapshot(state, 'AUTO');

  const stop = prePlan.maybeStopAfter('context_build');
  if (stop) {
    return stop;
  }
  return { kind: 'continue', decisionState };
}
