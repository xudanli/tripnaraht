import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { IDsoLatestStateProvider } from '../../../../decision/kernel/dso-latest-state-provider.interface';
import type { DecisionState, DecisionStatePatch } from '../../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunStateUpdatePhaseParams {
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
}

/**
 * STATE_UPDATE 阶段宿主：由 ClaudeOrchestratorService 实现。
 */
export interface StateUpdatePhaseHost {
  readonly logger: Logger;

  readonly decisionKernel?: DecisionKernelService;

  readonly dsoLatestStateProvider?: IDsoLatestStateProvider;

  isDsoAsPrimary(): boolean;

  applyPoiPlanningToPatch(
    patch: DecisionStatePatch,
    decisionState: DecisionState,
    state: OrchestratorState,
  ): void;

  extractWorldModelFromContextPackage(
    decisionState: DecisionState | undefined,
  ): { physical?: unknown; human?: unknown; routeDirection?: unknown } | undefined;
}
