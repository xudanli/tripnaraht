// src/skills/trip/trip-quick-evaluate.skill.ts
/**
 * skill.trip.quickEvaluate
 * 
 * 用途：对一个 trip 做「体检」，输出一套统一的打分与告警。
 * 
 * 输入：tripId
 * 输出：scores + warnings[] + suggestedFixes[]
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { TripMetricsService } from '../../trips/services/trip-metrics.service';
import { TripConflictsService } from '../../trips/services/trip-conflicts.service';
import { DateTime } from 'luxon';

export interface TripQuickEvaluateInput extends SkillInput {
  /** 行程 ID */
  tripId: string;
}

export interface TripQuickEvaluateOutput extends SkillOutput {
  /** 评分（0-100） */
  scores: {
    safety: number; // 安全性评分
    pacing: number; // 节奏评分
    executability: number; // 可执行性评分
    diversity: number; // 多样性评分
  };
  /** 警告列表 */
  warnings: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    affectedDays?: string[];
    affectedItemIds?: string[];
  }>;
  /** 建议修复 */
  suggestedFixes: Array<{
    issue: string;
    fixType: 'DR_DRE_PACE' | 'NEPTUNE_REPLACE' | 'MANUAL_ADJUST';
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

@Injectable()
export class TripQuickEvaluateSkill implements Skill<TripQuickEvaluateInput, TripQuickEvaluateOutput> {
  private readonly logger = new Logger(TripQuickEvaluateSkill.name);

  metadata = {
    name: 'trip.quickEvaluate',
    description: '对行程进行快速体检，输出统一的评分、警告和修复建议',
    version: '1.0.0',
    category: 'analytics' as const,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripMetricsService: TripMetricsService,
    private readonly tripConflictsService: TripConflictsService,
  ) {}

  async execute(input: TripQuickEvaluateInput): Promise<TripQuickEvaluateOutput> {
    this.logger.debug(`执行 trip.quickEvaluate: tripId=${input.tripId}`);

    try {
      // 1. 获取行程数据
      const trip = await this.prisma.trip.findUnique({
        where: { id: input.tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: true,
                },
                orderBy: {
                  startTime: 'asc',
                },
              },
            },
            orderBy: {
              date: 'asc',
            },
          },
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程不存在: ${input.tripId}`);
      }

      // 2. 获取指标和冲突
      const metrics = await this.tripMetricsService.getTripMetrics(input.tripId);
      const conflicts = await this.tripConflictsService.getConflicts(input.tripId);

      // 3. 计算评分
      const scores = this.calculateScores(trip, metrics, conflicts);

      // 4. 生成警告
      const warnings = this.generateWarnings(trip, metrics, conflicts);

      // 5. 生成修复建议
      const suggestedFixes = this.generateSuggestedFixes(warnings, conflicts);

      return {
        scores,
        warnings,
        suggestedFixes,
      };
    } catch (error: any) {
      this.logger.error(`行程体检失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private calculateScores(trip: any, metrics: any, conflicts: any): TripQuickEvaluateOutput['scores'] {
    // 1. 安全性评分（基于冲突的严重程度）
    const highSeverityConflicts = conflicts.conflicts.filter((c: any) => c.severity === 'HIGH').length;
    const safetyScore = Math.max(0, 100 - highSeverityConflicts * 20 - conflicts.total * 5);

    // 2. 节奏评分（基于疲劳指数和缓冲时间）
    const avgFatigue = metrics.summary.totalFatigue / (trip.TripDay.length || 1);
    const pacingScore = Math.max(0, 100 - (avgFatigue / 100) * 50 - (metrics.summary.totalBuffer < 60 ? 20 : 0));

    // 3. 可执行性评分（基于时间冲突和缓冲不足）
    const timeConflicts = conflicts.conflicts.filter((c: any) => c.type === 'TIME_CONFLICT').length;
    const bufferIssues = conflicts.conflicts.filter((c: any) => c.type === 'BUFFER_INSUFFICIENT').length;
    const executabilityScore = Math.max(0, 100 - timeConflicts * 30 - bufferIssues * 10);

    // 4. 多样性评分（基于活动类型和分布）
    const diversityScore = this.calculateDiversityScore(trip);

    return {
      safety: Math.round(safetyScore),
      pacing: Math.round(pacingScore),
      executability: Math.round(executabilityScore),
      diversity: Math.round(diversityScore),
    };
  }

  private calculateDiversityScore(trip: any): number {
    const activityTypes = new Set<string>();
    const categories = new Set<string>();
    let totalActivities = 0;

    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        totalActivities++;
        if (item.Place?.category) {
          categories.add(item.Place.category);
        }
        // 从 metadata 提取活动类型
        const metadata = item.Place?.metadata as any;
        if (metadata?.type) {
          activityTypes.add(metadata.type);
        }
      }
    }

    if (totalActivities === 0) return 0;

    // 多样性 = (类型数 / 总活动数) * 权重
    const typeDiversity = (activityTypes.size / Math.max(1, totalActivities)) * 50;
    const categoryDiversity = (categories.size / Math.max(1, totalActivities)) * 50;

    return Math.min(100, typeDiversity + categoryDiversity);
  }

  private generateWarnings(trip: any, metrics: any, conflicts: any): TripQuickEvaluateOutput['warnings'] {
    const warnings: TripQuickEvaluateOutput['warnings'] = [];

    // 1. 从冲突中提取警告
    for (const conflict of conflicts.conflicts) {
      warnings.push({
        type: conflict.type,
        severity: conflict.severity.toLowerCase() as 'high' | 'medium' | 'low',
        message: conflict.description,
        affectedDays: conflict.affectedDays,
        affectedItemIds: conflict.affectedItemIds,
      });
    }

    // 2. 检测连续行车时间过长
    for (let i = 0; i < trip.TripDay.length - 1; i++) {
      const day1 = trip.TripDay[i];
      const day2 = trip.TripDay[i + 1];

      const day1Metrics = metrics.days?.find((d: any) => d.date === DateTime.fromJSDate(day1.date).toISODate());
      const day2Metrics = metrics.days?.find((d: any) => d.date === DateTime.fromJSDate(day2.date).toISODate());
      const day1Drive = day1Metrics?.metrics?.drive || 0;
      const day2Drive = day2Metrics?.metrics?.drive || 0;

      if (day1Drive + day2Drive > 480) { // 超过 8 小时
        warnings.push({
          type: 'CONSECUTIVE_LONG_DRIVE',
          severity: 'high',
          message: `D${i + 1} 与 D${i + 2} 总行车时长过长（${Math.round((day1Drive + day2Drive) / 60)} 小时），建议拆分或增加休息`,
          affectedDays: [
            DateTime.fromJSDate(day1.date).toISODate() || '',
            DateTime.fromJSDate(day2.date).toISODate() || '',
          ],
        });
      }
    }

    // 3. 检测某日行程全是 transit
    for (let i = 0; i < trip.TripDay.length; i++) {
      const day = trip.TripDay[i];
      const allTransit = day.ItineraryItem.every((item: any) => {
        const metadata = item.Place?.metadata as any;
        return metadata?.type === 'transit' || item.Place?.category === 'TRANSIT';
      });

      if (allTransit && day.ItineraryItem.length > 0) {
        warnings.push({
          type: 'ALL_TRANSIT_DAY',
          severity: 'medium',
          message: `D${i + 1} 行程全是中转/交通，没有实际游览活动`,
          affectedDays: [DateTime.fromJSDate(day.date).toISODate() || ''],
          affectedItemIds: day.ItineraryItem.map((item: any) => item.id),
        });
      }
    }

    return warnings;
  }

  private generateSuggestedFixes(
    warnings: TripQuickEvaluateOutput['warnings'],
    conflicts: any
  ): TripQuickEvaluateOutput['suggestedFixes'] {
    const fixes: TripQuickEvaluateOutput['suggestedFixes'] = [];

    // 从警告和冲突中提取修复建议
    for (const warning of warnings) {
      if (warning.type === 'FATIGUE_EXCEEDED' || warning.type === 'CONSECUTIVE_LONG_DRIVE') {
        fixes.push({
          issue: warning.message,
          fixType: 'DR_DRE_PACE',
          description: '使用 Dr.Dre 策略调整行程节奏，拆分密集活动或插入缓冲时间',
          priority: warning.severity,
        });
      } else if (warning.type === 'CLOSURE_RISK' || warning.type === 'ALL_TRANSIT_DAY') {
        fixes.push({
          issue: warning.message,
          fixType: 'NEPTUNE_REPLACE',
          description: '使用 Neptune 策略替换不可用的路段或 POI，保持路线核心风格',
          priority: warning.severity,
        });
      } else if (warning.type === 'TIME_CONFLICT' || warning.type === 'BUFFER_INSUFFICIENT') {
        fixes.push({
          issue: warning.message,
          fixType: 'MANUAL_ADJUST',
          description: '需要手动调整活动时间，解决时间冲突或增加缓冲',
          priority: warning.severity,
        });
      }
    }

    // 去重
    const uniqueFixes = fixes.filter((fix, index, self) =>
      index === self.findIndex(f => f.issue === fix.issue && f.fixType === fix.fixType)
    );

    return uniqueFixes.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

