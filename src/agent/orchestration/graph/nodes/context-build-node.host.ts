import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { ContextBuildPrePlanSegmentInput } from './base.node';

export interface ContextBuildNodeHost {
  readonly logger: Logger;

  executeContextBuildStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;
}

export type ContextBuildPrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
