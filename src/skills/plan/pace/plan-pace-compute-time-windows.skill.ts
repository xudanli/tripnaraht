// src/skills/plan/pace/plan-pace-compute-time-windows.skill.ts
/**
 * skill.plan.pace.computeTimeWindows
 * 
 * 目的：把每天的可用时间窗算清楚（入住退房、交通耗时、缓冲）
 * 
 * System 1 技能：快速计算
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, TimeWindow } from '../shared/plan-state.types';

export interface PlanPaceComputeTimeWindowsInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 缓冲策略 */
  bufferPolicy?: 'conservative' | 'standard' | 'aggressive';
}

export interface PlanPaceComputeTimeWindowsOutput extends SkillOutput {
  /** 时间窗列表 */
  timeWindows: TimeWindow[];
}

@Injectable()
export class PlanPaceComputeTimeWindowsSkill implements Skill<PlanPaceComputeTimeWindowsInput, PlanPaceComputeTimeWindowsOutput> {
  private readonly logger = new Logger(PlanPaceComputeTimeWindowsSkill.name);

  metadata = {
    name: 'plan.pace.computeTimeWindows',
    description: '计算 plan 每日可用 time windows（入住退房、交通、缓冲）。在 pace 评估或 architect 排程前需时间窗约束时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanPaceComputeTimeWindowsInput): Promise<PlanPaceComputeTimeWindowsOutput> {
    this.logger.debug(`执行 plan.pace.computeTimeWindows: planId=${input.planState.plan_id}`);

    try {
      const days = this.resolvePlanDays(input.planState);
      const bufferPolicy = input.bufferPolicy || 'standard';
      const availableHoursPerDay =
        input.planState.constraints?.time?.availableHoursPerDay ?? 10;
      
      // 计算每天的时间窗
      const timeWindows: TimeWindow[] = [];
      
      for (let day = 1; day <= days; day++) {
        // 默认时间窗：9:00 - 19:00（10小时）
        // 实际应该考虑入住退房时间、交通耗时等
        const startHour = 9;
        const endHour = startHour + availableHoursPerDay;
        
        // 检查是否有移动日
        const hasTransfer = input.planState.mobility.transferSegments.some(
          seg => seg.from.city && seg.to.city // 简化判断
        );
        
        // 如果有移动日，减少可用时间
        let actualStart = startHour;
        let actualEnd = endHour;
        
        if (hasTransfer) {
          // 移动日通常需要 2-4 小时用于交通
          const transferHours = bufferPolicy === 'conservative' ? 4 : 
                               bufferPolicy === 'aggressive' ? 2 : 3;
          actualStart += transferHours;
        }
        
        // 应用缓冲策略
        const bufferHours = bufferPolicy === 'conservative' ? 2 : 
                           bufferPolicy === 'aggressive' ? 0.5 : 1;
        actualEnd -= bufferHours;
        
        timeWindows.push({
          day,
          start: `${String(actualStart).padStart(2, '0')}:00`,
          end: `${String(actualEnd).padStart(2, '0')}:00`,
          bufferPolicy,
        });
      }

      return {
        timeWindows,
      };
    } catch (error: any) {
      this.logger.error(`计算时间窗失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private resolvePlanDays(planState: PlanState): number {
    const days = planState.constraints?.time?.days;
    if (typeof days === 'number' && days > 0) {
      return days;
    }
    const fromSegments = planState.itinerary?.segments?.length ?? 0;
    return fromSegments > 0 ? fromSegments : 1;
  }
}
