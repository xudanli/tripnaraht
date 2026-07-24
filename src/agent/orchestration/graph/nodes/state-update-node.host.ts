import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { StateUpdatePrePlanSegmentInput } from './base.node';

/**
 * STATE_UPDATE 节点宿主：pre_plan 段内 DSO 同步、澄清/终止守卫、研究 COW 无效化。
 */
export interface StateUpdateNodeHost {
  readonly logger: Logger;

  executeStateUpdateStep(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined>;

  applyRelaxationFingerprintToDso(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined>;

  maybeHaltTerminalNoSolution(
    input: StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<GraphRunOutcome | null>;

  maybeHaltHardGapsClarification(
    input: StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<GraphRunOutcome | null>;

  maybeHaltStructuredIntakeClarification(
    input: StateUpdatePrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<GraphRunOutcome | null>;

  applyResearchScopeInvalidationCow(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): Promise<void>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;
}

export type StateUpdatePrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
