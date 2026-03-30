// src/trips/decision/tot/utils.ts

/**
 * ToT 评分器工具函数
 */

import { TripPlan } from '../plan-model';
import { ISOTime } from '../world-model';

/**
 * 解析时间字符串（HH:mm）为分钟数
 */
export function parseTimeToMinutes(time: ISOTime): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * 计算两个时间之间的分钟差
 */
export function timeDiffMinutes(start: ISOTime, end: ISOTime): number {
  return parseTimeToMinutes(end) - parseTimeToMinutes(start);
}

/**
 * 计算一天的总可用时间（分钟）
 */
export function calculateDayDuration(
  dayStart: ISOTime,
  dayEnd: ISOTime
): number {
  return timeDiffMinutes(dayStart, dayEnd);
}

/**
 * 检查计划是否包含指定日期的活动
 */
export function hasActivitiesOnDate(plan: TripPlan, date: string): boolean {
  const day = plan.days.find(d => d.date === date);
  if (!day) return false;
  
  return day.timeSlots.some(
    slot => slot.type !== 'transport' && slot.type !== 'rest'
  );
}

/**
 * 统计计划中的活动数量
 */
export function countActivities(plan: TripPlan): number {
  let count = 0;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.type !== 'transport' && slot.type !== 'rest') {
        count++;
      }
    }
  }
  return count;
}

/**
 * 统计计划中的硬节点数量
 */
export function countHardNodes(plan: TripPlan): number {
  let count = 0;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.locked || slot.priorityTag === 'anchor') {
        count++;
      }
    }
  }
  return count;
}

/**
 * 获取计划中所有硬节点 ID
 */
export function getHardNodeIds(plan: TripPlan): Set<string> {
  const ids = new Set<string>();
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if ((slot.locked || slot.priorityTag === 'anchor') && slot.poiId) {
        ids.add(slot.poiId);
      }
    }
  }
  return ids;
}

/**
 * 检查计划是否包含指定的 POI ID
 */
export function containsPoiId(plan: TripPlan, poiId: string): boolean {
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.poiId === poiId) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 计算计划的总旅行时间（分钟）
 */
export function calculateTotalTravelTime(plan: TripPlan): number {
  let total = 0;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.travelLegFromPrev) {
        total += slot.travelLegFromPrev.durationMin;
      }
    }
  }
  return total;
}

/**
 * 计算计划的总步行时间（分钟）
 */
export function calculateTotalWalkTime(plan: TripPlan): number {
  let total = 0;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.travelLegFromPrev && slot.travelLegFromPrev.mode === 'walk') {
        total += slot.travelLegFromPrev.durationMin;
      }
    }
  }
  return total;
}

