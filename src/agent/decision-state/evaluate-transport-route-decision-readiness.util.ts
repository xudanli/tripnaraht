/**
 * Transport / Route Decision Readiness
 */

import type {
  ContractKeyDeclaration,
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

function keyApplies(
  decl: ContractKeyDeclaration,
  projection: DecisionStateProjection,
): boolean {
  if (decl.necessity !== 'CONDITIONAL') return true;
  if (decl.when === 'mentions_froad_or_highland') {
    const road = projection.keys.find((k) => k.key === 'road_access');
    return road?.presence === 'PRESENT';
  }
  return true;
}

export function evaluateTransportRouteDecisionReadiness(
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

  for (const decl of contract.keys) {
    if (!keyApplies(decl, projection)) continue;
    const st = map.get(decl.key);
    const presence = st?.presence ?? 'MISSING';
    if (presence === 'PRESENT' || presence === 'IGNORED') continue;
    if (presence === 'PARTIAL' || presence === 'UNKNOWN') {
      uncertainKeys.push(decl.key);
      if (decl.missingPolicy === 'DEGRADE') needsFetch = true;
      continue;
    }
    missingKeys.push(decl.key);
    if (decl.missingPolicy === 'ASK_USER') {
      askCandidates.push({ key: decl.key, priority: decl.priority });
      if (decl.necessity === 'REQUIRED') blockingKeys.push(decl.key);
    } else if (decl.missingPolicy === 'DEGRADE') {
      needsFetch = true;
      uncertainKeys.push(decl.key);
    } else if (decl.missingPolicy === 'ALLOW_WITH_UNKNOWN') {
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
      reasonCode: 'FETCH_TRANSPORT_OR_ROUTE',
      askUserKeys: [],
      warningsZh: [...warningsZh, '需补齐交通/路线上下文'],
    };
  }

  const nextAction =
    contract.decisionClass === 'ROUTE.DAY_ORDER_OPTIMIZE' ? 'ANSWER' : 'ANSWER';

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    readiness: uncertainKeys.length ? 'READY_WITH_WARNING' : 'READY',
    missingKeys,
    uncertainKeys,
    blockingKeys,
    nextAction,
    reasonCode: 'READY',
    askUserKeys: [],
    warningsZh,
  };
}
