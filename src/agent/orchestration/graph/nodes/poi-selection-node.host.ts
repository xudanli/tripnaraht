import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { PoiSelectionStepResult } from './poi-selection-phase.host';
import type { PoiSelectionPrePlanSegmentInput } from './base.node';

/**
 * POI_SELECTION 节点宿主。
 */
export interface PoiSelectionNodeHost {
  readonly logger: Logger;

  executePoiSelectionStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<PoiSelectionStepResult>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;

  applyFallbackPlan(state: OrchestratorState): void;

  recordPoiPlanningOutcomeAfterItinerary(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): void;

  buildSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;

  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;
}

export type PoiSelectionPrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
