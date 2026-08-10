/**
 * Decision Readiness Evaluator — 唯一有资格产出 ASK_USER 的门（Phase2 接管后强制）。
 * Phase1 Shadow：只计算，不改变现网出站。
 */

import type {
  ContractKeyDeclaration,
  DecisionNextAction,
  DecisionReadiness,
  DecisionReadinessResult,
  DecisionStateContract,
  DecisionStateProjection,
  GapPriority,
  KeyPresence,
  StateKey,
} from './decision-state.types';
import { projectedKeyMap } from './project-activity-decision-state.util';

const PRIORITY_RANK: Record<GapPriority, number> = {
  P0_SEMANTIC_ANCHOR: 0,
  P1_HARD_SAFETY: 1,
  P2_USER_REQUIRED: 2,
  P3_EXTERNAL: 3,
  P4_OPTIONAL: 4,
};

function isAbsent(p: KeyPresence): boolean {
  return p === 'MISSING' || p === 'UNKNOWN';
}

function keyApplies(
  decl: ContractKeyDeclaration,
  projection: DecisionStateProjection,
): boolean {
  if (decl.necessity !== 'CONDITIONAL') return true;
  const fit = projection.keys.find((k) => k.key === 'team_fitness_floor');
  // high_intensity 条件：投影未 IGNORED 即适用
  if (decl.when === 'activity.high_intensity') {
    return fit?.presence !== 'IGNORED';
  }
  return true;
}

export function evaluateActivityDecisionReadiness(
  contract: DecisionStateContract,
  projection: DecisionStateProjection,
): DecisionReadinessResult {
  const map = projectedKeyMap(projection);
  const missingKeys: StateKey[] = [];
  const uncertainKeys: StateKey[] = [];
  const blockingKeys: StateKey[] = [];
  const askCandidates: Array<{ key: StateKey; priority: GapPriority }> = [];
  const warningsZh: string[] = [];
  let catalogFallback = false;
  let externalUnavailable = false;
  let needConfirm = false;

  for (const decl of contract.keys) {
    if (!keyApplies(decl, projection)) continue;
    const st = map.get(decl.key);
    const presence = st?.presence ?? 'MISSING';

    if (presence === 'IGNORED') continue;

    if (presence === 'PARTIAL') {
      uncertainKeys.push(decl.key);
      if (decl.missingPolicy === 'NEED_CONFIRM' || decl.missingPolicy === 'ASK_USER') {
        needConfirm = true;
        warningsZh.push(st?.noteZh || `${decl.labelZh}不完整`);
      } else if (decl.missingPolicy === 'WARN') {
        warningsZh.push(st?.noteZh || `${decl.labelZh}不确定`);
      }
      continue;
    }

    if (!isAbsent(presence)) {
      // PRESENT：booking_channel CATALOG 仍是降级
      if (decl.key === 'booking_channel') {
        const mode = (st?.value as { mode?: string } | undefined)?.mode;
        if (mode === 'CATALOG') {
          catalogFallback = true;
          warningsZh.push('当前仅有目录通道，无法确认实时余位');
        } else if (mode === 'UNKNOWN') {
          uncertainKeys.push(decl.key);
        } else if (mode === 'UNAVAILABLE') {
          externalUnavailable = true;
          blockingKeys.push(decl.key);
        }
      }
      if (decl.key === 'day_conflict') {
        const status = (st?.value as { status?: string } | undefined)?.status;
        if (status === 'HARD') {
          blockingKeys.push(decl.key);
          warningsZh.push('日程存在硬冲突');
        } else if (status === 'SOFT') {
          warningsZh.push('日程存在软冲突');
        }
      }
      continue;
    }

    // MISSING / UNKNOWN
    missingKeys.push(decl.key);

    switch (decl.missingPolicy) {
      case 'ASK_USER':
        askCandidates.push({ key: decl.key, priority: decl.priority });
        if (decl.necessity === 'REQUIRED') blockingKeys.push(decl.key);
        break;
      case 'NEED_CONFIRM':
        needConfirm = true;
        uncertainKeys.push(decl.key);
        warningsZh.push(`需确认：${decl.labelZh}`);
        break;
      case 'CATALOG_FALLBACK':
        catalogFallback = true;
        warningsZh.push(`${decl.labelZh}不可用 → 目录回落`);
        break;
      case 'BLOCK':
        blockingKeys.push(decl.key);
        if (decl.key === 'live_availability') externalUnavailable = true;
        break;
      case 'WARN':
      case 'DEGRADE':
      case 'ALLOW_WITH_UNKNOWN':
        uncertainKeys.push(decl.key);
        warningsZh.push(`${decl.labelZh}未知（允许降级）`);
        break;
      case 'IGNORE':
        break;
      default:
        break;
    }
  }

  askCandidates.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  const askUserKeys = askCandidates.length ? [askCandidates[0].key] : [];

  let readiness: DecisionReadiness;
  let nextAction: DecisionNextAction;
  let reasonCode: string;

  // INV-01：语义锚点 ASK 优先于外部 LIVE 阻断（先问 activity_ref/day，再谈余位）
  if (askUserKeys.length && blockingKeys.some((k) => askUserKeys.includes(k))) {
    readiness = 'NEED_USER_INPUT';
    nextAction = 'ASK_USER';
    reasonCode = `ASK_${askUserKeys[0].toUpperCase()}`;
  } else if (
    // AVAILABILITY_CHECK：锚点齐备后，无 LIVE 不得声称有位
    contract.decisionClass === 'ACTIVITY.AVAILABILITY_CHECK' &&
    (map.get('live_availability')?.presence !== 'PRESENT' || externalUnavailable)
  ) {
    return {
      decisionClass: contract.decisionClass,
      contractVersion: contract.version,
      readiness: 'EXTERNAL_UNAVAILABLE',
      missingKeys,
      uncertainKeys,
      blockingKeys: [...new Set([...blockingKeys, 'live_availability' as StateKey])],
      nextAction: catalogFallback ? 'CATALOG_FALLBACK' : 'BLOCK',
      reasonCode: 'LIVE_EVIDENCE_REQUIRED',
      askUserKeys: [],
      warningsZh: [
        ...warningsZh,
        '无权威实时库存证据，不能回答「还有位置」',
      ],
    };
  } else if (blockingKeys.length && !catalogFallback) {
    readiness = externalUnavailable ? 'EXTERNAL_UNAVAILABLE' : 'BLOCKED';
    nextAction = 'BLOCK';
    reasonCode = `BLOCK_${blockingKeys[0].toUpperCase()}`;
  } else if (
    contract.decisionClass === 'ACTIVITY.RESERVATION_PREP' ||
    contract.decisionClass === 'ACTIVITY.BOOKING_GUIDANCE'
  ) {
    if (askUserKeys.length) {
      readiness = 'NEED_USER_INPUT';
      nextAction = 'ASK_USER';
      reasonCode = `ASK_${askUserKeys[0].toUpperCase()}`;
    } else if (catalogFallback || needConfirm || uncertainKeys.length || warningsZh.length) {
      readiness = 'READY_WITH_WARNING';
      nextAction =
        contract.decisionClass === 'ACTIVITY.RESERVATION_PREP'
          ? 'SHOW_CARD'
          : 'ANSWER';
      reasonCode = [
        needConfirm ? 'FITNESS_PARTIAL' : null,
        catalogFallback ? 'LIVE_NOT_REQUIRED_CATALOG' : null,
        uncertainKeys.length ? 'UNCERTAIN_KEYS' : null,
      ]
        .filter(Boolean)
        .join('+') || 'READY_WITH_WARNING';
    } else {
      readiness = 'READY';
      nextAction =
        contract.decisionClass === 'ACTIVITY.RESERVATION_PREP'
          ? 'SHOW_CARD'
          : 'ANSWER';
      reasonCode = 'READY';
    }
  } else if (contract.decisionClass === 'ACTIVITY.SUITABILITY_DECISION') {
    if (askUserKeys.length) {
      readiness = 'NEED_USER_INPUT';
      nextAction = 'ASK_USER';
      reasonCode = `ASK_${askUserKeys[0].toUpperCase()}`;
    } else if (needConfirm || uncertainKeys.length || warningsZh.length) {
      readiness = 'READY_WITH_WARNING';
      nextAction = 'ANSWER';
      reasonCode = needConfirm ? 'FITNESS_PARTIAL' : 'READY_WITH_WARNING';
    } else {
      readiness = 'READY';
      nextAction = 'ANSWER';
      reasonCode = 'READY';
    }
  } else if (contract.decisionClass === 'ACTIVITY.RESERVE') {
    readiness = 'BLOCKED';
    nextAction = 'ASK_USER';
    reasonCode = 'RESERVE_NOT_AUTOMATED';
    if (!askUserKeys.length) askUserKeys.push('payment_authorization');
  } else if (catalogFallback) {
    readiness = 'DEGRADED';
    nextAction = 'CATALOG_FALLBACK';
    reasonCode = 'CATALOG_FALLBACK';
  } else {
    readiness = 'READY';
    nextAction = 'ANSWER';
    reasonCode = 'READY';
  }

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    readiness,
    missingKeys: [...new Set(missingKeys)],
    uncertainKeys: [...new Set(uncertainKeys)],
    blockingKeys: [...new Set(blockingKeys)],
    nextAction,
    reasonCode,
    askUserKeys,
    warningsZh,
  };
}
