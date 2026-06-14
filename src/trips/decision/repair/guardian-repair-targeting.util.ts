import type { TripPlan, PlanDay } from '../plan-model';
import type { RepairAction } from './repair-action.types';
import type { GuardianFatigueDayPrediction } from './guardian-repair-hints.types';

const DAY_PATTERNS = [
  /\bDay\s*(\d+)\b/i,
  /第\s*(\d+)\s*天/,
  /\bday\s*(\d+)\b/i,
];

/** 从 Guardian 用户可读文案中解析 1-based 行程日序号 */
export function parseDayIndexFromText(text: string): number | undefined {
  for (const pattern of DAY_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const day = Number(match[1]);
      if (Number.isFinite(day) && day >= 1) return day;
    }
  }
  return undefined;
}

export function findPlanDay(plan: TripPlan, dayIndex: number): PlanDay | undefined {
  const byField = plan.days.find((day) => day.day === dayIndex);
  if (byField) return byField;
  return plan.days[dayIndex - 1];
}

export function mapTdfpmRecommendationToAction(
  recommendation: string | undefined,
): RepairAction | undefined {
  switch (recommendation) {
    case 'REST_NOW':
      return 'INSERT_REST';
    case 'SPLIT_DAY':
      return 'SPLIT_DRIVE';
    case 'STOP_DRIVING':
      return 'SKIP_OPTIONAL_POI';
    default:
      return undefined;
  }
}

export function pickHighestFatigueDay(
  fatiguePrediction: GuardianFatigueDayPrediction[] | undefined,
): GuardianFatigueDayPrediction | undefined {
  if (!fatiguePrediction?.length) return undefined;
  return [...fatiguePrediction].sort((a, b) => b.fatigueScore - a.fatigueScore)[0];
}

/** 按辩论/TDFPM 指定的 dayIndex 选取该日目标槽位 */
export function pickSlotIdsForPlanDay(
  plan: TripPlan,
  dayIndex: number,
  action: RepairAction,
): string[] {
  const day = findPlanDay(plan, dayIndex);
  if (!day?.timeSlots.length) return [];

  const slots = day.timeSlots.filter((slot) => !slot.locked && slot.priorityTag !== 'anchor');
  if (slots.length === 0) return [];

  switch (action) {
    case 'INSERT_REST':
    case 'SKIP_OPTIONAL_POI':
    case 'MOVE_SLOT_LATER':
      return [slots[slots.length - 1].id];
    case 'MOVE_SLOT_EARLIER':
    case 'SHORTEN_ACTIVITY':
      return [slots.find((slot) => slot.endTime)?.id ?? slots[0].id];
    case 'SPLIT_DRIVE': {
      const transport = slots.find((slot) => slot.type === 'transport');
      if (transport) return [transport.id];
      return [slots[Math.min(1, slots.length - 1)].id];
    }
    case 'SWAP_POI':
      return [slots.find((slot) => slot.type === 'sightseeing')?.id ?? slots[0].id];
    default:
      return [slots[0].id];
  }
}

export function pickFallbackTargetSlotIds(plan: TripPlan, max = 2): string[] {
  const slots = plan.days.flatMap((day) => day.timeSlots);
  if (slots.length === 0) return [];
  const mid = Math.floor(slots.length / 2);
  return [slots[mid]?.id, slots[slots.length - 1]?.id].filter(Boolean).slice(0, max);
}

export function resolveGuardianTargetSlotIds(input: {
  plan: TripPlan;
  action: RepairAction;
  dayIndex?: number;
  fatiguePrediction?: GuardianFatigueDayPrediction[];
}): { slotIds: string[]; dayIndex?: number; date?: string } {
  if (input.dayIndex != null) {
    const slotIds = pickSlotIdsForPlanDay(input.plan, input.dayIndex, input.action);
    if (slotIds.length > 0) {
      const day = findPlanDay(input.plan, input.dayIndex);
      return { slotIds, dayIndex: input.dayIndex, date: day?.date };
    }
  }

  const urgentFatigue = pickHighestFatigueDay(input.fatiguePrediction);
  if (
    urgentFatigue &&
    urgentFatigue.fatigueScore >= 60 &&
    ['SPLIT_DRIVE', 'INSERT_REST', 'SKIP_OPTIONAL_POI'].includes(input.action)
  ) {
    const mapped = mapTdfpmRecommendationToAction(urgentFatigue.recommendation);
    if (mapped === input.action || input.action === 'INSERT_REST') {
      const slotIds = pickSlotIdsForPlanDay(
        input.plan,
        urgentFatigue.dayIndex,
        input.action,
      );
      if (slotIds.length > 0) {
        const day = findPlanDay(input.plan, urgentFatigue.dayIndex);
        return { slotIds, dayIndex: urgentFatigue.dayIndex, date: day?.date };
      }
    }
  }

  return { slotIds: pickFallbackTargetSlotIds(input.plan) };
}
