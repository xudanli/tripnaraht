/**
 * Conductor → Kernel.executePhase 宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface ExecutePhaseViaKernelHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly decisionKernel?: {
    executePhase: (
      decisionState: DecisionState,
      state: OrchestratorState,
      phaseName: string,
      executeFn: () => Promise<void>,
    ) => Promise<DecisionState>;
  };

  executeStateUpdateStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): DecisionState | undefined | Promise<DecisionState | undefined>;
}
