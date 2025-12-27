// src/trips/decision/tot/candidate-helper.ts

/**
 * 候选活动查找辅助函数
 * 
 * 用于从 world.candidatesByDate 中查找 ActivityCandidate
 */

import { TripWorldState, ActivityCandidate, ISODate } from '../world-model';
import { PlanSlot, PlanDay } from '../plan-model';

/**
 * 从候选池中查找活动候选
 */
export function findActivityCandidate(
  world: TripWorldState,
  poiId: string,
  date: ISODate
): ActivityCandidate | undefined {
  const candidates = world.candidatesByDate[date] || [];
  return candidates.find(c => c.id === poiId);
}

/**
 * 从计划中提取所有活动的候选信息
 */
export function extractActivityCandidatesFromPlan(
  world: TripWorldState,
  plan: { days: PlanDay[] }
): Map<string, { candidate: ActivityCandidate; slot: PlanSlot; date: ISODate }> {
  const result = new Map<string, { candidate: ActivityCandidate; slot: PlanSlot; date: ISODate }>();

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const candidate = findActivityCandidate(world, slot.poiId, day.date);
        if (candidate) {
          result.set(slot.poiId, {
            candidate,
            slot,
            date: day.date,
          });
        }
      }
    }
  }

  return result;
}

/**
 * 获取计划中所有活动的候选列表
 */
export function getAllActivityCandidates(
  world: TripWorldState,
  plan: { days: PlanDay[] }
): ActivityCandidate[] {
  const candidates: ActivityCandidate[] = [];
  const seen = new Set<string>();

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.poiId && !seen.has(slot.poiId)) {
        const candidate = findActivityCandidate(world, slot.poiId, day.date);
        if (candidate) {
          candidates.push(candidate);
          seen.add(slot.poiId);
        }
      }
    }
  }

  return candidates;
}

