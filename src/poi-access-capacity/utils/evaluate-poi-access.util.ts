/**
 * POI Access & Capacity Engine — 纯函数评估器（无 DB 依赖，便于单测）
 */

import { DateTime } from 'luxon';
import type {
  AccessCapacityEvaluationInput,
  AccessCapacityEvaluationResult,
  AccessCapacityPlanB,
  PoiAccessRule,
  PoiAccessTargetResource,
  PoiCapacitySnapshot,
  PoiCrowdingSnapshot,
} from '../interfaces/poi-access-capacity.interface';
import { mergeAccessRulesWithOverrides } from './merge-access-rules.util';
import { inferCrowdingFromCapacitySnapshots } from './infer-crowding-from-capacity.util';
import { inferCrowdingFromProfile } from '../fixtures/is-c-tier.crowding-profiles';
import { isIcelandCrowdingProfilePoi } from '../fixtures/iceland-poi-registry';
import { appendAlternativePlanB } from '../fixtures/iceland-poi-alternatives';

const DEFAULT_STALE_RULE_DAYS = 14;
const HIGH_WAIT_P50_MIN = 20;

function parseArrivalMinutes(arrivalTime: string | null | undefined): number | undefined {
  if (arrivalTime == null || typeof arrivalTime !== 'string') return undefined;
  const trimmed = arrivalTime.trim();
  if (!trimmed) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseDailyMinutes(hhmm?: string): number | undefined {
  if (!hhmm) return undefined;
  return parseArrivalMinutes(hhmm);
}

function isDateInRange(dateISO: string, from?: string, to?: string): boolean {
  const d = dateISO.slice(0, 10);
  if (from && d < from.slice(0, 10)) return false;
  if (to && d > to.slice(0, 10)) return false;
  return true;
}

function isTimeInDailyWindow(
  arrivalMin: number,
  start?: string,
  end?: string,
): boolean {
  const startMin = parseDailyMinutes(start);
  const endMin = parseDailyMinutes(end);
  if (startMin == null || endMin == null) return true;
  return arrivalMin >= startMin && arrivalMin <= endMin;
}

function isRuleApplicable(
  rule: PoiAccessRule,
  dateISO: string,
  arrivalMin: number,
): boolean {
  if (rule.status === 'INACTIVE') return false;
  if (!isDateInRange(dateISO, rule.validFrom, rule.validTo)) return false;
  return isTimeInDailyWindow(arrivalMin, rule.dailyStartTime, rule.dailyEndTime);
}

function isRuleStale(rule: PoiAccessRule, staleDays: number): boolean {
  const verified = DateTime.fromISO(rule.lastVerifiedAt, { zone: 'utc' });
  if (!verified.isValid) return true;
  return DateTime.utc().diff(verified, 'days').days > staleDays;
}

function hasUserReservation(
  input: AccessCapacityEvaluationInput,
  resource: PoiAccessTargetResource,
): boolean {
  return (input.userReservations ?? []).some(
    (r) =>
      r.resource === resource &&
      r.dateISO.slice(0, 10) === input.dateISO.slice(0, 10),
  );
}

function findCapacityForSlot(
  snapshots: PoiCapacitySnapshot[] | undefined,
  dateISO: string,
  arrivalMin: number,
): PoiCapacitySnapshot | undefined {
  if (!snapshots?.length) return undefined;
  const daySnaps = snapshots.filter((s) => s.dateISO.slice(0, 10) === dateISO.slice(0, 10));
  if (!daySnaps.length) return undefined;

  for (const snap of daySnaps) {
    const start = parseDailyMinutes(snap.slotStartTime);
    const end = parseDailyMinutes(snap.slotEndTime);
    if (start != null && end != null) {
      if (arrivalMin >= start && arrivalMin < end) return snap;
    }
  }
  return daySnaps.find((s) => !s.slotStartTime) ?? daySnaps[0];
}

function buildReservationPlanB(
  rule: PoiAccessRule,
  input: AccessCapacityEvaluationInput,
): AccessCapacityPlanB[] {
  const plans: AccessCapacityPlanB[] = [];
  if (rule.sourceUrl) {
    plans.push({
      action: 'BOOK_NOW',
      detail: `前往官方预订：${rule.sourceUrl}`,
    });
  }
  if (rule.dailyStartTime) {
    plans.push({
      action: 'SHIFT_ARRIVAL',
      detail: `改在 ${rule.dailyStartTime} 前到达，可避开预约时段`,
      suggestedArrivalTime: rule.dailyStartTime,
    });
  } else {
    plans.push({
      action: 'CHANGE_DATE',
      detail: '更换出行日期或改选相邻时段',
    });
  }
  if (rule.targetResource === 'PARKING' && rule.poiId === 'is.landmannalaugar') {
    plans.push({
      action: 'USE_ALTERNATIVE',
      detail: '改乘高地巴士（Landmannalaugar 巴士线）可无需自驾停车预约',
      alternativePoiId: 'is.landmannalaugar.bus',
    });
  }
  return appendAlternativePlanB(input.poiId, plans);
}

function evaluateBlockingRules(
  input: AccessCapacityEvaluationInput,
  applicable: PoiAccessRule[],
  arrivalMin: number,
): AccessCapacityEvaluationResult | undefined {
  const staleDays = input.staleRuleDays ?? DEFAULT_STALE_RULE_DAYS;

  for (const rule of applicable) {
    if (rule.status === 'PENDING_CONFIRMATION') {
      return {
        verdict: 'NEEDS_CONFIRMATION',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：${rule.notes ?? '准入规则待当年官方确认'}`,
        confidence: rule.confidence,
        signalSources: [],
        planB: [{ action: 'BOOK_NOW', detail: '出发前查阅官方最新公告' }],
        blockingRuleIds: [rule.id],
      };
    }

    if (isRuleStale(rule, staleDays) && rule.confidence === 'OFFICIAL') {
      return {
        verdict: 'NEEDS_CONFIRMATION',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：官方规则已超过 ${staleDays} 天未核验`,
        confidence: rule.confidence,
        signalSources: [],
        planB: [{ action: 'BOOK_NOW', detail: rule.sourceUrl ?? '查阅官方来源确认当前状态' }],
        blockingRuleIds: [rule.id],
      };
    }
  }

  for (const rule of applicable) {
    if (rule.ruleType === 'CLOSED' || rule.ruleType === 'SEASONAL_CLOSURE') {
      return {
        verdict: 'BLOCKED',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：${rule.notes ?? '当前时段关闭'}`,
        confidence: rule.confidence,
        signalSources: [],
        planB: appendAlternativePlanB(input.poiId, [
          { action: 'CHANGE_DATE', detail: '更换日期或改选开放中的替代景点' },
        ]),
        blockingRuleIds: [rule.id],
      };
    }

    if (
      rule.ruleType === 'TRAIL_RESTRICTION' ||
      (rule.ruleType === 'SAFETY_RESTRICTION' && (rule.enforcement ?? 'HARD') === 'HARD')
    ) {
      return {
        verdict: 'BLOCKED',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：${rule.notes ?? '步道/安全限制生效'}`,
        confidence: rule.confidence,
        signalSources: [],
        planB: appendAlternativePlanB(input.poiId, [
          { action: 'USE_ALTERNATIVE', detail: '选择官方开放的替代步道或观景点' },
        ]),
        blockingRuleIds: [rule.id],
      };
    }

    if (rule.ruleType === 'VEHICLE_RESTRICTION' && input.vehicleType) {
      const allowed = rule.applicableVehicleTypes ?? [];
      if (allowed.length && !allowed.includes(input.vehicleType)) {
        return {
          verdict: 'BLOCKED',
          poiId: input.poiId,
          bottleneckResource: rule.targetResource,
          bottleneckRuleType: rule.ruleType,
          reason: `${input.poiName ?? input.poiId}：当前车型 ${input.vehicleType} 不符合要求（允许：${allowed.join(', ')}）`,
          confidence: rule.confidence,
          signalSources: [],
          planB: [{ action: 'USE_ALTERNATIVE', detail: '更换符合要求的车辆或改乘官方交通' }],
          blockingRuleIds: [rule.id],
        };
      }
    }
  }

  for (const rule of applicable) {
    const needsReservation =
      rule.ruleType === 'RESERVATION_REQUIRED' ||
      rule.ruleType === 'PARKING_RESERVATION' ||
      rule.reservationRequired === true;

    if (!needsReservation) continue;

    if (hasUserReservation(input, rule.targetResource)) continue;

    const capacity = findCapacityForSlot(
      input.capacitySnapshots,
      input.dateISO,
      arrivalMin,
    );
    if (capacity?.soldOut || capacity?.remaining === 0) {
      return {
        verdict: 'BLOCKED',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：${input.arrivalTime} 对应时段已无可用${rule.targetResource === 'PARKING' ? '停车位' : '预约名额'}`,
        confidence: capacity.confidenceScore != null ? 'PARTNER' : rule.confidence,
        signalSources: ['BOOKING'],
        planB: buildReservationPlanB(rule, input),
        blockingRuleIds: [rule.id],
      };
    }

    const hasInventoryData = Boolean(capacity);
    if (!hasInventoryData) {
      return {
        verdict: 'RESERVATION_REQUIRED',
        poiId: input.poiId,
        bottleneckResource: rule.targetResource,
        bottleneckRuleType: rule.ruleType,
        reason: `${input.poiName ?? input.poiId}：${rule.targetResource === 'PARKING' ? '停车' : '入场'}需要预约，请上传预约凭证或前往官方预订`,
        confidence: rule.confidence,
        signalSources: [],
        planB: buildReservationPlanB(rule, input),
        blockingRuleIds: [rule.id],
      };
    }

    return {
      verdict: 'RESERVATION_REQUIRED',
      poiId: input.poiId,
      bottleneckResource: rule.targetResource,
      bottleneckRuleType: rule.ruleType,
      reason: `${input.poiName ?? input.poiId}：${rule.targetResource === 'PARKING' ? '停车' : '入场'}需要预约，当前行程未检测到预约凭证`,
      confidence: rule.confidence,
      signalSources: capacity ? ['BOOKING'] : [],
      planB: buildReservationPlanB(rule, input),
      blockingRuleIds: [rule.id],
    };
  }

  return undefined;
}

function evaluateSoftSafetyRules(
  input: AccessCapacityEvaluationInput,
  applicable: PoiAccessRule[],
): AccessCapacityEvaluationResult | undefined {
  const softRules = applicable.filter(
    (r) =>
      r.ruleType === 'SAFETY_RESTRICTION' &&
      (r.enforcement ?? 'HARD') === 'SOFT' &&
      r.status === 'ACTIVE',
  );
  if (!softRules.length) return undefined;

  const rule = softRules[0];
  return {
    verdict: 'FEASIBLE_WITH_RISK',
    poiId: input.poiId,
    bottleneckResource: rule.targetResource,
    bottleneckRuleType: rule.ruleType,
    reason: `${input.poiName ?? input.poiId}：${rule.notes ?? '安全风险提示'}`,
    confidence: rule.confidence,
    signalSources: ['OPERATOR'],
    planB: [
      { action: 'SHIFT_ARRIVAL', detail: '大风或涨潮时避免靠近危险区域' },
      { action: 'USE_ALTERNATIVE', detail: '关注 SafeTravel.is 最新安全公告' },
    ],
    blockingRuleIds: [rule.id],
  };
}

function resolveCrowdingSnapshot(
  input: AccessCapacityEvaluationInput,
): PoiCrowdingSnapshot | undefined {
  if (input.crowdingSnapshot) return input.crowdingSnapshot;

  if (input.capacitySnapshots?.length) {
    const fromBooking = inferCrowdingFromCapacitySnapshots({
      poiId: input.poiId,
      dateISO: input.dateISO,
      arrivalTime: input.arrivalTime,
      snapshots: input.capacitySnapshots,
    });
    if (fromBooking) return fromBooking;
  }

  if (isIcelandCrowdingProfilePoi(input.poiId)) {
    return inferCrowdingFromProfile({
      poiId: input.poiId,
      dateISO: input.dateISO,
      arrivalTime: input.arrivalTime,
      arrivalRateMultiplier: input.arrivalRateMultiplier,
    });
  }

  return undefined;
}

function evaluateCrowdingRisk(
  input: AccessCapacityEvaluationInput,
  snap?: PoiCrowdingSnapshot,
): AccessCapacityEvaluationResult | undefined {
  const resolved = snap ?? input.crowdingSnapshot;
  if (!resolved) return undefined;

  const p50 = resolved.predictedWaitP50;
  const highCrowd =
    resolved.crowdLevel === 'HIGH' ||
    resolved.crowdLevel === 'FULL' ||
    (p50 != null && p50 >= HIGH_WAIT_P50_MIN);

  if (!highCrowd) return undefined;

  const waitLabel =
    p50 != null
      ? `预计等待 P50 ${p50} 分钟${resolved.predictedWaitP90 != null ? ` / P90 ${resolved.predictedWaitP90} 分钟` : ''}`
      : `预测拥挤等级 ${resolved.crowdLevel}`;

  const sourceNote = resolved.signalSources.includes('BOOKING')
    ? '（基于预约库存预测）'
    : resolved.signalSources.includes('MODEL')
      ? '（基于模型推断）'
      : resolved.signalSources.includes('TRAFFIC')
        ? '（基于道路交通量推断）'
        : '';

  const planB: AccessCapacityPlanB[] = [];
  if (p50 != null && p50 >= HIGH_WAIT_P50_MIN) {
    const shiftMin = Math.max(30, Math.round(p50 * 1.5));
    planB.push({
      action: 'SHIFT_ARRIVAL',
      detail: `建议提前约 ${shiftMin} 分钟到达`,
    });
  }
  planB.push({
    action: 'USE_ALTERNATIVE',
    detail: '或改选相邻低拥挤时段 / 替代观景点',
  });

  return {
    verdict: 'FEASIBLE_WITH_RISK',
    poiId: input.poiId,
    bottleneckResource: resolved.signalSources.includes('PARKING') ? 'PARKING' : 'POI',
    reason: `${input.poiName ?? input.poiId}：${waitLabel}${sourceNote}`,
    confidence: resolved.confidenceScore >= 0.7 ? 'PARTNER' : 'INFERRED',
    signalSources: resolved.signalSources,
    predictedWaitP50: resolved.predictedWaitP50,
    predictedWaitP90: resolved.predictedWaitP90,
    crowdLevel: resolved.crowdLevel,
    planB,
  };
}

/** 评估 POI 在某日期/时刻的准入与容量结论 */
export function evaluatePoiAccessCapacity(
  input: AccessCapacityEvaluationInput,
): AccessCapacityEvaluationResult {
  const arrivalMin = parseArrivalMinutes(input.arrivalTime);
  if (arrivalMin == null) {
    return {
      verdict: 'NEEDS_CONFIRMATION',
      poiId: input.poiId,
      reason: `${input.poiName ?? input.poiId}：无法解析到达时刻 ${input.arrivalTime ?? '(缺失)'}`,
      confidence: 'INFERRED',
      signalSources: [],
      planB: [],
    };
  }

  const mergedRules = mergeAccessRulesWithOverrides(
    input.rules,
    input.statusOverrides,
    input.dateISO,
  );
  const crowdingSnapshot = resolveCrowdingSnapshot(input);
  const enriched: AccessCapacityEvaluationInput = {
    ...input,
    rules: mergedRules,
    crowdingSnapshot,
  };

  const applicable = mergedRules.filter((r) =>
    isRuleApplicable(r, input.dateISO, arrivalMin),
  );

  const blocked = evaluateBlockingRules(enriched, applicable, arrivalMin);
  if (blocked) return blocked;

  const softSafety = evaluateSoftSafetyRules(enriched, applicable);
  if (softSafety) return softSafety;

  const risk = evaluateCrowdingRisk(enriched, crowdingSnapshot);
  if (risk) return risk;

  return {
    verdict: 'FEASIBLE',
    poiId: input.poiId,
    reason: `${input.poiName ?? input.poiId}：当前规则下可执行`,
    confidence:
      applicable.find((r) => r.confidence === 'OFFICIAL')?.confidence ?? 'INFERRED',
    signalSources: crowdingSnapshot?.signalSources ?? [],
    planB: [],
  };
}

/** 按 poiId 分组规则 */
export function groupRulesByPoiId(
  rules: PoiAccessRule[],
): Map<string, PoiAccessRule[]> {
  const map = new Map<string, PoiAccessRule[]>();
  for (const rule of rules) {
    const list = map.get(rule.poiId) ?? [];
    list.push(rule);
    map.set(rule.poiId, list);
  }
  return map;
}
