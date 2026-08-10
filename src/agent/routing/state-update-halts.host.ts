/**
 * STATE_UPDATE 段：终端 / 结构化澄清 / HARD gaps 中止宿主。
 */

import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { AgentContext, OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export interface StateUpdateHaltsHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;
  shouldReturnClarificationForMarathonIntake(state: OrchestratorState): boolean;
  shouldReturnClarificationForFroad2wdIntake(state: OrchestratorState): boolean;
  shouldReturnClarificationForPeakSeasonTimeShiftIntake(state: OrchestratorState): boolean;
  shouldReturnClarificationForItinerarySlotPlacementIntake(state: OrchestratorState): boolean;
  shouldReturnClarificationForHardGaps(state: OrchestratorState): boolean;
  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult;
  buildTerminalNoSolutionResult(
    state: OrchestratorState,
    startTime: number,
    decisionState?: DecisionState,
    context?: AgentContext,
  ): OrchestrationResult;
}
