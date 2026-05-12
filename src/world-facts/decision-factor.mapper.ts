import type { ExplainabilityReason } from './explainability/trip-explainability.types';
import {
  impactLevelFromEffect,
  type DecisionFactor,
  type DecisionFactorActionHint,
  type DecisionFactorEffect,
  type DecisionFactorTarget,
} from './decision-awareness.types';

function legacyImpactToEffect(
  impact: ExplainabilityReason['impact'],
): DecisionFactorEffect {
  if (impact === 'WARNING') return 'WARNING';
  if (impact === 'BLOCKER') return 'BLOCK';
  return 'NONE';
}

function reasonTypeToTarget(reasonType: ExplainabilityReason['reasonType']): DecisionFactorTarget {
  switch (reasonType) {
    case 'WEATHER':
      return 'COUNTRY';
    case 'ROAD_ACCESS':
      return 'SEGMENT';
    case 'SAFETY':
    case 'TIME_WINDOW':
      return 'TRIP';
    case 'INVENTORY':
      return 'INVENTORY';
    default:
      return 'TRIP';
  }
}

function legacyActionHint(reason: ExplainabilityReason): DecisionFactorActionHint {
  if (reason.impact !== 'WARNING') return 'NONE';
  if (reason.reasonType === 'WEATHER') return 'DEGRADE_ROUTE';
  if (reason.reasonType === 'ROAD_ACCESS') return 'ADD_CAUTION';
  return 'ADD_CAUTION';
}

/**
 * @deprecated 单向映射 ExplainabilityReason → DecisionFactor；主链路已改为 Factory 直出 DecisionFactor。
 */
export function explainabilityReasonToDecisionFactor(reason: ExplainabilityReason): DecisionFactor {
  const effect = legacyImpactToEffect(reason.impact);
  const target = reasonTypeToTarget(reason.reasonType);
  return {
    factorType: reason.reasonType,
    title: reason.title,
    summary: reason.summary,
    impactLevel: impactLevelFromEffect(effect),
    derivedFromFactIds: reason.derivedFromFactIds,
    confidence: reason.confidence,
    effect,
    target,
    actionHint: legacyActionHint(reason),
  };
}

export function explainabilityReasonsToDecisionFactors(reasons: ExplainabilityReason[]): DecisionFactor[] {
  return reasons.map(explainabilityReasonToDecisionFactor);
}
