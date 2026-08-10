/**
 * PLAN_GEN / VERIFY / REPAIR fallback step 共享宿主。
 */

import type { Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type {
  GateResult,
  Itinerary,
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
  TripPlanRequest,
} from '../../../interfaces/trip-plan.interface';

export interface PlanLoopFallbackStepsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly skillsRegistry?: {
    getSkill: (name: string) => { execute: (input: any) => Promise<any> } | undefined;
  };
  readonly trajectoryCollection?: {
    collectTrajectory: (input: any) => Promise<void>;
  };
  readonly complianceAgent?: {
    checkCompliance: (
      itinerary: Itinerary,
      gateResult: GateResult,
      state: OrchestratorState,
    ) => Promise<any>;
  };
  readonly localInsightAgent?: {
    suggestAlternatives: (
      trip: TripPlanRequest,
      gateResult: GateResult,
      state: OrchestratorState,
    ) => Promise<any>;
  };

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: OrchestrationStep,
    actor: SubAgentType,
  ): Promise<void>;
}

export type {
  RouteAndRunRequestDto,
  AgentContext,
  OrchestratorState,
  Itinerary,
  TripPlanRequest,
};
