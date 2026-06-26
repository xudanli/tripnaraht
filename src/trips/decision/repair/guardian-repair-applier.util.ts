import type { TripPlan, PlanSlot, PlanDay } from '../plan-model';
import type { ActivityCandidate, ISOTime, TripWorldState } from '../world-model';
import type { RepairInstruction } from './repair-action.types';

export interface GuardianRepairApplyResult {
  plan: TripPlan;
  changedSlotIds: string[];
  appliedRepairIds: string[];
}

export function isGuardianRepairInstruction(repair: RepairInstruction): boolean {
  if (repair.id.startsWith('guardian_hint_')) return true;
  return Boolean(repair.metadata?.source);
}

function shiftTime(time: ISOTime, deltaMinutes: number): ISOTime {
  const [h, m] = time.split(':').map(Number);
  const normalized = ((h * 60 + m + deltaMinutes) % 1440 + 1440) % 1440;
  const nh = Math.floor(normalized / 60);
  const nm = normalized % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}` as ISOTime;
}

function pickGuardianReplacement(
  oldSlot: PlanSlot,
  candidates: ActivityCandidate[],
): ActivityCandidate | null {
  const oldTitle = oldSlot.title.toLowerCase();
  const score = (candidate: ActivityCandidate) => {
    const indoorBonus = candidate.indoorOutdoor === 'indoor' ? 0.6 : 0;
    const quality = candidate.qualityScore ?? 0.5;
    const matchBonus = (candidate.name.en || candidate.name.zh || '')
      .toLowerCase()
      .includes(oldTitle)
      ? 0.2
      : 0;
    return indoorBonus + quality + matchBonus;
  };

  const pool = candidates.filter((candidate) => candidate.location?.point);
  pool.sort((a, b) => score(b) - score(a));
  return pool[0] ?? null;
}

function findSlot(plan: TripPlan, slotId: string): { day: PlanDay; slot: PlanSlot; index: number } | null {
  for (const day of plan.days) {
    const index = day.timeSlots.findIndex((slot) => slot.id === slotId);
    if (index >= 0) {
      return { day, slot: day.timeSlots[index], index };
    }
  }
  return null;
}

function applyToSlot(
  slot: PlanSlot,
  repair: RepairInstruction,
  candidates: ActivityCandidate[],
): { slot: PlanSlot | null; removed: boolean } {
  if (slot.locked || slot.priorityTag === 'anchor') {
    return { slot, removed: false };
  }

  const reason = `Guardian: ${repair.narrative}`;

  switch (repair.action) {
    case 'INSERT_REST':
      return {
        slot: {
          ...slot,
          title: '自由活动 / 休息',
          type: 'rest',
          poiId: undefined,
          coordinates: undefined,
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    case 'SKIP_OPTIONAL_POI':
      if (slot.priorityTag === 'optional') {
        return { slot: null, removed: true };
      }
      return {
        slot: {
          ...slot,
          title: '自由活动 / 休息',
          type: 'rest',
          poiId: undefined,
          coordinates: undefined,
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    case 'SHORTEN_ACTIVITY': {
      const delta = repair.suggestedDeltaMinutes ?? 30;
      return {
        slot: {
          ...slot,
          endTime: slot.endTime ? shiftTime(slot.endTime, -delta) : slot.endTime,
          notes: [slot.notes, reason].filter(Boolean).join(' · '),
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    }
    case 'MOVE_SLOT_EARLIER': {
      const delta = repair.suggestedDeltaMinutes ?? 30;
      return {
        slot: {
          ...slot,
          time: shiftTime(slot.time, -delta),
          endTime: slot.endTime ? shiftTime(slot.endTime, -delta) : slot.endTime,
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    }
    case 'MOVE_SLOT_LATER': {
      const delta = repair.suggestedDeltaMinutes ?? 30;
      return {
        slot: {
          ...slot,
          time: shiftTime(slot.time, delta),
          endTime: slot.endTime ? shiftTime(slot.endTime, delta) : slot.endTime,
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    }
    case 'SPLIT_DRIVE':
      return {
        slot: {
          ...slot,
          notes: [slot.notes, `${reason}（建议拆分驾驶段）`].filter(Boolean).join(' · '),
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    case 'SWAP_POI': {
      const replacement = pickGuardianReplacement(slot, candidates);
      if (!replacement) {
        return {
          slot: {
            ...slot,
            title: '自由活动 / 休息',
            type: 'rest',
            poiId: undefined,
            coordinates: undefined,
            reasons: [...(slot.reasons ?? []), `${reason}（无可用替代 POI）`],
          },
          removed: false,
        };
      }
      return {
        slot: {
          ...slot,
          title: replacement.name.zh || replacement.name.en || slot.title,
          type: replacement.type,
          poiId: replacement.id,
          coordinates: replacement.location?.point,
          reasons: [...(slot.reasons ?? []), reason],
        },
        removed: false,
      };
    }
    default:
      return { slot, removed: false };
  }
}

/**
 * 将 Guardian 辩论产出的 RepairInstruction 应用到 TripPlan（在 IR trigger 修补之后执行）。
 */
export function applyGuardianRepairInstructions(
  plan: TripPlan,
  state: TripWorldState,
  repairs: RepairInstruction[] | undefined,
): GuardianRepairApplyResult {
  const guardianRepairs = (repairs ?? [])
    .filter(isGuardianRepairInstruction)
    .sort((a, b) => a.priority - b.priority);

  if (guardianRepairs.length === 0) {
    return { plan, changedSlotIds: [], appliedRepairIds: [] };
  }

  let working: TripPlan = {
    ...plan,
    days: plan.days.map((day) => ({ ...day, timeSlots: [...day.timeSlots] })),
  };
  const changedSlotIds = new Set<string>();
  const appliedRepairIds: string[] = [];

  for (const repair of guardianRepairs) {
    let applied = false;
    for (const slotId of repair.targetSlotIds) {
      const located = findSlot(working, slotId);
      if (!located) continue;

      const candidates = state.candidatesByDate[located.day.date] ?? [];
      const outcome = applyToSlot(located.slot, repair, candidates);
      if (outcome.removed) {
        located.day.timeSlots.splice(located.index, 1);
        changedSlotIds.add(slotId);
        applied = true;
        continue;
      }

      if (outcome.slot && outcome.slot !== located.slot) {
        located.day.timeSlots[located.index] = outcome.slot;
        changedSlotIds.add(slotId);
        applied = true;
      }
    }
    if (applied) {
      appliedRepairIds.push(repair.id);
    }
  }

  return {
    plan: working,
    changedSlotIds: [...changedSlotIds],
    appliedRepairIds,
  };
}

const ACTION_TO_LOG: Record<
  RepairInstruction['action'],
  'insert_buffer' | 'shorten' | 'swap' | 'reorder' | 'drop'
> = {
  INSERT_REST: 'insert_buffer',
  SHORTEN_ACTIVITY: 'shorten',
  SWAP_POI: 'swap',
  SKIP_OPTIONAL_POI: 'drop',
  MOVE_SLOT_EARLIER: 'reorder',
  MOVE_SLOT_LATER: 'reorder',
  SPLIT_DRIVE: 'reorder',
  COMPRESS_STOP: 'shorten',
  DELAY_CHECKIN: 'reorder',
  EARLY_DEPARTURE: 'reorder',
};

export function mapGuardianRepairsToChosenActions(
  repairs: RepairInstruction[] | undefined,
  appliedRepairIds: string[],
): Array<{
  actionType: 'insert_buffer' | 'shorten' | 'swap' | 'reorder' | 'drop';
  reasonCodes: string[];
  payload: Record<string, unknown>;
}> {
  const applied = new Set(appliedRepairIds);
  return (repairs ?? [])
    .filter((repair) => isGuardianRepairInstruction(repair) && applied.has(repair.id))
    .map((repair) => ({
      actionType: ACTION_TO_LOG[repair.action] ?? 'reorder',
      reasonCodes: ['GUARDIAN_DEBATE_REPAIR'],
      payload: {
        repairId: repair.id,
        guardianAction: repair.action,
        targetSlotIds: repair.targetSlotIds,
        narrative: repair.narrative,
      },
    }));
}
