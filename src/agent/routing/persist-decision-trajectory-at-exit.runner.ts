/**
 * 编排退出时 finalize decision trajectory（从 ClaudeOrchestrator 迁出）。
 */

import type { PersistDecisionTrajectoryAtExitHost } from './persist-decision-trajectory-at-exit.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { finalizeOrchestrationDecisionTrajectory } from '../training/utils/decision-trajectory-orchestration.hook';

export async function persistDecisionTrajectoryAtOrchestrationExit(
  host: PersistDecisionTrajectoryAtExitHost,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
  answerText?: string,
): Promise<void> {
  await finalizeOrchestrationDecisionTrajectory({
    interlocutor: host.decisionTrajectoryInterlocutor as any,
    state,
    decisionState,
    answerText,
  });
}
