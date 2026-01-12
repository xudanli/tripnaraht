// src/skills/plan/budget/plan-budget-detect-overrun.skill.ts
/**
 * skill.plan.budget.detectOverrun
 * 
 * 目的：当用户改动路线/住宿档位/交通方式时，实时判断是否超支
 * 
 * System 1 技能：快速检测
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { OverrunDetection, PlanState } from '../shared/plan-state.types';

export interface PlanBudgetDetectOverrunInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
  
  /** 变更内容（可选） */
  changes?: {
    route?: any;
    accommodation?: any;
    transportation?: any;
  };
}

export interface PlanBudgetDetectOverrunOutput extends SkillOutput {
  /** 超支检测结果 */
  overrun: OverrunDetection | null;
}

@Injectable()
export class PlanBudgetDetectOverrunSkill implements Skill<PlanBudgetDetectOverrunInput, PlanBudgetDetectOverrunOutput> {
  private readonly logger = new Logger(PlanBudgetDetectOverrunSkill.name);

  metadata = {
    name: 'plan.budget.detectOverrun',
    description: '实时检测预算是否超支，识别超支来源',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanBudgetDetectOverrunInput): Promise<PlanBudgetDetectOverrunOutput> {
    this.logger.debug(`执行 plan.budget.detectOverrun: planId=${input.planState.plan_id}`);

    try {
      const budgetTotal = input.planState.constraints.budget?.total;
      const budgetBreakdown = input.planState.budget.breakdown;

      if (!budgetTotal || !budgetBreakdown) {
        return {
          overrun: null,
        };
      }

      // 计算总估算
      const totalEstimated = budgetBreakdown.categories.reduce(
        (sum, cat) => sum + cat.estimated,
        0
      );

      // 检测超支
      const overrunAmount = totalEstimated > budgetTotal ? totalEstimated - budgetTotal : 0;

      if (overrunAmount <= 0) {
        return {
          overrun: null,
        };
      }

      // 识别超支来源（Top 3）
      const overrunDrivers = budgetBreakdown.categories
        .map(cat => ({
          category: cat.category,
          amount: cat.estimated,
          percentage: (cat.estimated / totalEstimated) * 100,
          reason: this.getOverrunReason(cat.category, input.planState),
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      return {
        overrun: {
          overrunAmount,
          overrunDrivers,
        },
      };
    } catch (error: any) {
      this.logger.error(`检测超支失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getOverrunReason(category: string, planState: PlanState): string {
    const reasons: Record<string, string> = {
      transportation: `跨城段较多（${planState.mobility.transferSegments.length} 段）或选择了高成本交通方式`,
      accommodation: `住宿档位较高（${planState.constraints.accommodation?.level || '未指定'}）`,
      food: `目的地消费水平较高或天数较多（${planState.constraints.time.days} 天）`,
      tickets: `包含多个付费景点或活动`,
      experiences: `包含特殊体验项目`,
      buffer: `缓冲比例设置较高`,
    };
    return reasons[category] || '该类别预算估算较高';
  }
}
