/**
 * PlanObject Gateway assertions → feasibility repair options (Phase 4/5).
 */

import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type {
  FeasibilityIssueAnchorsDto,
  FeasibilityIssueDto,
  FeasibilityRepairOptionDto,
} from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import { buildBufferInsufficientRepairOptions } from '../../../trips/trip-constraint-solver/utils/buffer-insufficient-repair.util';
import { isPlanObjectGatewayAssertion } from './plan-object-evidence-display.util';

export type PlanObjectRepairKind =
  | 'STAY_LINKAGE'
  | 'MEAL_WINDOW_VS_ARRIVAL'
  | 'MEAL_WINDOW_GAP'
  | 'BUFFER_LINKAGE'
  | 'DAILY_FATIGUE_LOAD'
  | 'TRANSFER_DAILY_LOAD';

export function isPlanObjectSemanticKey(semanticKey?: string): boolean {
  return typeof semanticKey === 'string' && semanticKey.includes('plan_object_');
}

export function isPlanObjectFeasibilityIssue(issue: FeasibilityIssueDto): boolean {
  return (
    isPlanObjectSemanticKey(issue.semanticKey) ||
    isPlanObjectSemanticKey(issue.id) ||
    issue.proofs?.some((p) => p.evidenceSource === 'plan-object-evaluator') === true
  );
}

function parseDayNumberFromAssertion(assertion: ConstraintAssertion): number | undefined {
  const dayId = assertion.scope.dayId;
  if (dayId) {
    const m = /day-(\d+)/.exec(dayId);
    if (m) return Number(m[1]);
  }
  const keyMatch = /_day_(\d+)/.exec(assertion.constraintType);
  if (keyMatch) return Number(keyMatch[1]);
  return undefined;
}

function parseGapMinutesFromMessage(message: string): number | undefined {
  const m = /缓冲仅\s*(\d+)\s*分钟/.exec(message);
  if (m) return Number(m[1]);
  const gap = /空档.*?(\d+)\s*分钟/.exec(message);
  if (gap) return Number(gap[1]);
  return undefined;
}

function parseFatigueFromMessage(message: string): number | undefined {
  const m = /疲劳指数\s*([\d.]+)/.exec(message);
  return m ? Number(m[1]) : undefined;
}

function parseTransferMinutesFromMessage(message: string): number | undefined {
  const m = /合计\s*(\d+)\s*分钟/.exec(message);
  return m ? Number(m[1]) : undefined;
}

function resolvePlanObjectKind(input: {
  ruleId?: string;
  semanticKey: string;
}): PlanObjectRepairKind | undefined {
  const rule = input.ruleId;
  if (rule && rule !== 'PLAN_OBJECT_ASSESSMENT') {
    return rule as PlanObjectRepairKind;
  }

  const key = input.semanticKey;
  if (key.includes('meal_late_arrival')) return 'MEAL_WINDOW_VS_ARRIVAL';
  if (key.includes('meal_gap')) return 'MEAL_WINDOW_GAP';
  if (key.includes('buffer_day')) return 'BUFFER_LINKAGE';
  if (key.includes('fatigue_day')) return 'DAILY_FATIGUE_LOAD';
  if (key.includes('transfer_load')) return 'TRANSFER_DAILY_LOAD';
  if (key.includes('stay_')) return 'STAY_LINKAGE';
  return undefined;
}

function buildAnchors(input: {
  dayNumber?: number;
  planObjectId?: string;
  gapMinutes?: number;
  shortfallMinutes?: number;
}): FeasibilityIssueAnchorsDto {
  const planRef = input.planObjectId ?? 'plan-object';
  return {
    toItemId: planRef,
    toDayNumber: input.dayNumber,
    gapMinutes: input.gapMinutes,
    shortfallMinutes: input.shortfallMinutes ?? input.gapMinutes,
    bufferMinutes: 15,
  };
}

export function buildPlanObjectRepairOptions(input: {
  issueId: string;
  semanticKey: string;
  message: string;
  ruleId?: string;
  dayNumber?: number;
  planObjectId?: string;
}): FeasibilityRepairOptionDto[] {
  const kind = resolvePlanObjectKind({ ruleId: input.ruleId, semanticKey: input.semanticKey });
  const dayNumber = input.dayNumber;
  const planObjectId = input.planObjectId;
  const anchors = buildAnchors({
    dayNumber,
    planObjectId,
    gapMinutes: parseGapMinutesFromMessage(input.message),
    shortfallMinutes: parseGapMinutesFromMessage(input.message),
  });

  switch (kind) {
    case 'BUFFER_LINKAGE': {
      const shortfall = Math.max(anchors.shortfallMinutes ?? 15, 1);
      return buildBufferInsufficientRepairOptions({
        issueId: input.issueId,
        toItemId: planObjectId ?? `plan-object-buffer-${dayNumber ?? 0}`,
        toLabel: '下一活动',
        shortfallMinutes: shortfall,
        anchors,
      });
    }
    case 'MEAL_WINDOW_VS_ARRIVAL':
      return [
        {
          id: 'shift_meal_later',
          label: '将午餐窗后移 30 分钟',
          description: '推迟午餐开始时间，等待上一站结束后再用餐。',
          impactSummary: 'medium',
          actionType: 'shift_schedule',
          payload: { planObjectId, dayNumber, shiftMinutes: 30 },
        },
        {
          id: 'add_travel_buffer',
          label: '在上一站与午餐之间增加缓冲',
          description: '为转场预留更多时间，避免抵达晚于午餐窗。',
          impactSummary: 'medium',
          actionType: 'add_buffer',
          payload: { planObjectId, dayNumber, bufferMinutes: 30 },
        },
        {
          id: 'reorder_day_schedule',
          label: '调整当日活动顺序',
          description: '重新排列 Day 行程，使午餐窗落在合理抵达时间之后。',
          impactSummary: 'high',
          actionType: 'reorder_day',
          payload: { dayNumber, planObjectId },
        },
      ];
    case 'MEAL_WINDOW_GAP':
      return [
        {
          id: 'insert_meal_stop',
          label: '插入午餐停靠点',
          description: '在 11:00–14:00 窗口内增加 MEAL_WINDOW 或餐饮活动。',
          impactSummary: 'medium',
          actionType: 'insert_meal',
          payload: { dayNumber },
        },
        {
          id: 'extend_lunch_gap',
          label: '拉长午餐空档',
          description: '压缩非餐饮活动时段，为午餐预留连续空档。',
          impactSummary: 'medium',
          actionType: 'extend_gap',
          payload: { dayNumber },
        },
        {
          id: 'relax_lunch_strategy',
          label: '放宽午餐策略（灵活用餐）',
          description: '将午餐策略调整为 flexible，降低刚性午餐窗要求。',
          impactSummary: 'low',
          actionType: 'policy_relax',
          payload: { dayNumber, policy: 'flexible' },
        },
      ];
    case 'DAILY_FATIGUE_LOAD': {
      const fatigue = parseFatigueFromMessage(input.message);
      return [
        {
          id: 'reduce_day_intensity',
          label: '减少当日高强度活动',
          description: `降低 Day ${dayNumber ?? '?'} 体验点密度或缩短停留时长。`,
          impactSummary: 'medium',
          actionType: 'reduce_load',
          payload: { dayNumber, fatigueScore: fatigue },
        },
        {
          id: 'split_heavy_day',
          label: '拆分高强度日到相邻天',
          description: '将部分活动移至前后天，平衡疲劳负荷。',
          impactSummary: 'high',
          actionType: 'split_day',
          payload: { dayNumber },
        },
      ];
    }
    case 'TRANSFER_DAILY_LOAD': {
      const transferMinutes = parseTransferMinutesFromMessage(input.message);
      return [
        {
          id: 'reduce_transfer_legs',
          label: '合并/减少当日转场段',
          description: `当前交通合计约 ${transferMinutes ?? '?'} 分钟，建议合并路线或就近住宿。`,
          impactSummary: 'high',
          actionType: 'reduce_transfer',
          payload: { dayNumber, transferMinutes },
        },
        {
          id: 'insert_rest_stop',
          label: '插入中途休息点',
          description: '在长转场中增加 REST/SUPPLY_STOP，降低连续驾驶负荷。',
          impactSummary: 'medium',
          actionType: 'insert_rest',
          payload: { dayNumber },
        },
      ];
    }
    case 'STAY_LINKAGE':
      return [
        {
          id: 'add_stay_anchor',
          label: '补充当日住宿锚点',
          description: '在 Day 末或晚间活动后安排 STAY，确保住宿衔接。',
          impactSummary: 'high',
          actionType: 'add_stay',
          payload: { dayNumber, planObjectId },
        },
        {
          id: 'move_stay_terminal',
          label: '将住宿移至日末',
          description: '调整 STAY 顺序，使其成为当日最后一项。',
          impactSummary: 'medium',
          actionType: 'reorder_stay',
          payload: { dayNumber, planObjectId },
        },
      ];
    default:
      return [
        {
          id: 'review_plan_object',
          label: '查看 PlanObject 详情并手动调整',
          description: input.message,
          impactSummary: 'medium',
          actionType: 'manual_review',
          payload: { planObjectId, dayNumber, semanticKey: input.semanticKey },
        },
      ];
  }
}

export function buildPlanObjectRepairOptionsFromAssertion(
  assertion: ConstraintAssertion,
  issueId: string,
): FeasibilityRepairOptionDto[] {
  return buildPlanObjectRepairOptions({
    issueId,
    semanticKey: assertion.constraintType,
    message: assertion.message,
    ruleId: assertion.evaluator.ruleId,
    dayNumber: parseDayNumberFromAssertion(assertion),
    planObjectId: assertion.scope.planObjectIds?.[0],
  });
}

export function buildPlanObjectRepairOptionsResponse(
  tripId: string,
  issue: FeasibilityIssueDto,
): {
  blockerId: string;
  blockerMessage: string;
  issueId: string;
  options: import('../../../trips/readiness/types/coverage-map.types').RepairOption[];
} {
  const embedded = issue.repairOptions ?? [];
  const synthesized =
    embedded.length > 0
      ? embedded
      : buildPlanObjectRepairOptions({
          issueId: issue.id,
          semanticKey: issue.semanticKey ?? '',
          message: issue.message,
          ruleId: issue.issueKind,
          dayNumber: issue.affectedDays?.[0],
          planObjectId: issue.proofs?.[0]?.semanticKey,
        });

  return {
    blockerId: issue.id,
    blockerMessage: issue.message,
    issueId: issue.id,
    options: synthesized.map((o) => ({
      id: o.id,
      title: o.label,
      description: o.description,
      impact: (['high', 'medium', 'low'].includes(String(o.impactSummary ?? ''))
        ? o.impactSummary
        : 'medium') as 'high' | 'medium' | 'low',
      actionType: o.actionType ?? o.type,
      payload: o.payload,
    })),
  };
}

export function enrichPlanObjectFeasibilityIssue(
  assertion: ConstraintAssertion,
  issue: FeasibilityIssueDto,
): FeasibilityIssueDto {
  if (!isPlanObjectGatewayAssertion(assertion)) return issue;

  const repairOptions = buildPlanObjectRepairOptionsFromAssertion(assertion, issue.id);
  const dayNumber = parseDayNumberFromAssertion(assertion);
  const planObjectId = assertion.scope.planObjectIds?.[0];

  return {
    ...issue,
    issueKind: assertion.evaluator.ruleId ?? issue.issueKind,
    actionRequired: issue.actionRequired ?? assertion.message,
    affectedDays: issue.affectedDays?.length
      ? issue.affectedDays
      : dayNumber
        ? [dayNumber]
        : (issue.affectedDays ?? []),
    affectedDayNumbers:
      issue.affectedDayNumbers?.length
        ? issue.affectedDayNumbers
        : dayNumber
          ? [dayNumber]
          : issue.affectedDayNumbers,
    anchors: {
      ...issue.anchors,
      toItemId: planObjectId ?? issue.anchors?.toItemId,
      toDayNumber: dayNumber ?? issue.anchors?.toDayNumber,
      gapMinutes: parseGapMinutesFromMessage(assertion.message) ?? issue.anchors?.gapMinutes,
      shortfallMinutes:
        parseGapMinutesFromMessage(assertion.message) ?? issue.anchors?.shortfallMinutes,
    },
    repairOptions,
    proofs: (issue.proofs ?? []).map((proof, index) =>
      index === 0 ? { ...proof, repairOptions, planBOptions: repairOptions } : proof,
    ),
  };
}
