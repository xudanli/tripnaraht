// src/skills/detail/detail-analyze-health.skill.ts
/**
 * skill.detail.analyzeHealth
 * 
 * 目的：分析行程健康度（时间、预算、节奏、可达性）
 * 
 * System 1 技能：快速分析
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripHealth } from './shared/detail-state.types';

export interface DetailAnalyzeHealthInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 行程数据（可选） */
  tripData?: any;
  
  /** PlanState（可选，如果有） */
  planState?: any;
}

export interface DetailAnalyzeHealthOutput extends SkillOutput {
  /** 健康度分析 */
  health: TripHealth;
}

@Injectable()
export class DetailAnalyzeHealthSkill implements Skill<DetailAnalyzeHealthInput, DetailAnalyzeHealthOutput> {
  private readonly logger = new Logger(DetailAnalyzeHealthSkill.name);

  metadata = {
    name: 'detail.analyzeHealth',
    description: '分析行程健康度（时间、预算、节奏、可达性），识别问题和风险',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailAnalyzeHealthInput): Promise<DetailAnalyzeHealthOutput> {
    this.logger.debug(`执行 detail.analyzeHealth: tripId=${input.tripId}`);

    try {
      // 分析各个维度
      const schedule = this.analyzeSchedule(input.tripData, input.planState);
      const budget = this.analyzeBudget(input.tripData, input.planState);
      const pace = this.analyzePace(input.tripData, input.planState);
      const feasibility = this.analyzeFeasibility(input.tripData, input.planState);

      // 计算总体健康度
      const scores = [schedule.score, budget.score, pace.score, feasibility.score];
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      let overall: TripHealth['overall'] = 'healthy';
      if (avgScore < 50) {
        overall = 'critical';
      } else if (avgScore < 70) {
        overall = 'warning';
      }

      const health: TripHealth = {
        overall,
        dimensions: {
          schedule,
          budget,
          pace,
          feasibility,
        },
      };

      return {
        health,
      };
    } catch (error: any) {
      this.logger.error(`分析健康度失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private analyzeSchedule(tripData: any, planState: any): TripHealth['dimensions']['schedule'] {
    const issues: string[] = [];
    let score = 100;

    // 检查时间冲突
    // TODO: 从 tripData 中检查时间冲突

    // 检查时间窗
    if (planState?.pace?.timeWindows) {
      const insufficientDays = planState.pace.timeWindows.filter((tw: any) => {
        const start = parseInt(tw.start.split(':')[0]);
        const end = parseInt(tw.end.split(':')[0]);
        return (end - start) < 6;
      }).length;
      
      if (insufficientDays > 0) {
        issues.push(`${insufficientDays} 天可用时间不足`);
        score -= insufficientDays * 10;
      }
    }

    const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
    return { status, score: Math.max(0, score), issues };
  }

  private analyzeBudget(tripData: any, planState: any): TripHealth['dimensions']['budget'] {
    const issues: string[] = [];
    let score = 100;

    // 检查预算超支
    if (planState?.budget?.overrun) {
      const overrunRatio = planState.budget.overrun.overrunAmount / (planState.constraints.budget?.total || 1);
      if (overrunRatio > 0.2) {
        issues.push(`预算超支 ${Math.round(overrunRatio * 100)}%`);
        score -= 50;
      } else if (overrunRatio > 0.1) {
        issues.push(`预算超支 ${Math.round(overrunRatio * 100)}%`);
        score -= 30;
      }
    }

    const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
    return { status, score: Math.max(0, score), issues };
  }

  private analyzePace(tripData: any, planState: any): TripHealth['dimensions']['pace'] {
    const issues: string[] = [];
    let score = 100;

    // 检查疲劳评分
    if (planState?.pace?.fatigueScore) {
      const fatigueScore = planState.pace.fatigueScore.paceScore;
      if (fatigueScore > 85) {
        issues.push(`疲劳评分过高: ${fatigueScore}/100`);
        score -= 40;
      } else if (fatigueScore > 70) {
        issues.push(`疲劳评分略高: ${fatigueScore}/100`);
        score -= 20;
      }
    }

    const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
    return { status, score: Math.max(0, score), issues };
  }

  private analyzeFeasibility(tripData: any, planState: any): TripHealth['dimensions']['feasibility'] {
    const issues: string[] = [];
    let score = 100;

    // 检查不可达段
    if (planState?.mobility?.transferSegments) {
      const infeasibleCount = planState.mobility.transferSegments.filter(
        (seg: any) => seg.feasibility === 'infeasible'
      ).length;
      
      if (infeasibleCount > 0) {
        issues.push(`${infeasibleCount} 段不可达`);
        score -= infeasibleCount * 30;
      }
    }

    const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
    return { status, score: Math.max(0, score), issues };
  }
}
