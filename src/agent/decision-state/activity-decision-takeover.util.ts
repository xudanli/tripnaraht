/**
 * Phase 2+：已分类决策族的 ASK_USER 由 Decision Readiness 唯一发出。
 * CRE / ROR gap → OBSERVE ONLY（不得再短路用户）。
 *
 * 开关（任一关闭即关）：
 * - DECISION_STATE_TAKEOVER（总开关，默认 1）
 * - DECISION_STATE_ACTIVITY_TAKEOVER（兼容旧名，默认跟随总开关）
 */

import type { DecisionStateShadowV1, StateKey } from './decision-state.types';

export type ActivityDecisionTakeover =
  | {
      kind: 'INACTIVE';
      reason: string;
    }
  | {
      kind: 'OBSERVE_ONLY_CONTINUE';
      reason: string;
      suppressCreAsk: true;
      suppressRorAsk: true;
      readiness: NonNullable<DecisionStateShadowV1['readiness']>;
    }
  | {
      kind: 'ASK_FROM_READINESS';
      reason: string;
      askKeys: StateKey[];
      readiness: NonNullable<DecisionStateShadowV1['readiness']>;
    }
  | {
      kind: 'BLOCK_FROM_READINESS';
      reason: string;
      readiness: NonNullable<DecisionStateShadowV1['readiness']>;
    };

/** @deprecated 使用 DecisionTakeover 语义；类型别名保持兼容 */
export type DecisionTakeover = ActivityDecisionTakeover;

const ASK_ZH: Partial<Record<StateKey, string>> = {
  day_anchor: '请确认要安排/预订的是行程中的哪一天？',
  activity_ref: '请确认具体是哪一项活动（例如冰川徒步、蓝湖）？',
  party_size: '请确认出行人数。',
  selected_slot: '请选择具体场次/时段。',
  contact_info: '请补充联系人信息。',
  payment_authorization: '确认下单与支付授权后，再继续代订。',
  team_fitness_floor: '请让未提交体能问卷的成员补齐，或确认较弱成员是否同行。',
  live_availability: '当前无法取得实时余位，请改用官网确认或稍后重试。',
  trip_binding: '请先打开或绑定具体行程后再查询。',
  trip_day_span: '当前行程缺少日程，无法扫描住宿缺口。',
  lodging_coverage: '住宿覆盖数据未就绪，请稍后重试。',
  lodging_assignment: '请确认要查询住宿的那一天。',
  vehicle_profile: '请说明车型（例如 2WD / 四驱 / SUV）。',
  road_access: '请说明要去的道路或区域（例如 F 路 / 高地）。',
  route_scope: '请确认要优化哪一天的路线顺序。',
  dining_anchor: '请说明想在哪一天或哪个区域用餐。',
  weather_evidence: '需要天气数据后才能判断对行程的影响，请稍后重试或补充目的地。',
};

function envFlagOn(name: string, defaultOn = true): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultOn;
  const t = String(raw).trim().toLowerCase();
  return t !== '0' && t !== 'false' && t !== 'off';
}

export function isActivityDecisionTakeoverEnabled(): boolean {
  return envFlagOn('DECISION_STATE_TAKEOVER', true) && envFlagOn('DECISION_STATE_ACTIVITY_TAKEOVER', true);
}

export function resolveDecisionTakeover(
  shadow: DecisionStateShadowV1 | null | undefined,
  opts?: { minConfidence?: number },
): DecisionTakeover {
  return resolveActivityDecisionTakeover(shadow, opts);
}

export function resolveActivityDecisionTakeover(
  shadow: DecisionStateShadowV1 | null | undefined,
  opts?: { minConfidence?: number },
): ActivityDecisionTakeover {
  if (!isActivityDecisionTakeoverEnabled()) {
    return { kind: 'INACTIVE', reason: 'takeover_disabled' };
  }
  if (!shadow?.classified.decisionClass || !shadow.contract || !shadow.readiness) {
    return { kind: 'INACTIVE', reason: 'not_activity_or_incomplete_shadow' };
  }
  const min = opts?.minConfidence ?? 0.7;
  if (shadow.classified.confidence < min) {
    return { kind: 'INACTIVE', reason: `confidence_below_${min}` };
  }

  const ready = shadow.readiness;
  if (ready.nextAction === 'ASK_USER') {
    return {
      kind: 'ASK_FROM_READINESS',
      reason: ready.reasonCode,
      askKeys: ready.askUserKeys.length
        ? ready.askUserKeys
        : (ready.missingKeys.slice(0, 1) as StateKey[]),
      readiness: ready,
    };
  }
  if (ready.nextAction === 'BLOCK' || ready.readiness === 'BLOCKED') {
    return {
      kind: 'BLOCK_FROM_READINESS',
      reason: ready.reasonCode,
      readiness: ready,
    };
  }
  // SHOW_CARD / ANSWER / CATALOG_FALLBACK / WARN → 继续主链；CRE/ROR 不得再 ASK
  return {
    kind: 'OBSERVE_ONLY_CONTINUE',
    reason: ready.reasonCode,
    suppressCreAsk: true,
    suppressRorAsk: true,
    readiness: ready,
  };
}

export function formatReadinessAskQuestions(askKeys: StateKey[]): string[] {
  return askKeys.map(
    (k) => ASK_ZH[k] ?? `请补充决策所需信息：${k}`,
  );
}

export function serializeActivityDecisionTakeover(
  takeover: ActivityDecisionTakeover,
): Record<string, unknown> {
  return {
    kind: takeover.kind,
    reason: takeover.reason,
    ...(takeover.kind === 'ASK_FROM_READINESS'
      ? { ask_keys: takeover.askKeys }
      : {}),
    ...(takeover.kind === 'OBSERVE_ONLY_CONTINUE'
      ? { suppress_cre_ask: true, suppress_ror_ask: true }
      : {}),
    ...(takeover.kind !== 'INACTIVE'
      ? {
          readiness: takeover.readiness.readiness,
          next_action: takeover.readiness.nextAction,
        }
      : {}),
  };
}
