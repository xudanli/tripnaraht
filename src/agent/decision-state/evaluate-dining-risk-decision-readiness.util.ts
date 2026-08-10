/**
 * Dining / Risk Decision Readiness
 */

import type {
  DecisionReadinessResult,
  DecisionStateContract,
  DecisionStateProjection,
  GapPriority,
  StateKey,
} from './decision-state.types';

const PRIORITY_RANK: Record<GapPriority, number> = {
  P0_SEMANTIC_ANCHOR: 0,
  P1_HARD_SAFETY: 1,
  P2_USER_REQUIRED: 2,
  P3_EXTERNAL: 3,
  P4_OPTIONAL: 4,
};

export function evaluateDiningRiskDecisionReadiness(
  contract: DecisionStateContract,
  projection: DecisionStateProjection,
): DecisionReadinessResult {
  const map = new Map(projection.keys.map((k) => [k.key, k]));
  const missingKeys: StateKey[] = [];
  const uncertainKeys: StateKey[] = [];
  const blockingKeys: StateKey[] = [];
  const askCandidates: Array<{ key: StateKey; priority: GapPriority }> = [];
  const warningsZh: string[] = [];
  let needsFetch = false;
  let catalogFallback = false;

  for (const decl of contract.keys) {
    const st = map.get(decl.key);
    const presence = st?.presence ?? 'MISSING';
    if (presence === 'PRESENT' || presence === 'IGNORED') {
      if (
        decl.key === 'restaurant_channel' &&
        (st?.value as { mode?: string } | undefined)?.mode === 'CATALOG'
      ) {
        catalogFallback = true;
        warningsZh.push('餐厅检索降级为目录/常识');
      }
      if (
        decl.key === 'day_activity_seed' &&
        (st?.value as { count?: number } | undefined)?.count === 0
      ) {
        warningsZh.push('当日无活动种子，节奏判断宜保守');
      }
      continue;
    }
    if (presence === 'PARTIAL' || presence === 'UNKNOWN') {
      uncertainKeys.push(decl.key);
      if (decl.missingPolicy === 'DEGRADE' || decl.acquisition === 'PROVIDER_LIVE') {
        needsFetch = true;
      }
      if (decl.missingPolicy === 'CATALOG_FALLBACK') catalogFallback = true;
      continue;
    }
    missingKeys.push(decl.key);
    if (decl.missingPolicy === 'ASK_USER') {
      askCandidates.push({ key: decl.key, priority: decl.priority });
      if (decl.necessity === 'REQUIRED') blockingKeys.push(decl.key);
    } else if (decl.missingPolicy === 'DEGRADE') {
      needsFetch = true;
      uncertainKeys.push(decl.key);
    } else if (decl.missingPolicy === 'CATALOG_FALLBACK') {
      catalogFallback = true;
    } else if (decl.missingPolicy === 'ALLOW_WITH_UNKNOWN') {
      uncertainKeys.push(decl.key);
      if (decl.key === 'dining_anchor') {
        warningsZh.push('无明确用餐锚点，仅作泛化餐饮建议');
      }
    }
  }

  askCandidates.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const askUserKeys = askCandidates.length ? [askCandidates[0].key] : [];

  if (askUserKeys.length) {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: 'NEED_USER_INPUT',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction: 'ASK_USER',
      reasonCode: `ASK_${askUserKeys[0].toUpperCase()}`,
      askUserKeys,
      warningsZh,
    };
  }

  if (needsFetch && contract.decisionClass === 'RISK.WEATHER_IMPACT') {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: 'DEGRADED',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction: 'FETCH',
      reasonCode: 'FETCH_WEATHER',
      askUserKeys: [],
      warningsZh: [...warningsZh, '需拉取天气证据后再判断影响'],
    };
  }

  if (catalogFallback || contract.decisionClass.startsWith('DINING.')) {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: warningsZh.length || uncertainKeys.length ? 'READY_WITH_WARNING' : 'READY',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction:
        contract.decisionClass === 'DINING.NEAR_POI' || catalogFallback
          ? 'SHOW_CARD'
          : 'ANSWER',
      reasonCode: catalogFallback ? 'DINING_CATALOG_FALLBACK' : 'READY',
      askUserKeys: [],
      warningsZh,
    };
  }

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    readiness: warningsZh.length ? 'READY_WITH_WARNING' : 'READY',
    missingKeys,
    uncertainKeys,
    blockingKeys,
    nextAction: 'ANSWER',
    reasonCode: 'READY',
    askUserKeys: [],
    warningsZh,
  };
}
