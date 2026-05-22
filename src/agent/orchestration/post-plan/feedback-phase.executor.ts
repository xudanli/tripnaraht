import {
  buildPatchFromDSOPrimary,
  orchestratorStateToDecisionStatePatch,
} from '../../../decision/kernel/orchestrator-state-mapper';
import type { OrchestrationStep, SubAgentType } from '../../interfaces/trip-plan.interface';
import {
  formatFeedbackInputsZh,
  formatFeedbackOutputsZh,
} from '../../utils/decision-log-user-facing.zh.util';
import type { FeedbackPhaseHost, RunFeedbackPhaseParams } from './feedback-phase.host';

/**
 * FEEDBACK 执行体：Kernel.executeFeedback + decision_log 审计。
 */
export async function runFeedbackPhase(
  host: FeedbackPhaseHost,
  params: RunFeedbackPhaseParams,
): Promise<DecisionState | undefined> {
  const { state, decisionState } = params;

  if (!host.decisionKernel || !decisionState) return decisionState;

  state.current_step = 'FEEDBACK';
  const patch = host.isDsoAsPrimary()
    ? buildPatchFromDSOPrimary(decisionState, state)
    : orchestratorStateToDecisionStatePatch(state);

  const { newState: synced } = await host.decisionKernel.executeFeedback(decisionState, patch);

  state.decision_log.push({
    request_id: state.request_id,
    step: 'FEEDBACK' as OrchestrationStep,
    actor: 'Orchestrator' as SubAgentType,
    inputs_summary: formatFeedbackInputsZh(),
    outputs_summary: formatFeedbackOutputsZh(synced.confidence, synced.systemState?.version),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
  });
  state.metadata.last_updated_at = new Date().toISOString();

  return synced;
}
