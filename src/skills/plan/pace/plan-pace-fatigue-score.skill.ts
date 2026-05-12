// src/skills/plan/pace/plan-pace-fatigue-score.skill.ts
/**
 * skill.plan.pace.fatigueScore
 * 
 * 目的：疲劳与节奏评分（连续早起、长距离移动、累计爬升/步行）
 * 
 * System 1 技能：快速评分
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, FatigueScore } from '../shared/plan-state.types';

export interface PlanPaceFatigueScoreInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
}

export interface PlanPaceFatigueScoreOutput extends SkillOutput {
  /** 疲劳评分 */
  fatigueScore: FatigueScore;
}

@Injectable()
export class PlanPaceFatigueScoreSkill implements Skill<PlanPaceFatigueScoreInput, PlanPaceFatigueScoreOutput> {
  private readonly logger = new Logger(PlanPaceFatigueScoreSkill.name);

  metadata = {
    name: 'plan.pace.fatigueScore',
    description: '计算疲劳与节奏评分（连续早起、长距离移动、累计爬升/步行）',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanPaceFatigueScoreInput): Promise<PlanPaceFatigueScoreOutput> {
    this.logger.debug(`执行 plan.pace.fatigueScore: planId=${input.planState.plan_id}`);

    try {
      const days = input.planState.constraints.time.days;
      const transferSegments = input.planState.mobility.transferSegments;
      
      // 计算疲劳驱动因素
      const fatigueDrivers: FatigueScore['fatigueDrivers'] = [];
      let totalScore = 0;
      
      // 1. 检查连续早起（如果有早于 7:00 的开始时间）
      const earlyMornings = input.planState.pace.timeWindows?.filter(
        tw => parseInt(tw.start.split(':')[0]) < 7
      ).length || 0;
      
      if (earlyMornings > 0) {
        const severity = Math.min(earlyMornings * 20, 100);
        fatigueDrivers.push({
          type: 'early_morning',
          severity,
          description: `${earlyMornings} 天需要早起`,
        });
        totalScore += severity * 0.2;
      }
      
      // 2. 检查长距离移动
      const longTransfers = transferSegments.filter(seg => {
        // 简化：假设超过 4 小时的移动为长距离
        return seg.availableModes?.some(m => m.time > 240) || false;
      }).length;
      
      if (longTransfers > 0) {
        const severity = Math.min(longTransfers * 25, 100);
        fatigueDrivers.push({
          type: 'long_transfer',
          severity,
          description: `${longTransfers} 段长距离移动`,
        });
        totalScore += severity * 0.3;
      }
      
      // 3. 检查累计爬升（如果有 DEM 数据）
      // 这里简化处理，实际应该从 world.physical 获取
      if (input.planState.world?.physical) {
        // 可以调用 skill dem.get_profile（Registry）获取爬升数据
        // 这里简化
      }
      
      // 计算最终评分（0-100，越高越疲劳）
      const paceScore = Math.min(totalScore, 100);
      
      // 建议休息点
      const suggestedRestPoints: FatigueScore['suggestedRestPoints'] = [];
      if (paceScore > 60) {
        // 如果疲劳评分高，建议在中间插入休息日
        const restDay = Math.floor(days / 2);
        suggestedRestPoints.push({
          day: restDay,
          reason: '疲劳评分较高，建议在此日安排轻松活动或休息',
        });
      }
      
      return {
        fatigueScore: {
          paceScore,
          fatigueDrivers,
          suggestedRestPoints,
        },
      };
    } catch (error: any) {
      this.logger.error(`计算疲劳评分失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
