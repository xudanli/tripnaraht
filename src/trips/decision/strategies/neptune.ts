// src/trips/decision/strategies/neptune.ts

/**
 * Neptune Strategy: Plan Repair / Re-routing / Reallocation
 * 
 * 目标：当出现天气、闭馆、超时等变化时，最小改动修复，不要"全推翻重来"。
 */

import { ActivityCandidate, TripWorldState } from '../world-model';
import { PlanDay, PlanSlot, TripPlan } from '../plan-model';

export interface RepairTrigger {
  code: 'WEATHER' | 'CLOSED' | 'TIME_OVER' | 'BUDGET_OVER' | 'USER_CHANGE';
  date?: string;
  slotId?: string;
  details?: Record<string, any>;
}

function slotViolates(
  state: TripWorldState,
  date: string,
  slot: PlanSlot
): RepairTrigger[] {
  const violations: RepairTrigger[] = [];

  // MVP examples:
  // 1) closed (if we have opening hours)
  // -> you can implement with candidate opening windows lookup
  // 2) weather unsafe (if outdoor + alert)
  const alerts = state.signals.alerts || [];
  const hasCriticalWeather = alerts.some(a => a.severity === 'critical');
  if (
    hasCriticalWeather &&
    slot.type !== 'hotel' &&
    slot.type !== 'transport'
  ) {
    // rough: if critical weather, outdoor-ish activities become risky
    violations.push({
      code: 'WEATHER',
      date,
      slotId: slot.id,
      details: { message: 'critical weather alert' },
    });
  }

  return violations;
}

function pickReplacement(
  state: TripWorldState,
  date: string,
  oldSlot: PlanSlot,
  candidates: ActivityCandidate[]
): ActivityCandidate | null {
  // MVP: same intentTags / same type / indoor-first under weather issues
  // You can improve with embeddings later.
  const oldTitle = oldSlot.title.toLowerCase();

  const score = (c: ActivityCandidate) => {
    const indoorBonus = c.indoorOutdoor === 'indoor' ? 0.6 : 0;
    const q = c.qualityScore ?? 0.5;
    const matchBonus = (c.name.en || c.name.zh || '')
      .toLowerCase()
      .includes(oldTitle)
      ? 0.2
      : 0;
    return indoorBonus + q + matchBonus;
  };

  const pool = candidates.filter(c => c.location?.point);
  pool.sort((a, b) => score(b) - score(a));

  return pool[0] || null;
}

export interface NeptuneRepairResult {
  plan: TripPlan;
  triggers: RepairTrigger[];
  changedSlotIds: string[];
  explanation: string;
}

/**
 * Neptune: minimal-edit repair.
 * Strategy:
 *  - detect violations
 *  - try "swap" activity within same slot time (keep schedule structure)
 *  - if can't, "drop" optional slots
 */
export function neptuneRepairPlan(
  state: TripWorldState,
  plan: TripPlan
): NeptuneRepairResult {
  const triggers: RepairTrigger[] = [];
  const changedSlotIds: string[] = [];

  const newDays: PlanDay[] = plan.days.map(day => {
    const candidates = state.candidatesByDate[day.date] || [];

    const newSlots = day.timeSlots.map(slot => {
      if (slot.locked || slot.priorityTag === 'anchor') return slot;

      const v = slotViolates(state, day.date, slot);
      if (v.length === 0) return slot;

      triggers.push(...v);

      // attempt swap
      const rep = pickReplacement(state, day.date, slot, candidates);
      if (!rep) {
        // fallback: mark as removed by turning into rest (or drop in your UI)
        changedSlotIds.push(slot.id);
        return {
          ...slot,
          title: '自由活动 / 休息',
          type: 'rest' as const,
          poiId: undefined,
          coordinates: undefined,
          reasons: [
            ...(slot.reasons || []),
            'Repaired by Neptune: no feasible replacement, fallback to rest',
          ],
        };
      }

      changedSlotIds.push(slot.id);
      return {
        ...slot,
        title: rep.name.zh || rep.name.en || slot.title,
        type: rep.type,
        poiId: rep.id,
        coordinates: rep.location?.point,
        reasons: [
          ...(slot.reasons || []),
          'Repaired by Neptune: swapped due to violation',
        ],
      };
    });

    return { ...day, timeSlots: newSlots };
  });

  const repaired: TripPlan = { ...plan, days: newDays };

  return {
    plan: repaired,
    triggers,
    changedSlotIds,
    explanation: triggers.length
      ? `Neptune repaired plan with minimal edits. Violations=${triggers.length}, changedSlots=${changedSlotIds.length}`
      : 'No repair needed',
  };
}

