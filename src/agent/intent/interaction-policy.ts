/**
 * Interaction Policy Engine（P4）
 *
 * CRE / ROR 只输出缺口；是否 ASK_USER 由此统一裁决。
 * 原则：仅当「只能由用户提供 + 对当前目标不可缺 + 无法推断」时才追问。
 *
 * Phase4 / Decision State：
 * MDS takeover 时 `decisionStateDefer=true` → CONTINUE（decision_state_owns_ask）。
 * GLOBAL_PLAN 重规划缺口由 PLAN.DAY_REPLAN 接管；本文件不再为 GLOBAL_PLAN soft-suppress。
 * LOCAL_EDIT 草案 soft-suppress 仅为未进 ROUTE/PLAN MDS 的遗留安全网。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import type { RorRealitySnapshot } from '../reality-observation/reality-observation.types';
import type { UnifiedIntentDecision } from './unified-intent.types';

export const INTERACTION_OUTCOMES = [
  'ANSWER_NOW',
  'FETCH_THEN_ANSWER',
  'ANSWER_WITH_LIMITS',
  'CREATE_DRAFT',
  'ASK_ONE_CRITICAL',
  'BLOCK_FOR_SAFETY',
  'CONTINUE',
] as const;

export type InteractionOutcome = (typeof INTERACTION_OUTCOMES)[number];

export type InteractionPolicyDecision = {
  schema: 'tripnara.interaction_policy@v1';
  outcome: InteractionOutcome;
  reason: string;
  /** 允许追问时最多带一个关键问题 */
  askQuestion?: string;
  askKeys?: string[];
  suppressedAskKeys?: string[];
};

const SYSTEM_FETCHABLE_KEYS = new Set([
  'weather.forecast',
  'roadConditions',
  'routeTravelTimes',
  'route.travelTimeMatrix',
  'targetDay.activities',
  'trip.remainingDays',
  'booking.availability',
  'booking.fixedCommitments',
  'experience.product',
]);

/**
 * CONSULT/ASSESS：MDS 已接管体能/疲劳/成员能力（RISK.PACE_ASSESS / ACTIVITY.*），
 * 此处不再 soft-suppress 这些键；节奏偏好等只读降级仍保留。
 */
const CONSULT_SOFT_SUPPRESS_RE =
  /pacePreference|acceptableArrival|diningPreferences|partySize|booking\.fixed|travelTime|(?:^|\.)pace$/i;

/**
 * LOCAL_EDIT 草案安全网（仅未进 ROUTE / PLAN MDS 的本地编辑）。
 * 路线优化 → ROUTE.DAY_ORDER_OPTIMIZE；重规划 → PLAN.DAY_REPLAN。
 * 此处只保留「加活动/换项」类草案仍可能碰到的缺口键。
 */
const LOCAL_EDIT_DRAFT_SOFT_SUPPRESS_RE =
  /booking\.fixed|memberCapability|travelTime|fatigue|physicalIntensity/i;

/** 可系统查询 / 可有限回答的缺口，不因咨询/影响判定而阻断 */
function isSoftSuppressibleGap(key: string, intent: UnifiedIntentDecision): boolean {
  if (SYSTEM_FETCHABLE_KEYS.has(key)) return true;
  if (intent.semanticIntent === 'CONSULT' || intent.semanticIntent === 'ASSESS_IMPACT') {
    if (CONSULT_SOFT_SUPPRESS_RE.test(key)) {
      return true;
    }
  }
  if (intent.semanticIntent === 'LOCAL_EDIT') {
    if (LOCAL_EDIT_DRAFT_SOFT_SUPPRESS_RE.test(key)) {
      return true;
    }
  }
  return false;
}

/**
 * CRE ASK_USER 裁决。
 * @param decisionStateDefer MDS takeover 已接管 ASK 时直接 CONTINUE（不再 soft-suppress 拼特例）。
 */
export function resolveCreInteractionPolicy(input: {
  intent: UnifiedIntentDecision;
  plan: ContextRequirementPlan;
  /** Decision State 已拥有 ASK 权（OBSERVE_ONLY / ASK_FROM_READINESS） */
  decisionStateDefer?: boolean;
}): InteractionPolicyDecision {
  const { intent, plan } = input;
  if (input.decisionStateDefer) {
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'decision_state_owns_ask',
      suppressedAskKeys: (plan.blockingGaps ?? []).map((g) => g.key),
    };
  }
  const blocking = plan.blockingGaps ?? [];
  if (!blocking.length && plan.nextAction !== 'ASK_USER') {
    if (plan.nextAction === 'FETCH_CONTEXT') {
      return {
        schema: 'tripnara.interaction_policy@v1',
        outcome: 'FETCH_THEN_ANSWER',
        reason: 'cre_fetchable_context',
      };
    }
    if (intent.semanticIntent === 'LOCAL_EDIT' || intent.semanticIntent === 'GLOBAL_PLAN') {
      return {
        schema: 'tripnara.interaction_policy@v1',
        outcome: 'CREATE_DRAFT',
        reason: 'cre_ready_for_draft',
      };
    }
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'cre_no_ask',
    };
  }

  const critical: typeof blocking = [];
  const suppressed: string[] = [];
  for (const g of blocking) {
    if (isSoftSuppressibleGap(g.key, intent)) {
      suppressed.push(g.key);
      continue;
    }
    /** USER_REQUIRED 且合同标 blocking 才可能追问 */
    if (g.status === 'USER_REQUIRED' || g.status === 'BLOCKING') {
      critical.push(g);
    } else {
      suppressed.push(g.key);
    }
  }

  if (!critical.length) {
    if (intent.semanticIntent === 'CONSULT' || intent.semanticIntent === 'ASSESS_IMPACT') {
      return {
        schema: 'tripnara.interaction_policy@v1',
        outcome: 'ANSWER_WITH_LIMITS',
        reason: 'cre_soft_gaps_answer_with_limits',
        suppressedAskKeys: suppressed,
      };
    }
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'cre_blocking_suppressed',
      suppressedAskKeys: suppressed,
    };
  }

  /** 安全类硬阻断 */
  if (
    intent.semanticIntent === 'ASSESS_IMPACT' &&
    critical.some((g) => /road|vehicle|risk/i.test(g.key))
  ) {
    const top = critical[0];
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'ASK_ONE_CRITICAL',
      reason: 'cre_safety_critical_user_gap',
      askQuestion: plan.userQuestions?.[0] ?? `还需要确认：${top.key}？`,
      askKeys: [top.key],
      suppressedAskKeys: suppressed,
    };
  }

  /** LOCAL_EDIT 缺目标日等真正不可推断的用户缺口 */
  if (intent.semanticIntent === 'LOCAL_EDIT' || intent.semanticIntent === 'GLOBAL_PLAN') {
    const top = critical[0];
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'ASK_ONE_CRITICAL',
      reason: 'cre_draft_missing_user_anchor',
      askQuestion: plan.userQuestions?.[0] ?? `还需要确认：${top.key}？`,
      askKeys: [top.key],
      suppressedAskKeys: suppressed,
    };
  }

  /** CONSULT：默认有限回答，不追问 */
  return {
    schema: 'tripnara.interaction_policy@v1',
    outcome: 'ANSWER_WITH_LIMITS',
    reason: 'cre_consult_prefer_answer_over_ask',
    suppressedAskKeys: [...suppressed, ...critical.map((g) => g.key)],
  };
}

/**
 * ROR ASK_USER 裁决。
 * @param decisionStateDefer MDS takeover 已接管时直接 CONTINUE。
 */
export function resolveRorInteractionPolicy(input: {
  intent: UnifiedIntentDecision;
  snapshot: RorRealitySnapshot;
  decisionStateDefer?: boolean;
}): InteractionPolicyDecision {
  const { intent, snapshot } = input;
  if (input.decisionStateDefer) {
    const askKeys = (snapshot.unknowns ?? [])
      .filter((u) => u.mustAskUser)
      .map((u) => u.key);
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'decision_state_owns_ask',
      suppressedAskKeys: askKeys,
    };
  }
  const asks = (snapshot.unknowns ?? []).filter((u) => u.mustAskUser);
  if (!asks.length && snapshot.nextActionAfterFreeze !== 'ASK_USER') {
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'ror_no_ask',
    };
  }

  const suppressed: string[] = [];
  const critical = asks.filter((u) => {
    if (isSoftSuppressibleGap(u.key, intent)) {
      suppressed.push(u.key);
      return false;
    }
    /** 节奏/疲劳/体能类对 CONSULT/ASSESS 不阻断（MDS 未命中时的只读降级） */
    if (
      (intent.semanticIntent === 'CONSULT' || intent.semanticIntent === 'ASSESS_IMPACT') &&
      /pace|fatigue|arrival|preference|memberCapability|fitness|physicalIntensity/i.test(
        u.key,
      )
    ) {
      suppressed.push(u.key);
      return false;
    }
    return true;
  });

  if (!critical.length) {
    if (intent.semanticIntent === 'CONSULT' || intent.semanticIntent === 'ASSESS_IMPACT') {
      return {
        schema: 'tripnara.interaction_policy@v1',
        outcome: 'ANSWER_WITH_LIMITS',
        reason: 'ror_soft_continue_readonly',
        suppressedAskKeys: suppressed,
      };
    }
    /** LOCAL_EDIT / GLOBAL：缺口可软继续生成草案 */
    return {
      schema: 'tripnara.interaction_policy@v1',
      outcome: 'CONTINUE',
      reason: 'ror_soft_continue_draft',
      suppressedAskKeys: suppressed,
    };
  }

  const top = critical[0];
  return {
    schema: 'tripnara.interaction_policy@v1',
    outcome: 'ASK_ONE_CRITICAL',
    reason: 'ror_user_owned_blocking_gap',
    askQuestion: top.question,
    askKeys: [top.key],
    suppressedAskKeys: suppressed,
  };
}

export function interactionPolicyShouldShortCircuitAsk(
  decision: InteractionPolicyDecision,
): boolean {
  return (
    decision.outcome === 'ASK_ONE_CRITICAL' || decision.outcome === 'BLOCK_FOR_SAFETY'
  );
}
