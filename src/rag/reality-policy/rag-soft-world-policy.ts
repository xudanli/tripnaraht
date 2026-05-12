/**
 * Soft-world (RAG) policy — same validity spine as planning ticks via `evaluatePlanningTick`.
 *
 * When enforcement is on (`isRagRealityPolicyGateActive`), missing `DecisionContextV0` → BLOCK.
 */

import type { DecisionContextV0 } from '../../trips/reality-kernel/decision-context.types';
import { evaluatePlanningTick } from '../../trips/reality-kernel/reality-policy-engine';
import type {
  RealityPolicyEvaluateResult,
  RealityPolicyVerdict,
} from '../../trips/reality-kernel/reality-policy-engine.types';
import { isRagRealityPolicyGateActive } from './rag-reality-policy.env';

export type RagSoftWorldScope = 'full' | 'restricted' | 'blocked';

function verdictToScope(verdict: RealityPolicyVerdict): RagSoftWorldScope {
  if (verdict === 'BLOCK') return 'blocked';
  if (verdict === 'DEGRADE') return 'restricted';
  return 'full';
}

function missingDecisionContextResult(): RealityPolicyEvaluateResult {
  return {
    verdict: 'BLOCK',
    codes: ['RAG_CONTEXT_REQUIRED'],
    reasons: ['rag_requires_decision_context_when_enforcement_on'],
    execution: {
      allowContinuePlanning: false,
      degradePlan: false,
      requireReplan: true,
      blockLiveWorldRead: true,
    },
  };
}

/**
 * Resolve whether RAG may run full corpus, restricted corpus, or not at all.
 *
 * @param decisionContext — bound Reality snapshot context (from client or TLS storage); omit only when gate is off.
 */
export function resolveRagSoftWorldPolicy(
  decisionContext: DecisionContextV0 | undefined,
  options?: { forceRequireContext?: boolean },
): { scope: RagSoftWorldScope; policy: RealityPolicyEvaluateResult } {
  const requireCtx =
    options?.forceRequireContext ?? isRagRealityPolicyGateActive();

  if (requireCtx && !decisionContext) {
    return { scope: 'blocked', policy: missingDecisionContextResult() };
  }

  const policy = evaluatePlanningTick(decisionContext);
  return { scope: verdictToScope(policy.verdict), policy };
}
