import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

export interface RunFeedbackPhaseParams {
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
}

export interface FeedbackPhaseHost {
  readonly logger: Logger;

  readonly decisionKernel?: DecisionKernelService;

  isDsoAsPrimary(): boolean;
}
