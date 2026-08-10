/**
 * Execution Route Selector（P2–P4 现网接管）。
 *
 * CONSULT / ASSESS_IMPACT / LOCAL_EDIT / GLOBAL_PLAN 在置信度足够时覆盖旧惯性。
 */

import { resolveUnifiedIntent } from './unified-intent.resolver';
import type { UnifiedIntentDecision } from './unified-intent.types';
import type { CreOperation } from '../context-requirement/operation.types';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';

const LIVE_TAKEOVER_MIN_CONFIDENCE = 0.75;

export type LiveRouteTakeover =
  | {
      kind: 'CONSULT';
      orchestrateMode: 'LIGHTWEIGHT';
      reason: string;
      decision: UnifiedIntentDecision;
    }
  | {
      kind: 'ASSESS_IMPACT';
      orchestrateMode: 'PLANNING_STATE_MACHINE';
      reason: string;
      decision: UnifiedIntentDecision;
    }
  | {
      kind: 'LOCAL_EDIT';
      orchestrateMode: 'PLANNING_STATE_MACHINE';
      smEntry: 'bound_trip_itinerary_adjust';
      reason: string;
      decision: UnifiedIntentDecision;
      creOperation: CreOperation;
    }
  | {
      kind: 'GLOBAL_PLAN';
      orchestrateMode: 'PLANNING_STATE_MACHINE';
      smEntry: 'bound_trip_planning';
      reason: string;
      decision: UnifiedIntentDecision;
      creOperation: 'OPTIMIZE_TRIP' | 'REPLAN_DUE_TO_RISK';
    };

/** @deprecated 使用 LiveRouteTakeover */
export type ReadOnlyRouteTakeover = Extract<
  LiveRouteTakeover,
  { kind: 'CONSULT' | 'ASSESS_IMPACT' }
>;

export function isReadOnlyUnifiedIntent(decision: UnifiedIntentDecision): boolean {
  return (
    decision.mutationPolicy === 'READ_ONLY' &&
    (decision.semanticIntent === 'CONSULT' ||
      decision.semanticIntent === 'ASSESS_IMPACT')
  );
}

/**
 * P3：局部修改话术 → CRE 操作（禁 OPTIMIZE_TRIP）。
 * 「优化第 N 天路线」须为 OPTIMIZE_DAY，勿默认 ADD_ACTIVITY_TO_DAY（否则缺 experience 硬阻断）。
 */
export function mapLocalEditMessageToCreOperation(message: string): CreOperation {
  const m = String(message ?? '');
  /** 住宿域换店优先于泛「换成/替换→REPLACE_ACTIVITY」，避免误成换景点 */
  if (
    /换酒店|换住宿|改住宿|换一个.{0,48}(?:酒店|住宿|民宿)|换成.{0,48}(?:酒店|住宿|民宿)|替换.{0,48}(?:酒店|住宿|民宿)|(?:酒店|住宿|民宿).{0,16}(?:换成|换掉|换一个|替换)|酒店选择|住宿选择|change\s*hotel|change\s*accommodation|swap\s*hotel|replace.{0,24}hotel/i.test(
      m,
    )
  ) {
    return 'CHANGE_ACCOMMODATION';
  }
  if (/换成|替换|替代|replace/i.test(m)) {
    return 'REPLACE_ACTIVITY';
  }
  if (/移动到|挪到|移到|move\s*to/i.test(m)) {
    return 'MOVE_ACTIVITY';
  }
  if (
    /优化.{0,24}(?:第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|Day\s*\d+|路线|顺序|交通)|(?:路线|顺序|交通时间).{0,16}(?:优化|调整|重排)|重新排.{0,12}天|optimize\s*(?:day|route|order)|reorder/i.test(
      m,
    )
  ) {
    return 'OPTIMIZE_DAY';
  }
  if (/加到|加入|安排到|排到|加上|增加|新增|安排(?:一个|午餐|晚饭|晚餐|早餐|活动)|增加.{0,12}活动|add\s*to\s*day|schedule\s*on/i.test(m)) {
    return 'ADD_ACTIVITY_TO_DAY';
  }
  /** 有明确日锚但无加/换/移动词时，单日局部改稿默认按日优化，避免误要「加景点」 */
  if (/第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|\bDay\s*\d+\b/i.test(m)) {
    return 'OPTIMIZE_DAY';
  }
  return 'ADD_ACTIVITY_TO_DAY';
}

export function tryReadOnlyRouteTakeover(
  decision: UnifiedIntentDecision,
): ReadOnlyRouteTakeover | null {
  if (!isReadOnlyUnifiedIntent(decision)) return null;
  if (decision.confidence < LIVE_TAKEOVER_MIN_CONFIDENCE) return null;

  if (decision.semanticIntent === 'CONSULT') {
    return {
      kind: 'CONSULT',
      orchestrateMode: 'LIGHTWEIGHT',
      reason: 'unified_intent_consult_readonly_takeover',
      decision,
    };
  }

  return {
    kind: 'ASSESS_IMPACT',
    orchestrateMode: 'PLANNING_STATE_MACHINE',
    reason: 'unified_intent_assess_impact_takeover',
    decision,
  };
}

export function tryLocalEditRouteTakeover(
  decision: UnifiedIntentDecision,
  message?: string,
): Extract<LiveRouteTakeover, { kind: 'LOCAL_EDIT' }> | null {
  if (decision.semanticIntent !== 'LOCAL_EDIT') return null;
  if (decision.mutationPolicy === 'READ_ONLY') return null;
  if (decision.confidence < LIVE_TAKEOVER_MIN_CONFIDENCE) return null;
  /** 「替换上的酒店选择」等是库存检索，勿进 SM/ROR 换活动追问 */
  if (isHotelInventorySearchQuery(String(message ?? ''))) return null;

  return {
    kind: 'LOCAL_EDIT',
    orchestrateMode: 'PLANNING_STATE_MACHINE',
    smEntry: 'bound_trip_itinerary_adjust',
    reason: 'unified_intent_local_edit_takeover',
    decision,
    creOperation: mapLocalEditMessageToCreOperation(message ?? ''),
  };
}

/**
 * P4：GLOBAL_PLAN 接管 — 仅绑定 trip 时接管 bound_trip_planning / OPTIMIZE_TRIP。
 * 无 trip 的新建行程交给下游 new_trip_with_country（保留 countryCode 抽取）。
 */
export function tryGlobalPlanRouteTakeover(
  decision: UnifiedIntentDecision,
  input?: { tripId?: string | null; message?: string },
): Extract<LiveRouteTakeover, { kind: 'GLOBAL_PLAN' }> | null {
  if (decision.semanticIntent !== 'GLOBAL_PLAN') return null;
  if (decision.mutationPolicy === 'READ_ONLY') return null;
  if (decision.confidence < LIVE_TAKEOVER_MIN_CONFIDENCE) return null;

  const hasTrip = Boolean(input?.tripId?.trim());
  if (!hasTrip) return null;

  const msg = input?.message ?? '';
  const riskReplan = /风暴|封路|重排|plan\s*b|因风险/i.test(msg);

  return {
    kind: 'GLOBAL_PLAN',
    orchestrateMode: 'PLANNING_STATE_MACHINE',
    smEntry: 'bound_trip_planning',
    reason: 'unified_intent_global_plan_takeover',
    decision,
    creOperation: riskReplan ? 'REPLAN_DUE_TO_RISK' : 'OPTIMIZE_TRIP',
  };
}

/** P2–P4 现网接管入口 */
export function tryLiveRouteTakeover(
  decision: UnifiedIntentDecision,
  message?: string,
  tripId?: string | null,
): LiveRouteTakeover | null {
  return (
    tryReadOnlyRouteTakeover(decision) ??
    tryLocalEditRouteTakeover(decision, message) ??
    tryGlobalPlanRouteTakeover(decision, { tripId, message })
  );
}

export function resolveReadOnlyRouteTakeover(input: {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
}): ReadOnlyRouteTakeover | null {
  const decision = resolveUnifiedIntent({
    message: input.message,
    tripId: input.tripId,
    entryPoint: input.entryPoint,
  });
  return tryReadOnlyRouteTakeover(decision);
}

export function resolveLiveRouteTakeover(input: {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
}): LiveRouteTakeover | null {
  const decision = resolveUnifiedIntent({
    message: input.message,
    tripId: input.tripId,
    entryPoint: input.entryPoint,
  });
  return tryLiveRouteTakeover(decision, input.message, input.tripId);
}

export function shouldBypassModeLockForUnifiedIntent(
  decision: UnifiedIntentDecision | null | undefined,
): boolean {
  if (!decision) return false;
  return tryReadOnlyRouteTakeover(decision) != null;
}
