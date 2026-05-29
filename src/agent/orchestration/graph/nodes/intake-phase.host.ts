import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState, TripPlanRequest } from '../../../interfaces/trip-plan.interface';
import type { ClarificationHandlerService } from '../../../services/clarification-handler.service';
import type { LocalCaseStoreService } from '../../../cbr/local-case-store.service';
import type { ItinerarySlotPlacementGapResult } from '../../../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';
import type { ItinerarySlotCandidate } from '../../../utils/itinerary-slot-placement.util';
import type { TripDaySnapshotForPlacement } from '../../../utils/route-and-run-intent-analyzer.util';

export interface RunIntakePhaseParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  llmProvider: LlmProvider;
}

/**
 * INTAKE 阶段宿主：由 ClaudeOrchestratorService 实现，执行体不直接注入 Service 海。
 */
export interface IntakePhaseHost {
  readonly logger: Logger;

  readonly clarificationHandler?: ClarificationHandlerService;

  readonly decisionKernel?: DecisionKernelService;

  readonly localCaseStore?: LocalCaseStoreService;

  convertToTripPlanRequest(request: RouteAndRunRequestDto, state: OrchestratorState): TripPlanRequest;

  hydrateTripPlanRequestFromTripRecord(
    request: RouteAndRunRequestDto,
    tripPlanRequest: TripPlanRequest,
    state: OrchestratorState,
  ): Promise<void>;

  kernelCreateInitialOpts(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Parameters<DecisionKernelService['createInitialState']>[1];

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: import('../../../interfaces/trip-plan.interface').OrchestrationStep,
    actor: string,
  ): Promise<void>;

  applyMarathonPipelineSignals(state: OrchestratorState, request: RouteAndRunRequestDto): void;

  loadTripDaySnapshotsForSlotPlacement(
    tripId: string,
    userId: string,
  ): Promise<TripDaySnapshotForPlacement[]>;

  resolveItinerarySlotCandidatesForIntake(
    intakeMsg: string,
    tripPlanRequest: TripPlanRequest,
    tripId: string,
    userId: string,
    tripDaySnapshots: TripDaySnapshotForPlacement[],
  ): Promise<{
    candidates: ItinerarySlotCandidate[];
    paAnalysis?: ItinerarySlotPlacementGapResult;
  }>;

  tryApplyBoundTripItineraryItemDelete?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    deletedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
  }>;

  tryApplyBoundTripItineraryItemAdd?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    addedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
  }>;

  tryApplyBoundTripItineraryItemUpdate?(
    tripId: string,
    userId: string | undefined,
    message: string,
  ): Promise<{
    applied: boolean;
    updatedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
  }>;
}
