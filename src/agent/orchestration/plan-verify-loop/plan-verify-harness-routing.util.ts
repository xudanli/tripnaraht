import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { HarnessSuggestedAction } from '../../../harness/failures/failure-event.types';
import { inferHarnessActionFromFailureEvent } from '../graph/edges/harness-orchestration-edge.registry';
import { isVerifyReturnToResearchEnabled } from '../orchestration-governance-matrix.constants';

/** 从 DSO 读取 VERIFY 步 Harness 失败后的建议动作（边表注册表统一推断） */
export function pickVerifyHarnessSuggestedAction(
  decisionState: DecisionState | undefined,
): HarnessSuggestedAction | undefined {
  const events = decisionState?.harnessRuntime?.last_harness_failure_events;
  if (!events?.length) return undefined;
  const verifyEvent = events.find((e) => e.step === 'VERIFY' || e.step === 'verify');
  const target = verifyEvent ?? events[events.length - 1];
  if (!target) return undefined;
  return inferHarnessActionFromFailureEvent(target);
}

export function isReturnToResearchEnabled(): boolean {
  return isVerifyReturnToResearchEnabled();
}
