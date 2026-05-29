// src/skills/detail/detail-analyze-health.skill.ts
/**
 * skill.detail.analyzeHealth
 * 
 * 目的：分析行程健康度（时间、预算、节奏、可达性）
 * 
 * System 1 技能：快速分析
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TripHealth } from './shared/detail-state.types';
import { TripConflictsService } from '../../trips/services/trip-conflicts.service';
import { ConflictType, ConflictSeverity } from '../../trips/dto/trip-conflicts.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { loadDetailTripData } from './utils/detail-data.util';

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

  constructor(
    @Optional() private readonly tripConflictsService?: TripConflictsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  metadata = {
    name: 'detail.analyzeHealth',
    description: 'detail.analyzeHealth：分析 itinerary 健康度（时间/预算/节奏/可达性）并列出风险。在用户查看行程详情或 execution 前需体检摘要时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailAnalyzeHealthInput): Promise<DetailAnalyzeHealthOutput> {
    this.logger.debug(`执行 detail.analyzeHealth: tripId=${input.tripId}`);

    let tripData = input.tripData;
    if (!tripData && this.prisma) {
      const loaded = await loadDetailTripData(this.prisma, input.tripId);
      if (loaded) {
        tripData = loaded;
      }
    }
    tripData = tripData ?? {};

    const dimensionWeights = {
        schedule: 0.30,    // 时间安排最重要
        budget: 0.25,      // 预算次重要
        pace: 0.25,        // 节奏同样重要
        feasibility: 0.20  // 可达性相对次要（因为可以调整）
      };

      // 分析各个维度
      const schedule = {
        ...(await this.analyzeSchedule(input.tripId, tripData, input.planState)),
        weight: dimensionWeights.schedule,
      };
      const budget = {
        ...this.analyzeBudget(tripData, input.planState),
        weight: dimensionWeights.budget,
      };
      const pace = {
        ...this.analyzePace(tripData, input.planState),
        weight: dimensionWeights.pace,
      };
      const feasibility = {
        ...this.analyzeFeasibility(tripData, input.planState),
        weight: dimensionWeights.feasibility,
      };

      // 计算总体健康度（加权平均）
      // 决策：使用加权平均，根据各维度重要性计算总体健康度
      // 参考：.claude/product-decisions/trip-detail-page-key-decisions.md
      // 权重：schedule(0.30), budget(0.25), pace(0.25), feasibility(0.20)
      const overallScore = 
        schedule.score * dimensionWeights.schedule +
        budget.score * dimensionWeights.budget +
        pace.score * dimensionWeights.pace +
        feasibility.score * dimensionWeights.feasibility;
      
      let overall: TripHealth['overall'] = 'healthy';
      if (overallScore < 50) {
        overall = 'critical';
      } else if (overallScore < 70) {
        overall = 'warning';
      }

      const health: TripHealth = {
        overall,
        overallScore: Math.round(overallScore), // 添加总体健康度分数（0-100），用于前端显示百分比
        dimensions: {
          schedule,
          budget,
          pace,
          feasibility,
        },
      };

      return { health };
  }

  private async analyzeSchedule(
    tripId: string,
    tripData: any,
    planState: any
  ): Promise<TripHealth['dimensions']['schedule']> {
    const issues: string[] = [];
    let score = 100;

    // 检查时间冲突（使用 TripConflictsService）
    if (this.tripConflictsService) {
      try {
        const conflictsResult = await this.tripConflictsService.getConflicts(tripId);
        const timeConflicts = conflictsResult.conflicts.filter(
          c => c.type === ConflictType.TIME_CONFLICT
        );

        if (timeConflicts.length > 0) {
          // 根据时间冲突数量和严重程度扣分（方案C：差异化扣分）
          // HIGH（红线）级别: 每个扣 25 分
          // MEDIUM（警告）级别: 每个扣 15 分
          // LOW（信息）级别: 每个扣 5 分
          // 最大扣分: 90 分
          const conflictPenalty = timeConflicts.reduce((sum, conflict) => {
            if (conflict.severity === ConflictSeverity.HIGH) {
              return sum + 25;  // 红线级别，严重问题
            } else if (conflict.severity === ConflictSeverity.MEDIUM) {
              return sum + 15;  // 警告级别，中等问题
            } else {
              return sum + 5;   // 信息级别，轻微问题
            }
          }, 0);
          const finalPenalty = Math.min(conflictPenalty, 90); // 最多扣90分
          score -= finalPenalty;
          
          // 添加问题描述
          if (timeConflicts.length === 1) {
            issues.push(`1 个时间冲突：${timeConflicts[0].description}`);
          } else {
            issues.push(`${timeConflicts.length} 个时间冲突`);
            // 添加前3个冲突的详细描述
            timeConflicts.slice(0, 3).forEach(conflict => {
              issues.push(`- ${conflict.description}`);
            });
            if (timeConflicts.length > 3) {
              issues.push(`... 还有 ${timeConflicts.length - 3} 个时间冲突`);
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`获取时间冲突失败: ${error.message}`);
        // 如果获取失败，不影响其他检查
      }
    } else {
      this.logger.warn('TripConflictsService 未注入，无法检查时间冲突');
    }

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
