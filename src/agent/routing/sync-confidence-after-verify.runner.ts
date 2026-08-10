/**
 * VERIFY 后同步 confidence 到 DSO（从 ClaudeOrchestrator 迁出）。
 */

import type { SyncConfidenceAfterVerifyHost } from './sync-confidence-after-verify.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export function syncConfidenceAfterVerify(
  host: SyncConfidenceAfterVerifyHost,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
): DecisionState | undefined {
  if (!host.decisionKernel || !decisionState) return decisionState;
  const verifyErrors = state.errors.filter((e) => e.step === 'VERIFY');
  const hasVerificationIssues = state.decision_log.some(
    (e) => e.step === 'VERIFY' && e.outputs_summary?.includes('个问题'),
  );
  let confidence = 0.9;
  if (verifyErrors.length > 0) confidence -= 0.2 * verifyErrors.length;
  if (hasVerificationIssues) confidence -= 0.1;
  return host.decisionKernel.setConfidence(decisionState, Math.max(0.1, confidence));
}
