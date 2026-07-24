import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  isReturnToResearchEnabled,
  pickVerifyHarnessSuggestedAction,
} from '../../plan-verify-loop/plan-verify-harness-routing.util';
import type { VerifyPhaseVerdict } from './verify-verdict.types';

/**
 * 根据 VERIFY 后的 DSO / 编排态合成裁决（循环胶水消费，不在 verify 执行体内改图路由）。
 */
export function buildVerifyPhaseVerdict(
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
): VerifyPhaseVerdict {
  if (decisionState?.verification?.hasFatal) {
    const msg =
      decisionState.verification.issues.find((i) => i.class === 'FATAL')?.message ??
      'FATAL_VERIFICATION_ISSUE';
    return { kind: 'fatal', fatalMessage: msg };
  }

  const harnessAction = pickVerifyHarnessSuggestedAction(decisionState);
  if (
    isReturnToResearchEnabled() &&
    harnessAction === 'RETURN_TO_RESEARCH' &&
    !decisionState?.verification?.hasFatal
  ) {
    return { kind: 'return_to_research' };
  }

  const needsRepair =
    state.gate_result?.gate_result === 'ADJUST_REQUIRED' || state.errors.length > 0;
  if (needsRepair) {
    return { kind: 'needs_repair' };
  }

  return { kind: 'complete' };
}
