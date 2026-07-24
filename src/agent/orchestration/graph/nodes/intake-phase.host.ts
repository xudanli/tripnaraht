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
import type { TripTaskMemory } from '../../../context-engine/interfaces/trip-task-memory.interface';
import type { DecisionTelemetryEvent } from '../../../../trips/decision/telemetry/decision-telemetry.types';

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

  /** Memory OS P0 — Constraint Sink hydrate（可选） */
  isConstraintSinkHydrateEnabled?(): boolean;

  getActiveTripStateForConstraintSink?(): TripTaskMemory | null;

  recordConstraintSinkHydrated?(appliedKeys: string[]): void;

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

  /** 极光选日澄清卡：INTAKE 短路路径下附加 RAG 观测点/实操摘录 */
  fetchAuroraSlotPlacementRagSupplement?(
    intakeMsg: string,
    opts?: { request: RouteAndRunRequestDto; tripId?: string },
  ): Promise<{
    supplementZh: string | null;
    citationCount: number;
    relevantCount: number;
    usedStaticFallback: boolean;
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

  tryApplyBoundTripLodgingReplace?(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<{
    applied: boolean;
    answerText?: string;
    checkInIso?: string;
    fromName?: string;
    toName?: string;
    reason?: string;
    skillsHit?: string[];
  }>;

  tryApplyBoundTripItineraryDayReplan?(
    tripId: string,
    userId: string | undefined,
    message: string,
    dateRange?: { start_date?: string; end_date?: string },
  ): Promise<{
    applied: boolean;
    deletedCount?: number;
    addedCount?: number;
    answerText?: string;
    itemIds?: string[];
    reason?: string;
    skillsHit?: string[];
  }>;

  tryApplyBoundTripItineraryAdjustDraft?(
    tripId: string,
    userId: string | undefined,
    request: import('../../../dto/route-and-run.dto').RouteAndRunRequestDto,
  ): Promise<import('./intake-itinerary-adjust-apply.util').ItineraryAdjustDraftApplyResult>;

  /** Intelligence-grade 决策埋点（best-effort，不阻塞 INTAKE） */
  recordIntakeDecisionTelemetry?(event: DecisionTelemetryEvent): Promise<unknown>;

  /** INTAKE 澄清接受后，将放宽 action 写入 trip 约束（需 trip_id） */
  persistRelaxationToTrip?(
    tripId: string,
    userId: string,
    applied: import('../../../services/clarification-handler.service').AppliedRelaxation[],
  ): Promise<{ persisted: boolean; constraintsVersion?: number; actionIds: string[] } | undefined>;
}
