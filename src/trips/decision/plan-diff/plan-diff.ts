// src/trips/decision/plan-diff/plan-diff.ts

/**
 * Plan Diff / Plan Repair
 * 
 * 实现"最小改动"策略：slot-level diff 和智能修复
 */

import { PlanSlot, PlanDay, TripPlan } from '../plan-model';

export type SlotChangeType = 'moved' | 'removed' | 'added' | 'swap' | 'unchanged';

export interface SlotDiff {
  slotId: string;
  changeType: SlotChangeType;
  oldSlot?: PlanSlot;
  newSlot?: PlanSlot;
  reason?: string;
}

export interface PlanDiff {
  days: Array<{
    date: string;
    slotDiffs: SlotDiff[];
  }>;
  summary: {
    totalChanged: number;
    moved: number;
    removed: number;
    added: number;
    swapped: number;
    unchanged: number;
    editDistanceScore: number;
  };
}

/**
 * 计算两个计划的差异
 */
export function computePlanDiff(
  oldPlan: TripPlan,
  newPlan: TripPlan
): PlanDiff {
  const dayDiffs: PlanDiff['days'] = [];

  // 按日期匹配
  const oldDayMap = new Map(oldPlan.days.map(d => [d.date, d]));
  const newDayMap = new Map(newPlan.days.map(d => [d.date, d]));

  const allDates = new Set([
    ...oldPlan.days.map(d => d.date),
    ...newPlan.days.map(d => d.date),
  ]);

  let totalChanged = 0;
  let moved = 0;
  let removed = 0;
  let added = 0;
  let swapped = 0;
  let unchanged = 0;

  for (const date of allDates) {
    const oldDay = oldDayMap.get(date);
    const newDay = newDayMap.get(date);

    if (!oldDay && !newDay) continue;

    const slotDiffs: SlotDiff[] = [];

    if (!oldDay) {
      // 全新的一天
      if (newDay) {
        for (const slot of newDay.timeSlots) {
          slotDiffs.push({
            slotId: slot.id,
            changeType: 'added',
            newSlot: slot,
            reason: 'New day added',
          });
          added++;
          totalChanged++;
        }
      }
    } else if (!newDay) {
      // 删除的一天
      for (const slot of oldDay.timeSlots) {
        slotDiffs.push({
          slotId: slot.id,
          changeType: 'removed',
          oldSlot: slot,
          reason: 'Day removed',
        });
        removed++;
        totalChanged++;
      }
    } else {
      // 同一天，比较时间槽
      const oldSlotMap = new Map(oldDay.timeSlots.map(s => [s.id, s]));
      const newSlotMap = new Map(newDay.timeSlots.map(s => [s.id, s]));

      const allSlotIds = new Set([
        ...oldDay.timeSlots.map(s => s.id),
        ...newDay.timeSlots.map(s => s.id),
      ]);

      for (const slotId of allSlotIds) {
        const oldSlot = oldSlotMap.get(slotId);
        const newSlot = newSlotMap.get(slotId);

        if (!oldSlot && !newSlot) continue;

        if (!oldSlot) {
          // 新增
          slotDiffs.push({
            slotId,
            changeType: 'added',
            newSlot,
            reason: 'New slot added',
          });
          added++;
          totalChanged++;
        } else if (!newSlot) {
          // 删除
          slotDiffs.push({
            slotId,
            changeType: 'removed',
            oldSlot,
            reason: 'Slot removed',
          });
          removed++;
          totalChanged++;
        } else {
          // 检查是否变化
          const changed = isSlotChanged(oldSlot, newSlot);
          if (changed) {
            const changeType = detectChangeType(oldSlot, newSlot);
            slotDiffs.push({
              slotId,
              changeType,
              oldSlot,
              newSlot,
              reason: getChangeReason(oldSlot, newSlot, changeType),
            });

            if (changeType === 'moved') moved++;
            else if (changeType === 'swap') swapped++;
            totalChanged++;
          } else {
            slotDiffs.push({
              slotId,
              changeType: 'unchanged',
              oldSlot,
              newSlot,
            });
            unchanged++;
          }
        }
      }
    }

    if (slotDiffs.length > 0) {
      dayDiffs.push({
        date,
        slotDiffs,
      });
    }
  }

  // 计算编辑距离分数（越小越好）
  const editDistanceScore = calculateEditDistance(
    totalChanged,
    moved,
    removed,
    added,
    swapped
  );

  return {
    days: dayDiffs,
    summary: {
      totalChanged,
      moved,
      removed,
      added,
      swapped,
      unchanged,
      editDistanceScore,
    },
  };
}

/**
 * 检查时间槽是否变化
 */
function isSlotChanged(oldSlot: PlanSlot, newSlot: PlanSlot): boolean {
  return (
    oldSlot.time !== newSlot.time ||
    oldSlot.endTime !== newSlot.endTime ||
    oldSlot.title !== newSlot.title ||
    oldSlot.poiId !== newSlot.poiId ||
    oldSlot.type !== newSlot.type
  );
}

/**
 * 检测变化类型
 */
function detectChangeType(
  oldSlot: PlanSlot,
  newSlot: PlanSlot
): SlotChangeType {
  // 如果 POI 变了，是 swap
  if (oldSlot.poiId && newSlot.poiId && oldSlot.poiId !== newSlot.poiId) {
    return 'swap';
  }

  // 如果时间变了，是 moved
  if (oldSlot.time !== newSlot.time || oldSlot.endTime !== newSlot.endTime) {
    return 'moved';
  }

  // 其他变化（如标题、类型）也算 swap
  return 'swap';
}

/**
 * 获取变化原因
 */
function getChangeReason(
  oldSlot: PlanSlot,
  newSlot: PlanSlot,
  changeType: SlotChangeType
): string {
  if (changeType === 'swap') {
    return `Activity swapped: "${oldSlot.title}" → "${newSlot.title}"`;
  }
  if (changeType === 'moved') {
    return `Time moved: ${oldSlot.time} → ${newSlot.time}`;
  }
  return 'Slot changed';
}

/**
 * 计算编辑距离分数
 * 
 * 公式：moved * 1 + removed * 2 + added * 2 + swapped * 1.5
 * 删除和新增代价更高，因为影响更大
 */
function calculateEditDistance(
  totalChanged: number,
  moved: number,
  removed: number,
  added: number,
  swapped: number
): number {
  return moved * 1 + removed * 2 + added * 2 + swapped * 1.5;
}

/**
 * 最小改动修复策略
 * 
 * 优先级：
 * 1. 原时间不动，先 swap 活动
 * 2. 不行再 reorder（局部重排）
 * 3. 仍不行才 drop/缩短
 */
export interface MinimalEditStrategy {
  preserveLocked: boolean;      // 保留用户锁定
  preserveAnchors: boolean;       // 保留 anchor
  maxReorderDistance: number;   // 最大重排距离（分钟）
  preferSwap: boolean;           // 优先 swap
}

export const DEFAULT_MINIMAL_EDIT_STRATEGY: MinimalEditStrategy = {
  preserveLocked: true,
  preserveAnchors: true,
  maxReorderDistance: 120, // 2小时
  preferSwap: true,
};

