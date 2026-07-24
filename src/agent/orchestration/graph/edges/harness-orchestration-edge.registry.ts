import { HarnessStepName } from '../../../../harness/contracts/harness-step.types';
import type { HarnessSuggestedAction } from '../../../../harness/failures/failure-event.types';
import type { HarnessStepAdmissionResult } from '../../../../harness/runtime/harness-step-admission.types';
import {
  HARNESS_STEP_ORDER,
  nextHarnessStepAfter,
  suggestPreviousHarnessStep,
} from '../../../../harness/lib/harness-step-order';
import type { OrchestrationNodeId } from '../orchestration-graph.types';
import { resolvePlanVerifyLoopNext } from './plan-verify-loop.edges';

export { HARNESS_STEP_ORDER, suggestPreviousHarnessStep };

export const HARNESS_STEP_TO_GRAPH_NODE: Record<HarnessStepName, OrchestrationNodeId> = {
  [HarnessStepName.INTAKE]: 'intake',
  [HarnessStepName.RESEARCH]: 'research',
  [HarnessStepName.GATE_EVAL]: 'gate_eval',
  [HarnessStepName.PLAN_GEN]: 'plan_gen',
  [HarnessStepName.VERIFY]: 'verify',
  [HarnessStepName.REPAIR]: 'repair',
  [HarnessStepName.NARRATE]: 'narrate',
};

/** L2 校验码 → Harness 建议动作（VERIFY 证据绑定等） */
export const HARNESS_VALIDATION_CODE_TO_ACTION: Partial<
  Record<string, HarnessSuggestedAction>
> = {
  EVIDENCE_SNAPSHOT_UNBOUND: 'RETURN_TO_RESEARCH',
  EVIDENCE_VERSION_MISMATCH: 'RETURN_TO_RESEARCH',
  REQUIRED_INPUT_MISSING: 'RETURN_TO_RESEARCH',
};

/** Harness 建议动作 → 编排图节点（含 plan_verify 子图出口） */
export function resolveGraphNodeForHarnessAction(
  from: OrchestrationNodeId,
  action: HarnessSuggestedAction,
): OrchestrationNodeId | 'END' | undefined {
  if (from === 'verify' && action === 'RETURN_TO_RESEARCH') {
    const edge = resolvePlanVerifyLoopNext('verify');
    return edge && edge !== 'END' ? edge : 'research';
  }
  if (from === 'verify' && action === 'RETRY') {
    return 'plan_gen';
  }
  return undefined;
}

export function harnessStepToGraphNode(step: HarnessStepName | string): OrchestrationNodeId {
  const key = step as HarnessStepName;
  return HARNESS_STEP_TO_GRAPH_NODE[key] ?? 'intake';
}

export function suggestGraphEntryFromHarnessAdmission(
  admission: HarnessStepAdmissionResult,
): OrchestrationNodeId | undefined {
  if (admission.passed) return undefined;
  const harnessFallback =
    admission.suggested_fallback_step ?? suggestPreviousHarnessStep(admission.harness_step);
  return harnessStepToGraphNode(harnessFallback);
}

export function inferHarnessActionFromFailureEvent(event: {
  suggestedAction?: string;
  code?: string;
  severity?: string;
}): HarnessSuggestedAction | undefined {
  if (
    event.suggestedAction === 'RETURN_TO_RESEARCH' ||
    event.suggestedAction === 'RETRY' ||
    event.suggestedAction === 'BLOCK' ||
    event.suggestedAction === 'NEED_USER_CONFIRM'
  ) {
    return event.suggestedAction;
  }
  if (event.code && HARNESS_VALIDATION_CODE_TO_ACTION[event.code]) {
    return HARNESS_VALIDATION_CODE_TO_ACTION[event.code];
  }
  if (event.severity === 'LEVEL_2_LOGIC_GAP' || event.severity === 'L2') {
    return 'RETURN_TO_RESEARCH';
  }
  return undefined;
}

export function computeResumeGraphEntryFromHarnessLast(last?: string): OrchestrationNodeId {
  if (!last) return 'intake';
  if (last === HarnessStepName.INTAKE || last === 'INTAKE') {
    return 'research';
  }
  const nextHarness = nextHarnessStepAfter(last as HarnessStepName);
  return harnessStepToGraphNode(nextHarness);
}
