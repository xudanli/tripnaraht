// src/trips/decision/constraints/advanced-constraints.service.ts

/**
 * 高级约束服务
 * 
 * 支持互斥组、依赖关系等复杂约束
 */

import { Injectable, Logger } from '@nestjs/common';
import { ActivityCandidate } from '../world-model';
import { PlanSlot, PlanDay } from '../plan-model';

export interface MutexGroup {
  groupId: string;
  maxSelect: number; // 最多选择几个（默认1）
  description?: string;
}

export interface Dependency {
  from: string; // activityId
  to: string; // activityId
  type: 'before' | 'after' | 'same_day' | 'adjacent';
  minGapMinutes?: number; // 最小间隔（分钟）
}

export interface AdvancedConstraints {
  mutexGroups: MutexGroup[];
  dependencies: Dependency[];
}

@Injectable()
export class AdvancedConstraintsService {
  private readonly logger = new Logger(AdvancedConstraintsService.name);

  /**
   * 检查互斥组约束
   */
  checkMutexGroups(
    plan: { days: PlanDay[] },
    constraints: AdvancedConstraints
  ): Array<{
    groupId: string;
    violations: string[]; // activityIds
    message: string;
  }> {
    const violations: Array<{
      groupId: string;
      violations: string[];
      message: string;
    }> = [];

    // 收集所有活动
    const activityByGroup = new Map<string, string[]>();

    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (!slot.poiId) continue;

        // 从候选数据中获取 alternativeGroupId（这里简化处理）
        // 实际应该从 ActivityCandidate 中获取
        const groupId = this.getGroupId(slot.poiId);
        if (groupId) {
          if (!activityByGroup.has(groupId)) {
            activityByGroup.set(groupId, []);
          }
          activityByGroup.get(groupId)!.push(slot.poiId);
        }
      }
    }

    // 检查每个互斥组
    for (const group of constraints.mutexGroups) {
      const activities = activityByGroup.get(group.groupId) || [];
      const maxSelect = group.maxSelect || 1;

      if (activities.length > maxSelect) {
        violations.push({
          groupId: group.groupId,
          violations: activities,
          message: `互斥组 "${group.groupId}" 最多只能选择 ${maxSelect} 个，但选择了 ${activities.length} 个`,
        });
      }
    }

    return violations;
  }

  /**
   * 检查依赖关系
   */
  checkDependencies(
    plan: { days: PlanDay[] },
    constraints: AdvancedConstraints
  ): Array<{
    dependency: Dependency;
    message: string;
  }> {
    const violations: Array<{
      dependency: Dependency;
      message: string;
    }> = [];

    // 构建活动索引：activityId -> { dayIndex, slotIndex, time }
    const activityMap = new Map<
      string,
      { dayIndex: number; slotIndex: number; time: string }
    >();

    for (let dayIdx = 0; dayIdx < plan.days.length; dayIdx++) {
      const day = plan.days[dayIdx];
      for (let slotIdx = 0; slotIdx < day.timeSlots.length; slotIdx++) {
        const slot = day.timeSlots[slotIdx];
        if (slot.poiId) {
          activityMap.set(slot.poiId, {
            dayIndex: dayIdx,
            slotIndex: slotIdx,
            time: slot.time,
          });
        }
      }
    }

    // 检查每个依赖
    for (const dep of constraints.dependencies) {
      const from = activityMap.get(dep.from);
      const to = activityMap.get(dep.to);

      if (!from || !to) {
        // 依赖的活动不存在，跳过
        continue;
      }

      let violated = false;
      let message = '';

      switch (dep.type) {
        case 'before':
          if (from.dayIndex > to.dayIndex) {
            violated = true;
            message = `${dep.from} 必须在 ${dep.to} 之前`;
          } else if (
            from.dayIndex === to.dayIndex &&
            this.timeToMinutes(from.time) >= this.timeToMinutes(to.time)
          ) {
            violated = true;
            message = `${dep.from} 必须在 ${dep.to} 之前（同一天）`;
          }
          break;

        case 'after':
          if (from.dayIndex < to.dayIndex) {
            violated = true;
            message = `${dep.from} 必须在 ${dep.to} 之后`;
          } else if (
            from.dayIndex === to.dayIndex &&
            this.timeToMinutes(from.time) <= this.timeToMinutes(to.time)
          ) {
            violated = true;
            message = `${dep.from} 必须在 ${dep.to} 之后（同一天）`;
          }
          break;

        case 'same_day':
          if (from.dayIndex !== to.dayIndex) {
            violated = true;
            message = `${dep.from} 和 ${dep.to} 必须在同一天`;
          }
          break;

        case 'adjacent':
          const dayDiff = Math.abs(from.dayIndex - to.dayIndex);
          if (dayDiff > 1) {
            violated = true;
            message = `${dep.from} 和 ${dep.to} 必须相邻（相差不超过1天）`;
          } else if (dep.minGapMinutes) {
            const timeDiff = Math.abs(
              this.timeToMinutes(from.time) - this.timeToMinutes(to.time)
            );
            if (timeDiff < dep.minGapMinutes) {
              violated = true;
              message = `${dep.from} 和 ${dep.to} 之间至少需要 ${dep.minGapMinutes} 分钟间隔`;
            }
          }
          break;
      }

      if (violated) {
        violations.push({
          dependency: dep,
          message,
        });
      }
    }

    return violations;
  }

  /**
   * 应用高级约束到候选集
   */
  applyConstraintsToCandidates(
    candidates: ActivityCandidate[],
    constraints: AdvancedConstraints
  ): ActivityCandidate[] {
    // 应用互斥组
    const filtered = this.applyMutexGroups(candidates, constraints);

    // 应用依赖关系（这里简化，实际应该更复杂）
    return filtered;
  }

  private applyMutexGroups(
    candidates: ActivityCandidate[],
    constraints: AdvancedConstraints
  ): ActivityCandidate[] {
    const groupCounts = new Map<string, number>();
    const result: ActivityCandidate[] = [];

    for (const candidate of candidates) {
      const groupId = candidate.alternativeGroupId;
      if (!groupId) {
        result.push(candidate);
        continue;
      }

      const group = constraints.mutexGroups.find(g => g.groupId === groupId);
      if (!group) {
        result.push(candidate);
        continue;
      }

      const maxSelect = group.maxSelect || 1;
      const currentCount = groupCounts.get(groupId) || 0;

      if (currentCount < maxSelect) {
        result.push(candidate);
        groupCounts.set(groupId, currentCount + 1);
      }
    }

    return result;
  }

  private getGroupId(activityId: string): string | null {
    // 简化实现：从 activityId 推断
    // 实际应该从 ActivityCandidate 中获取 alternativeGroupId
    return null;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}

