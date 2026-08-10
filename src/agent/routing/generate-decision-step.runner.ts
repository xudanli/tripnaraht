/**
 * 生成 Decision Step（从 ClaudeOrchestrator 迁出）。
 */

import type { GenerateDecisionStepHost } from './generate-decision-step.host';
import type { OrchestrationStep, OrchestratorState, SubAgentType } from '../interfaces/trip-plan.interface';

export async function generateDecisionStepForStep(
  host: GenerateDecisionStepHost,
  state: OrchestratorState,
  orchestrationStep: OrchestrationStep,
  subAgent?: SubAgentType,
): Promise<void> {
  if (!host.decisionDraftGenerator) {
    return;
  }

  try {
    const decisionStep =
      await host.decisionDraftGenerator.generateDecisionStepFromOrchestrationState(
        state,
        orchestrationStep,
        subAgent,
      );

    if (decisionStep) {
      if (!state.decision_steps) {
        state.decision_steps = [];
      }
      state.decision_steps.push(decisionStep as any);
      host.logger.debug(
        `[Claude Orchestrator] 生成 Decision Step: type=${(decisionStep as any).type}, step=${orchestrationStep}`,
      );
    }
  } catch (error: any) {
    host.logger.warn(`[Claude Orchestrator] Decision Step 生成失败，跳过: ${error?.message}`);
  }
}
