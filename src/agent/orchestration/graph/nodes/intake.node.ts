import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type IntakePrePlanSegmentInput,
} from './base.node';
import type { IntakeNodeHost, IntakePrePlanSegmentResult } from './intake-node.host';
import {
  applyItineraryItemDeleteIfRequested,
  shouldTerminalAfterItineraryItemDelete,
} from './intake-itinerary-delete.util';
import {
  applyItineraryItemAddIfRequested,
  shouldTerminalAfterItineraryItemAdd,
} from './intake-itinerary-add.util';
import {
  applyItineraryItemUpdateIfRequested,
  shouldTerminalAfterItineraryItemUpdate,
} from './intake-itinerary-update.util';
import { segmentOutcomeToNodeResult } from './node-outcome.adapter';

/**
 * pre_plan 子图 INTAKE 节点（Phase 4b P0 第二项）。
 * 意图解析与旁路键熔断内聚于此；能力由 {@link IntakeNodeHost} 供应。
 */
export class IntakeOrchestratorNode extends BaseOrchestratorNode {
  readonly nodeId = 'intake' as const;

  constructor(private readonly host: IntakeNodeHost) {
    super();
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const input = context as IntakePrePlanSegmentInput;
    if (!input.prePlan) {
      return {
        success: false,
        error: new Error('IntakeOrchestratorNode requires prePlan segment control on context'),
      };
    }
    const segment = await runIntakePrePlanSegment(this.host, input);
    return segmentOutcomeToNodeResult(segment);
  }

  async runPrePlanSegment(input: IntakePrePlanSegmentInput): Promise<IntakePrePlanSegmentResult> {
    return runIntakePrePlanSegment(this.host, input);
  }
}

export async function runIntakePrePlanSegment(
  host: IntakeNodeHost,
  input: IntakePrePlanSegmentInput,
): Promise<IntakePrePlanSegmentResult> {
  const { request, context, state, llmProvider, prePlan, resumeSkipIntake } = input;
  let decisionState = input.decisionState;

  if (!resumeSkipIntake) {
    await host.executeIntakeStep(request, context, state, llmProvider);
  } else {
    host.logger.log('[Claude Orchestrator] Durable resume: 跳过 INTAKE，进入 STATE_UPDATE');
    state.current_step = 'STATE_UPDATE';
    state.metadata.last_updated_at = new Date().toISOString();
    await applyItineraryItemDeleteIfRequested(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
    });
    await applyItineraryItemAddIfRequested(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
    });
    await applyItineraryItemUpdateIfRequested(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
    });
  }

  if (
    shouldTerminalAfterItineraryItemDelete(state) ||
    shouldTerminalAfterItineraryItemAdd(state) ||
    shouldTerminalAfterItineraryItemUpdate(state)
  ) {
    host.maybeSnapshot(state, 'CHECKPOINT');
    state.current_step = 'DONE';
    state.metadata.last_updated_at = new Date().toISOString();
    state.metadata.total_duration_ms = Date.now() - prePlan.startTime;
    return prePlan.prePlanTerminal(
      'terminal_done',
      host.buildPrePlanSuccessResult(state, prePlan.startTime, decisionState, context),
    );
  }

  host.maybeSnapshot(state, 'AUTO');
  const stop = prePlan.maybeStopAfter('intake');
  if (stop) {
    return stop;
  }
  return { kind: 'continue', decisionState };
}
