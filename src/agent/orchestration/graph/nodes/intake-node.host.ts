import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { IntakePrePlanSegmentInput } from './base.node';
import type { OrchestrationResult } from '../../../interfaces/claude-orchestration.interface';

/**
 * INTAKE 节点宿主：由 ClaudeOrchestratorService 实现。
 */
export interface IntakeNodeHost {
  readonly logger: Logger;

  executeIntakeStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
  ): Promise<void>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;

  buildPrePlanSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: import('../../../../decision/kernel/decision-state.types').DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;

  /** CRUD 短路后合并复合句中的 DATA_LOOKUP 轻量回答 */
  mergeCompoundDataLookupFollowup?(
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<void>;

  tryApplyBoundTripItineraryItemDelete?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<import('./intake-itinerary-delete.util').ItineraryItemDeleteApplyResult>;

  tryApplyBoundTripItineraryItemAdd?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<import('./intake-itinerary-add.util').ItineraryItemAddApplyResult>;

  tryApplyBoundTripItineraryItemUpdate?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<import('./intake-itinerary-update.util').ItineraryItemUpdateApplyResult>;

  tryApplyBoundTripItineraryDayReplan?(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<import('./intake-itinerary-day-replan.util').ItineraryDayReplanApplyResult>;

  tryApplyBoundTripItineraryAdjustDraft?(
    tripId: string,
    userId: string | undefined,
    request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>,
  ): Promise<import('./intake-itinerary-adjust-apply.util').ItineraryAdjustDraftApplyResult>;
}

export type IntakePrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
