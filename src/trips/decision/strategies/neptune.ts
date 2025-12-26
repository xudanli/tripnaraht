// src/trips/decision/strategies/neptune.ts

/**
 * Neptune Strategy: Plan Repair / Re-routing / Reallocation
 * 
 * 目标：当出现天气、闭馆、超时等变化时，最小改动修复，不要"全推翻重来"。
 */

import { ActivityCandidate, TripWorldState } from '../world-model';
import { PlanDay, PlanSlot, TripPlan } from '../plan-model';

export interface RepairTrigger {
  code: 'WEATHER' | 'CLOSED' | 'TIME_OVER' | 'BUDGET_OVER' | 'USER_CHANGE' | 'RISK_VIOLATION';
  date?: string;
  slotId?: string;
  details?: Record<string, any>;
}

function slotViolates(
  state: TripWorldState,
  date: string,
  slot: PlanSlot,
  riskWeights?: Map<string, number>
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

  // P1.1.3: 检测风险违规（高风险活动应该被替换）
  if (slot.poiId && riskWeights) {
    const riskWeight = riskWeights.get(slot.poiId);
    if (riskWeight !== undefined && riskWeight > 0.7) {
      // 风险权重>0.7（风险评分>70）时，触发风险违规
      violations.push({
        code: 'RISK_VIOLATION',
        date,
        slotId: slot.id,
        details: { 
          message: `高风险活动（风险评分: ${(riskWeight * 100).toFixed(1)}）`,
          riskWeight,
        },
      });
    }
  }

  return violations;
}

function pickReplacement(
  state: TripWorldState,
  date: string,
  oldSlot: PlanSlot,
  candidates: ActivityCandidate[],
  riskWeights?: Map<string, number>
): ActivityCandidate | null {
  // MVP: same intentTags / same type / indoor-first under weather issues
  // You can improve with embeddings later.
  const oldTitle = oldSlot.title.toLowerCase();

  // P1.1.3: 集成风险评分，优先选择低风险活动
  const score = (c: ActivityCandidate) => {
    const indoorBonus = c.indoorOutdoor === 'indoor' ? 0.6 : 0;
    const q = c.qualityScore ?? 0.5;
    const matchBonus = (c.name.en || c.name.zh || '')
      .toLowerCase()
      .includes(oldTitle)
      ? 0.2
      : 0;
    
    // 风险惩罚：风险权重越高，评分越低
    const riskWeight = riskWeights?.get(c.id) || 0;
    const riskPenalty = riskWeight * 0.5; // 风险惩罚：最高降低0.5分
    
    return indoorBonus + q + matchBonus - riskPenalty;
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
  plan: TripPlan,
  riskWeights?: Map<string, number>
): NeptuneRepairResult {
  const triggers: RepairTrigger[] = [];
  const changedSlotIds: string[] = [];

  const newDays: PlanDay[] = plan.days.map(day => {
    const candidates = state.candidatesByDate[day.date] || [];

    const newSlots = day.timeSlots.map(slot => {
      if (slot.locked || slot.priorityTag === 'anchor') return slot;

      const v = slotViolates(state, day.date, slot, riskWeights);
      if (v.length === 0) return slot;

      triggers.push(...v);

      // attempt swap
      const rep = pickReplacement(state, day.date, slot, candidates, riskWeights);
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

