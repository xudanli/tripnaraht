/**
 * Project TravelCausalDecision → stable product BFF view.
 */

import { projectCausalDecisionCard } from '../projectors/causal-decision-card.projector';
import type { TravelCausalDecision } from '../types/travel-causal-decision.types';
import type {
  CausalDecisionLifecycleStatus,
  CausalDecisionProductView,
} from './causal-decision-product.types';
import { CAUSAL_DECISION_PRODUCT_SCHEMA } from './causal-decision-product.types';

function formatActByLabel(deadline?: string): string | undefined {
  if (!deadline) return undefined;
  try {
    const d = new Date(deadline);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `最晚需要在 ${hh}:${mm} 前决定`;
  } catch {
    return `最晚需要在 ${deadline} 前决定`;
  }
}

export function resolveLifecycleStatus(
  decision: TravelCausalDecision,
): CausalDecisionLifecycleStatus {
  const rec = decision.outcome?.reconciliation;
  if (rec === 'CONFIRMED' || rec === 'PARTIAL' || rec === 'DISPROVED') {
    return 'RECONCILED';
  }
  if (rec === 'UNOBSERVABLE') return 'AWAITING_OBSERVATION';
  if (decision.outcome?.selectedOptionId) {
    // PENDING after select (pre-apply) is still SELECTED; apply path overrides via resolution store.
    return 'SELECTED';
  }
  return 'OPEN';
}

export function buildStatusMessage(
  status: CausalDecisionLifecycleStatus,
  decision: TravelCausalDecision,
): string | undefined {
  const outcome = decision.outcome;
  switch (status) {
    case 'OPEN':
      return undefined;
    case 'SELECTED':
      return '方案已选择，待应用';
    case 'APPLIED':
    case 'AWAITING_OBSERVATION':
      return '方案已应用，等待实际到达或签到结果';
    case 'RECONCILED': {
      if (outcome?.reconciliation === 'CONFIRMED') {
        const arrival = outcome.actualOutcome?.arrivalTime;
        return arrival
          ? `结果已确认。实际于 ${arrival} 到达`
          : '结果已确认';
      }
      if (outcome?.reconciliation === 'PARTIAL') {
        return `结果部分确认。${outcome.explanation ?? ''}`.trim();
      }
      if (outcome?.reconciliation === 'DISPROVED') {
        return `结果与预测不符。${outcome.explanation ?? ''}`.trim();
      }
      return outcome?.explanation;
    }
    case 'STALE':
      return '上下文已变化，请重新评估';
    default:
      return undefined;
  }
}

export function toCausalDecisionProductView(input: {
  decision: TravelCausalDecision;
  problemId: string;
  lifecycleOverride?: CausalDecisionLifecycleStatus;
}): CausalDecisionProductView {
  const { decision, problemId } = input;
  const card = projectCausalDecisionCard(decision);
  const lifecycleStatus = input.lifecycleOverride ?? resolveLifecycleStatus(decision);
  const deadline = decision.temporalForecast.interventionDeadline;

  return {
    schema: CAUSAL_DECISION_PRODUCT_SCHEMA,
    decisionId: decision.decisionId,
    tripId: decision.tripId,
    problemId,
    headline: decision.observationSummary,
    actByLabel: formatActByLabel(deadline),
    interventionDeadline: deadline,
    card,
    decision,
    lifecycleStatus,
    outcome: decision.outcome,
    statusMessage: buildStatusMessage(lifecycleStatus, decision),
    contextHash: decision.contextHash,
    ruleVersion: decision.ruleVersion,
    modelVersion: decision.modelVersion,
    worldStateVersion: decision.worldStateVersion,
    canonicalTraceId: decision.canonicalTraceId,
    ledgerRef: decision.ledgerRef,
    generatedAt: new Date().toISOString(),
  };
}

/** decisionId may be `dec_<problemId>` or raw problemId */
export function resolveProblemIdFromDecisionId(decisionId: string): string {
  if (decisionId.startsWith('dec_')) return decisionId.slice(4);
  return decisionId;
}
