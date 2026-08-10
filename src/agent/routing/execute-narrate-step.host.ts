/**
 * NARRATE step 宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { NarrateNodeHost } from '../orchestration/post-plan';

export interface ExecuteNarrateStepHost {
  createNarrateNodeHost(): NarrateNodeHost;
  readonly routeAndRunTaskProgress?: {
    reportOrchestrationStepWithState(
      step: 'NARRATE',
      state: OrchestratorState,
    ): Promise<unknown> | void;
  };
}
