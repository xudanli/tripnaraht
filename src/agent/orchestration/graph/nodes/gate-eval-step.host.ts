/**
 * GATE_EVAL fallback step 宿主（准备度 / Gatekeeper / 风险预测）。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
  TripPlanRequest,
} from '../../../interfaces/trip-plan.interface';
import type { TripContext } from '../../../../trips/readiness/types/trip-context.types';

export interface GateEvalStepHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly readinessService?: {
    checkFromDestination: (...args: any[]) => Promise<any>;
    generateDecisionLogEntries: (...args: any[]) => any[];
  };
  readonly userDecisionService?: unknown;
  readonly failureRiskPredictionService?: unknown;
  readonly gatekeeperAgent?: {
    evaluateGate: (
      trip: TripPlanRequest,
      researchData: Record<string, unknown>,
      state: OrchestratorState,
    ) => Promise<OrchestratorState['gate_result']>;
  };

  extractTripContextFromState(state: OrchestratorState): TripContext;

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: OrchestrationStep,
    actor: SubAgentType,
  ): Promise<void>;
}

export type { RouteAndRunRequestDto, AgentContext, OrchestratorState };
