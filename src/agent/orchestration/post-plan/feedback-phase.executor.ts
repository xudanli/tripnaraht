import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { buildPatchFromDSOPrimary } from '../../../decision/kernel/orchestrator-state-mapper';
import { projectToOrchestratorState } from '../../../decision/kernel/dso-authority.util';
import { markOutcomeReconciled } from '../../../decision/kernel/decision-cognition.util';
import type { OrchestrationStep, SubAgentType } from '../../interfaces/trip-plan.interface';
import {
  formatFeedbackInputsZh,
  formatFeedbackOutputsZh,
} from '../../utils/decision-log-user-facing.zh.util';
import type { FeedbackPhaseHost, RunFeedbackPhaseParams } from './feedback-phase.host';

/**
 * FEEDBACK 执行体：Kernel.executeFeedback + DSO→O 投影 + decision_log 审计。
 * 出口打 OUTCOME_RECONCILED（闭环观察结果 → 更新现实）。
 */
export async function runFeedbackPhase(
  host: FeedbackPhaseHost,
  params: RunFeedbackPhaseParams,
): Promise<DecisionState | undefined> {
  const { state, decisionState } = params;

  if (!host.decisionKernel || !decisionState) return decisionState;

  // DSO 唯一可写权威：始终 DSO-primary 构建 patch，并由 DSO.currentPhase 投影 current_step
  if (!host.isDsoAsPrimary()) {
    host.logger.warn('[FEEDBACK] DSO_AS_PRIMARY=false ignored; forcing DSO-primary patch');
  }
  const patch = buildPatchFromDSOPrimary(decisionState, state);
  patch.systemState = {
    ...patch.systemState,
    currentPhase: 'FEEDBACK',
    lastUpdatedAt: new Date().toISOString(),
  };

  const { newState: synced } = await host.decisionKernel.executeFeedback(decisionState, patch);
  const reconciled = markOutcomeReconciled(synced);
  projectToOrchestratorState(reconciled, state, { phase: 'FEEDBACK' });
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  meta.cognition_markers = reconciled.cognition?.markers ?? [];
  state.metadata = meta as typeof state.metadata;

  state.decision_log.push({
    request_id: state.request_id,
    step: 'FEEDBACK' as OrchestrationStep,
    actor: 'Orchestrator' as SubAgentType,
    inputs_summary: formatFeedbackInputsZh(),
    outputs_summary: formatFeedbackOutputsZh(reconciled.confidence, reconciled.systemState?.version),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: { cognition_marker: 'OUTCOME_RECONCILED' },
  });
  state.metadata.last_updated_at = new Date().toISOString();

  return reconciled;
}
