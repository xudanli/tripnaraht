/**
 * Lodging Decision Readiness
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

export function evaluateLodgingDecisionReadiness(
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
    if (presence === 'IGNORED' || presence === 'PRESENT') {
      if (decl.key === 'lodging_coverage' && presence === 'PRESENT') {
        const missing = (st?.value as { missingDayNumbers?: number[] } | undefined)
          ?.missingDayNumbers;
        if (Array.isArray(missing) && missing.length === 0) {
          warningsZh.push('全员夜次均已覆盖住宿');
        }
      }
      if (
        decl.key === 'booking_channel' &&
        (st?.value as { mode?: string } | undefined)?.mode === 'CATALOG'
      ) {
        catalogFallback = true;
        warningsZh.push('住宿检索降级');
      }
      continue;
    }
    if (presence === 'PARTIAL') {
      uncertainKeys.push(decl.key);
      continue;
    }
    if (presence === 'UNKNOWN') {
      uncertainKeys.push(decl.key);
      if (
        decl.acquisition === 'LOAD_TRIP_LODGING_SLICE' ||
        decl.missingPolicy === 'DEGRADE'
      ) {
        needsFetch = true;
      }
      continue;
    }
    // MISSING
    missingKeys.push(decl.key);
    if (decl.missingPolicy === 'ASK_USER') {
      askCandidates.push({ key: decl.key, priority: decl.priority });
      if (decl.necessity === 'REQUIRED') blockingKeys.push(decl.key);
    } else if (decl.missingPolicy === 'CATALOG_FALLBACK') {
      catalogFallback = true;
    } else if (decl.missingPolicy === 'ALLOW_WITH_UNKNOWN') {
      uncertainKeys.push(decl.key);
    } else if (decl.missingPolicy === 'DEGRADE') {
      needsFetch = true;
      uncertainKeys.push(decl.key);
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

  if (needsFetch) {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: 'DEGRADED',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction: 'FETCH',
      reasonCode: 'FETCH_LODGING_SLICE',
      askUserKeys: [],
      warningsZh: [...warningsZh, '需加载行程住宿覆盖切片'],
    };
  }

  if (catalogFallback) {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: 'READY_WITH_WARNING',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction: 'SHOW_CARD',
      reasonCode: 'LODGING_CATALOG_OR_LIVE',
      askUserKeys: [],
      warningsZh,
    };
  }

  if (contract.decisionClass === 'LODGING.INVENTORY_SEARCH') {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: uncertainKeys.length ? 'READY_WITH_WARNING' : 'READY',
      missingKeys,
      uncertainKeys,
      blockingKeys,
      nextAction: 'SHOW_CARD',
      reasonCode: 'READY_INVENTORY',
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
