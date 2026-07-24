import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { NarrateExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentContext } from '../../interfaces/claude-orchestration.interface';
import type { GateResult, Itinerary, OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { ResearchConflictNegotiationReport } from '../../teams/research/research-conflict-negotiation.types';

export interface RunNarratePhaseParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
}

export type NarratePhaseManifestAudit = {
  collapsed_suture_count: number;
};

export type NarratePhaseResult = {
  kernelPathUsed: boolean;
  fallbackUsed: boolean;
  narrativeDayCount: number;
  manifestAudit?: NarratePhaseManifestAudit;
  /** 非致命：已写入 state.errors */
  nonFatalError?: string;
};

export interface NarratePhaseHost {
  readonly logger: Logger;

  readonly decisionKernel?: DecisionKernelService;

  readonly narratorAgent?: {
    narrate(
      itinerary: Itinerary,
      gate: GateResult,
      decisionLog: OrchestratorState['decision_log'],
      state: OrchestratorState,
    ): Promise<unknown>;
  };

  resolveDosExecutionContext(
    request: RouteAndRunRequestDto,
  ): { planDelta: unknown[]; tripId: string } | null;

  kernelCreateInitialOpts(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Parameters<DecisionKernelService['createInitialState']>[1];

  parseResearchConflictReport(raw: unknown): ResearchConflictNegotiationReport | undefined;

  readRealtimeRerollCount(researchData: Record<string, unknown> | undefined): number;

  memoryReplayDecisionSource: string;
}
