import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  BaseOrchestratorNode,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type IntakePrePlanSegmentInput,
} from './base.node';
import type { IntakeNodeHost, IntakePrePlanSegmentResult } from './intake-node.host';
import {
  shouldTerminalAfterItineraryItemDelete,
} from './intake-itinerary-delete.util';
import {
  shouldTerminalAfterItineraryItemAdd,
} from './intake-itinerary-add.util';
import {
  applyItineraryCrudWithCompoundPlan,
  hasCompoundDataLookupFollowup,
} from './intake-itinerary-compound.util';
import {
  shouldTerminalAfterItineraryItemUpdate,
} from './intake-itinerary-update.util';
import {
  shouldTerminalAfterLodgingReplace,
} from './intake-itinerary-lodging-replace.util';
import {
  applyItineraryDayReplanIfRequested,
  shouldTerminalAfterItineraryDayReplan,
} from './intake-itinerary-day-replan.util';
import {
  applyItineraryAdjustDraftIfRequested,
  shouldTerminalAfterItineraryAdjustDraftApply,
} from './intake-itinerary-adjust-apply.util';
import { shouldTerminalAfterWorkbenchPlaceholder } from './intake-workbench-placeholder.util';
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
    await applyItineraryAdjustDraftIfRequested(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
      request,
      promMetrics: host.promMetrics,
    });
    if (!shouldTerminalAfterItineraryAdjustDraftApply(state)) {
      await host.executeIntakeStep(request, context, state, llmProvider);
    }
  } else {
    host.logger.log('[Claude Orchestrator] Durable resume: 跳过 INTAKE，进入 STATE_UPDATE');
    state.current_step = 'STATE_UPDATE';
    state.metadata.last_updated_at = new Date().toISOString();
    const md = state.metadata as Record<string, unknown>;
    const tpr = (md.trip_plan_request ?? state.trip_plan_request) as
      | { date_range?: { start_date?: string; end_date?: string }; start_date?: string; end_date?: string }
      | undefined;
    const dateRange =
      tpr?.date_range ??
      (tpr?.start_date ? { start_date: tpr.start_date, end_date: tpr.end_date } : undefined);
    await applyItineraryCrudWithCompoundPlan(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
      dateRange,
    });
    await applyItineraryDayReplanIfRequested(host, {
      message: request.message,
      tripId: request.trip_id,
      userId: request.user_id,
      state,
      dateRange,
    });
  }

  if (
    shouldTerminalAfterItineraryItemDelete(state) ||
    shouldTerminalAfterItineraryItemAdd(state) ||
    shouldTerminalAfterItineraryItemUpdate(state) ||
    shouldTerminalAfterLodgingReplace(state) ||
    shouldTerminalAfterItineraryAdjustDraftApply(state) ||
    shouldTerminalAfterItineraryDayReplan(state) ||
    shouldTerminalAfterWorkbenchPlaceholder(state)
  ) {
    if (hasCompoundDataLookupFollowup(state) && host.mergeCompoundDataLookupFollowup) {
      await host.mergeCompoundDataLookupFollowup(state, request, context, input.llmProvider);
    }
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
