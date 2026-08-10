/**
 * STATE_UPDATE 后写入 relaxation fingerprint（从 ClaudeOrchestrator 迁出）。
 */

import type { RelaxationFingerprintHost } from './relaxation-fingerprint.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export async function applyRelaxationFingerprintAfterStateUpdate(
  host: RelaxationFingerprintHost,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
): Promise<DecisionState | undefined> {
  if (!host.decisionKernel || !decisionState) return decisionState;
  const fp = (state.metadata as { last_relaxation_fingerprint?: string })
    ?.last_relaxation_fingerprint;
  if (!fp) return decisionState;
  const prev = decisionState.systemState?.lastRelaxationFingerprint;
  const prevSame = decisionState.systemState?.consecutiveSameRelaxationAttempts ?? 0;
  const same = prev && prev === fp;
  const nextSame = same ? prevSame + 1 : 0;
  const prevRetry = decisionState.systemState?.planGenRetryCount ?? 0;
  return host.decisionKernel.updateState(decisionState, {
    systemState: {
      requestId: state.request_id,
      lastRelaxationFingerprint: fp,
      consecutiveSameRelaxationAttempts: nextSame,
      planGenRetryCount: prevRetry + 1,
    } as DecisionState['systemState'],
  });
}
