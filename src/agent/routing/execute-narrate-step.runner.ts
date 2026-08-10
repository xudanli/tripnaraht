/**
 * NARRATE 步骤：产出用户可读解释（从 ClaudeOrchestrator 迁出）。
 */

import type { ExecuteNarrateStepHost } from './execute-narrate-step.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export async function executeNarrateStep(
  host: ExecuteNarrateStepHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  state: OrchestratorState,
  decisionState?: DecisionState,
): Promise<void> {
  await host.createNarrateNodeHost().runNarratePhase({
    request,
    context,
    state,
    decisionState,
  });
  await host.routeAndRunTaskProgress?.reportOrchestrationStepWithState('NARRATE', state);
}
