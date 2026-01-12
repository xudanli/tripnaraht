// src/skills/detail/detail-understand-status.skill.ts
/**
 * skill.detail.understandStatus
 * 
 * 目的：理解当前行程状态（规划中/进行中/已完成）
 * 
 * System 1 技能：快速理解状态
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripStatusUnderstanding } from './shared/detail-state.types';

export interface DetailUnderstandStatusInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 行程数据（可选，如果不提供则从数据库查询） */
  tripData?: any;
}

export interface DetailUnderstandStatusOutput extends SkillOutput {
  /** 状态理解 */
  statusUnderstanding: TripStatusUnderstanding;
}

@Injectable()
export class DetailUnderstandStatusSkill implements Skill<DetailUnderstandStatusInput, DetailUnderstandStatusOutput> {
  private readonly logger = new Logger(DetailUnderstandStatusSkill.name);

  metadata = {
    name: 'detail.understandStatus',
    description: '理解当前行程状态（规划中/进行中/已完成），识别下一步行动和风险',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailUnderstandStatusInput): Promise<DetailUnderstandStatusOutput> {
    this.logger.debug(`执行 detail.understandStatus: tripId=${input.tripId}`);

    try {
      // TODO: 从数据库查询行程数据
      const tripData = input.tripData || {};
      
      // 判断当前阶段
      const now = new Date();
      const startDate = tripData.startDate ? new Date(tripData.startDate) : null;
      const endDate = tripData.endDate ? new Date(tripData.endDate) : null;
      
      let currentPhase: TripStatusUnderstanding['currentPhase'] = 'PLANNING';
      if (startDate && endDate) {
        if (now < startDate) {
          currentPhase = 'PLANNING';
        } else if (now >= startDate && now <= endDate) {
          currentPhase = 'IN_PROGRESS';
        } else {
          currentPhase = 'COMPLETED';
        }
      }

      // 计算进度
      const totalItems = tripData.days?.reduce((sum: number, day: any) => sum + (day.items?.length || 0), 0) || 0;
      const completedItems = tripData.days?.reduce((sum: number, day: any) => {
        return sum + (day.items?.filter((item: any) => item.completed).length || 0);
      }, 0) || 0;
      
      const progress = {
        completed: completedItems,
        total: totalItems,
        percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      };

      // 识别下一步行动
      const nextSteps: TripStatusUnderstanding['nextSteps'] = [];
      if (currentPhase === 'PLANNING') {
        nextSteps.push({
          step: '确认行程细节',
          priority: 'high',
        });
        nextSteps.push({
          step: '准备行前清单',
          priority: 'medium',
        });
      } else if (currentPhase === 'IN_PROGRESS') {
        nextSteps.push({
          step: '查看今日行程',
          priority: 'high',
        });
        nextSteps.push({
          step: '确认交通安排',
          priority: 'medium',
        });
      }

      // 识别风险
      const risks: TripStatusUnderstanding['risks'] = [];
      // TODO: 从决策日志中提取风险

      // 识别机会
      const opportunities: TripStatusUnderstanding['opportunities'] = [];
      // TODO: 分析优化机会

      const statusUnderstanding: TripStatusUnderstanding = {
        currentPhase,
        progress,
        nextSteps,
        risks,
        opportunities,
      };

      return {
        statusUnderstanding,
      };
    } catch (error: any) {
      this.logger.error(`理解状态失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
