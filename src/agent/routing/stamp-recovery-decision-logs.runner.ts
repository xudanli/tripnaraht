/**
 * Recovery 重试时给 orchestrator decision_log 打 recovery_context（纯函数）。
 */

import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type {
  DecisionRecoveryLogContext,
  RecoveryAuditFailureDomain,
} from '../../trips/decision/shared/decision-log-metadata-prd.types';

export function stampRecoveryOntoOrchestratorDecisionLogs(
  context: AgentContext | undefined,
  state: OrchestratorState,
): void {
  const inv = context?.recoveryInvocation;
  if (!inv?.is_retry) return;

  const recovery_context: DecisionRecoveryLogContext = {
    is_retry: true,
    retry_attempt: inv.retry_attempt,
    previous_failure_domain: inv.previous_failure_domain as RecoveryAuditFailureDomain,
    elapsed_from_start_ms: inv.elapsed_from_start_ms,
  };

  for (const entry of state.decision_log) {
    entry.metadata = {
      ...(entry.metadata ?? {}),
      recovery_context,
    };
  }

  if (inv.trace_summary?.length) {
    state.metadata = {
      ...(state.metadata ?? {}),
      recovery_trace_summary: inv.trace_summary,
    } as OrchestratorState['metadata'];
  }
}
