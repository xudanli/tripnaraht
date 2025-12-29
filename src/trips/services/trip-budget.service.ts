// src/trips/services/trip-budget.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';

export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  dailyBudget: number;
  dailySpent: Record<string, number>;
  categoryBreakdown: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
  };
  warnings: Array<{
    type: 'OVERSPEND' | 'APPROACHING_LIMIT' | 'DAILY_EXCEEDED';
    message: string;
    severity: 'warning' | 'error';
  }>;
}

export interface BudgetAlert {
  type: 'OVERSPEND' | 'APPROACHING_LIMIT' | 'DAILY_EXCEEDED';
  message: string;
  severity: 'warning' | 'error';
  suggestions: string[];
}

@Injectable()
export class TripBudgetService {
  private readonly logger = new Logger(TripBudgetService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取行程预算摘要
   * 
   * @param tripId 行程 ID
   * @returns 预算摘要
   */
  async getBudgetSummary(tripId: string): Promise<BudgetSummary> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const budgetConfig = (trip.budgetConfig as any) || {};
    const totalBudget = budgetConfig.totalBudget || budgetConfig.total || 0;
    const currency = budgetConfig.currency || 'CNY';

    // 计算已消费金额（从行程项中提取）
    let totalSpent = 0;
    const dailySpent: Record<string, number> = {};
    const categoryBreakdown = {
      accommodation: 0,
      transportation: 0,
      food: 0,
      activities: 0,
      other: 0,
    };

    for (const day of trip.TripDay) {
      const dateKey = DateTime.fromJSDate(day.date).toISODate() || '';
      dailySpent[dateKey] = 0;

      for (const item of day.ItineraryItem) {
        // 从 Place 的 metadata 中提取价格信息
        const placeMetadata = (item.Place?.metadata as any) || {};
        const cost = placeMetadata.cost || placeMetadata.price || 0;
        const category = item.Place?.category || 'other';

        totalSpent += cost;
        dailySpent[dateKey] += cost;

        // 分类统计
        if (category === 'HOTEL') {
          categoryBreakdown.accommodation += cost;
        } else if (category === 'RESTAURANT') {
          categoryBreakdown.food += cost;
        } else if (category === 'ATTRACTION') {
          categoryBreakdown.activities += cost;
        } else if (category === 'TRANSIT_HUB') {
          categoryBreakdown.transportation += cost;
        } else {
          categoryBreakdown.other += cost;
        }
      }
    }

    // 计算每日预算
    const start = DateTime.fromJSDate(trip.startDate);
    const end = DateTime.fromJSDate(trip.endDate);
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
    const dailyBudget = durationDays > 0 ? totalBudget / durationDays : 0;

    // 生成警告
    const warnings: BudgetSummary['warnings'] = [];
    const remaining = totalBudget - totalSpent;
    const overspendRatio = totalSpent / totalBudget;

    if (overspendRatio > 1.0) {
      warnings.push({
        type: 'OVERSPEND',
        message: `预算已超支 ${((overspendRatio - 1) * 100).toFixed(1)}%`,
        severity: 'error',
      });
    } else if (overspendRatio > 0.9) {
      warnings.push({
        type: 'APPROACHING_LIMIT',
        message: `预算使用率已达 ${(overspendRatio * 100).toFixed(1)}%，接近预算上限`,
        severity: 'warning',
      });
    }

    // 检查每日超支
    for (const [date, spent] of Object.entries(dailySpent)) {
      if (spent > dailyBudget * 1.2) {
        warnings.push({
          type: 'DAILY_EXCEEDED',
          message: `${date} 当日消费 ${spent.toFixed(2)} ${currency}，超出每日预算 ${((spent / dailyBudget - 1) * 100).toFixed(1)}%`,
          severity: 'warning',
        });
      }
    }

    return {
      totalBudget,
      totalSpent,
      remaining,
      dailyBudget,
      dailySpent,
      categoryBreakdown,
      warnings,
    };
  }

  /**
   * 检查预算并生成预警
   * 
   * @param tripId 行程 ID
   * @param newItemCost 新增项的成本
   * @returns 预算预警（如果有）
   */
  async checkBudgetAlert(
    tripId: string,
    newItemCost: number
  ): Promise<BudgetAlert | null> {
    const summary = await this.getBudgetSummary(tripId);
    const projectedTotal = summary.totalSpent + newItemCost;
    const projectedRatio = projectedTotal / summary.totalBudget;

    if (projectedRatio > 1.0) {
      return {
        type: 'OVERSPEND',
        message: `添加此项将导致预算超支 ${((projectedRatio - 1) * 100).toFixed(1)}%`,
        severity: 'error',
        suggestions: [
          '移除其他可选活动',
          '选择更便宜的替代方案',
          '调整其他天的预算分配',
        ],
      };
    } else if (projectedRatio > 0.9) {
      return {
        type: 'APPROACHING_LIMIT',
        message: `添加此项后预算使用率将达 ${(projectedRatio * 100).toFixed(1)}%`,
        severity: 'warning',
        suggestions: [
          '考虑选择更便宜的替代方案',
          '调整其他天的活动安排',
        ],
      };
    }

    return null;
  }

  /**
   * 获取预算优化建议
   * 
   * @param tripId 行程 ID
   * @param category 消费类别
   * @returns 优化建议
   */
  async getBudgetOptimizationSuggestions(
    tripId: string,
    category?: string
  ): Promise<Array<{
    type: 'REPLACE' | 'REMOVE' | 'RESCHEDULE';
    message: string;
    itemId?: string;
    itemName?: string;
    estimatedSavings: number;
  }>> {
    const summary = await this.getBudgetSummary(tripId);
    const suggestions: Array<{
      type: 'REPLACE' | 'REMOVE' | 'RESCHEDULE';
      message: string;
      itemId?: string;
      itemName?: string;
      estimatedSavings: number;
    }> = [];

    // 如果预算超支，建议移除最贵的可选活动
    if (summary.totalSpent > summary.totalBudget) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
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
          },
        },
      });

      if (trip) {
        // 找出最贵的活动
        const items = trip.TripDay.flatMap(day => day.ItineraryItem);
        const itemsWithCost = items
          .map(item => {
            const placeMetadata = (item.Place?.metadata as any) || {};
            const cost = placeMetadata.cost || placeMetadata.price || 0;
            return {
              itemId: item.id,
              itemName: item.Place?.nameCN || item.Place?.nameEN || '未知',
              cost,
            };
          })
          .filter(item => item.cost > 0)
          .sort((a, b) => b.cost - a.cost);

        if (itemsWithCost.length > 0) {
          const topExpensive = itemsWithCost[0];
          suggestions.push({
            type: 'REMOVE',
            message: `移除 "${topExpensive.itemName}" 可节省约 ${topExpensive.cost.toFixed(2)} 元`,
            itemId: topExpensive.itemId,
            itemName: topExpensive.itemName,
            estimatedSavings: topExpensive.cost,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 生成预算执行分析报告
   * 
   * @param tripId 行程 ID
   * @returns 预算分析报告
   */
  async generateBudgetReport(tripId: string): Promise<{
    summary: BudgetSummary;
    trends: {
      dailySpending: Array<{ date: string; budget: number; spent: number; ratio: number }>;
      categoryDistribution: Record<string, number>;
    };
    recommendations: string[];
  }> {
    const summary = await this.getBudgetSummary(tripId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 生成每日消费趋势
    const start = DateTime.fromJSDate(trip.startDate);
    const end = DateTime.fromJSDate(trip.endDate);
    const dailySpending = [];
    
    for (let i = 0; i <= Math.floor(end.diff(start, 'days').days); i++) {
      const date = start.plus({ days: i });
      const dateKey = date.toISODate() || '';
      const spent = summary.dailySpent[dateKey] || 0;
      
      dailySpending.push({
        date: dateKey,
        budget: summary.dailyBudget,
        spent,
        ratio: summary.dailyBudget > 0 ? spent / summary.dailyBudget : 0,
      });
    }

    // 计算类别分布
    const total = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
    const categoryDistribution: Record<string, number> = {};
    for (const [key, value] of Object.entries(summary.categoryBreakdown)) {
      categoryDistribution[key] = total > 0 ? value / total : 0;
    }

    // 生成建议
    const recommendations: string[] = [];
    if (summary.totalSpent > summary.totalBudget) {
      recommendations.push('预算已超支，建议减少后续活动的消费');
    }
    if (summary.categoryBreakdown.food / summary.totalSpent > 0.4) {
      recommendations.push('餐饮消费占比偏高，可考虑选择更经济的餐厅');
    }
    if (summary.categoryBreakdown.activities / summary.totalSpent < 0.2) {
      recommendations.push('活动消费占比偏低，可适当增加体验类活动');
    }

    return {
      summary,
      trends: {
        dailySpending,
        categoryDistribution,
      },
      recommendations,
    };
  }
}

