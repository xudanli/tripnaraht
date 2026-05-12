import type { DecisionFactor } from '../decision-awareness.types';
import type { DecisionImpact } from '../decision-awareness.types';

/**
 * 由 WEATHER DecisionFactor 派生示意性 ROUTE_CHANGE（未接真实改线引擎）。
 */
export function routeImpactsFromWindDecisionFactors(
  factors: DecisionFactor[],
  /** Decision context：当前为国家码会话；后续可换 sessionId/tripId */
  decisionContextTarget: string,
): DecisionImpact[] {
  const warn = factors.find((f) => f.factorType === 'WEATHER' && f.effect === 'WARNING');
  if (!warn) return [];

  return [
    {
      impactType: 'ROUTE_CHANGE',
      target: decisionContextTarget,
      level: 'MEDIUM',
      reason:
        '强风环境下，在相同偏好下宜优先考虑更低风险暴露的路线方向或节奏调整（示意；未触发真实改线）。',
      derivedFromFactIds: warn.derivedFromFactIds,
    },
  ];
}
