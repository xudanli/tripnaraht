import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { Itinerary } from '../../../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunOptimizePhaseParams {
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
}

export interface OptimizePhaseHost {
  readonly logger: Logger;

  readonly decisionKernel?: DecisionKernelService;

  /** TDFPM fatigue 预计算（无 calculator 时返回 undefined） */
  computeOptimizeFatigue(planDraft: Itinerary | undefined): number | undefined;
}
