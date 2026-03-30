// src/trips/services/trip-budget.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

export interface BudgetConstraint {
  total: number;
  currency: string;
  dailyBudget?: number;
  categoryLimits?: {
    accommodation?: number;
    transportation?: number;
    food?: number;
    activities?: number;
    other?: number;
  };
  alertThreshold?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetDetailsItem {
  id: string;
  date: string;
  category: string;
  itemName: string;
  amount: number;
  currency: string;
  itineraryItemId?: string;
  evidenceRefs?: string[];
}

export interface BudgetTrendsResponse {
  dailySpending: Array<{
    date: string;
    budget: number;
    spent: number;
    ratio: number;
  }>;
  categoryDistribution: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
  };
  forecast?: {
    projectedTotal: number;
    projectedRemaining: number;
    confidence: number;
  };
}

export interface BudgetStatisticsResponse {
  completionRate: number;
  overspendRate: number;
  categoryPercentages: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
  };
  dailyAverage: number;
  projectedCompletion: string;
  riskLevel: 'low' | 'medium' | 'high';
}

@Injectable()
export class TripBudgetService {
  private readonly logger = new Logger(TripBudgetService.name);
  private readonly SUPPORTED_CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY'];
  private readonly MIN_BUDGET = 100;
  private readonly MAX_BUDGET = 1000000;
  private readonly DEFAULT_ALERT_THRESHOLD = 0.8;

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
    _category?: string
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

  /**
   * 设置预算约束
   * 
   * @param tripId 行程 ID
   * @param constraint 预算约束
   * @returns 预算约束
   */
  async setBudgetConstraint(
    tripId: string,
    constraint: {
      total?: number;
      currency?: string;
      dailyBudget?: number;
      categoryLimits?: {
        accommodation?: number;
        transportation?: number;
        food?: number;
        activities?: number;
        other?: number;
      };
      alertThreshold?: number;
    }
  ): Promise<BudgetConstraint> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 验证总预算
    if (constraint.total !== undefined) {
      if (constraint.total < this.MIN_BUDGET || constraint.total > this.MAX_BUDGET) {
        throw new BadRequestException(
          `预算范围必须在 ${this.MIN_BUDGET} - ${this.MAX_BUDGET} ${constraint.currency || 'CNY'} 之间`
        );
      }
    }

    // 验证货币单位
    const currency = constraint.currency || 'CNY';
    if (!this.SUPPORTED_CURRENCIES.includes(currency)) {
      throw new BadRequestException(
        `不支持的货币单位: ${currency}。支持的货币: ${this.SUPPORTED_CURRENCIES.join(', ')}`
      );
    }

    // 计算每日预算
    const start = DateTime.fromJSDate(trip.startDate);
    const end = DateTime.fromJSDate(trip.endDate);
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
    const totalBudget = constraint.total || 0;
    const dailyBudget = constraint.dailyBudget || (durationDays > 0 ? totalBudget / durationDays : 0);

    // 验证分类预算总和不超过总预算
    if (constraint.categoryLimits && totalBudget > 0) {
      const categorySum = Object.values(constraint.categoryLimits).reduce((sum, val) => sum + (val || 0), 0);
      if (categorySum > totalBudget) {
        throw new BadRequestException('分类预算总和不能超过总预算');
      }
    }

    // 更新预算配置
    const existingConfig = (trip.budgetConfig as any) || {};
    const budgetConfig: any = {
      ...existingConfig,
      totalBudget: totalBudget || existingConfig.totalBudget || existingConfig.total || 0,
      total: totalBudget || existingConfig.totalBudget || existingConfig.total || 0,
      currency: currency || existingConfig.currency || 'CNY',
      dailyBudget: dailyBudget || existingConfig.dailyBudget,
      alertThreshold: constraint.alertThreshold ?? existingConfig.alertThreshold ?? this.DEFAULT_ALERT_THRESHOLD,
      updatedAt: new Date().toISOString(),
    };

    if (constraint.categoryLimits) {
      budgetConfig.categoryLimits = constraint.categoryLimits;
    }

    if (!existingConfig.createdAt) {
      budgetConfig.createdAt = new Date().toISOString();
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { budgetConfig },
    });

    return {
      total: budgetConfig.totalBudget || budgetConfig.total,
      currency: budgetConfig.currency,
      dailyBudget: budgetConfig.dailyBudget,
      categoryLimits: budgetConfig.categoryLimits,
      alertThreshold: budgetConfig.alertThreshold,
      createdAt: budgetConfig.createdAt,
      updatedAt: budgetConfig.updatedAt,
    };
  }

  /**
   * 获取预算约束
   * 
   * @param tripId 行程 ID
   * @param userId 用户 ID（可选，用于从准备度接口获取 budgetLevel）
   * @returns 预算约束（如果未设置，则根据准备度接口的 budgetLevel 提供默认建议）
   */
  async getBudgetConstraint(tripId: string, userId?: string): Promise<BudgetConstraint | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const budgetConfig = (trip.budgetConfig as any) || {};
    if (!budgetConfig.totalBudget && !budgetConfig.total) {
      // 🆕 如果没有设置预算约束，尝试从准备度接口获取 budgetLevel 并提供默认建议
      const recommendedBudget = await this.getRecommendedBudgetFromReadiness(tripId, trip, userId);
      if (recommendedBudget) {
        return {
          ...recommendedBudget,
          // 标记为推荐预算（非用户设置）
          _isRecommended: true,
        } as any;
      }
      return null;
    }

    return {
      total: budgetConfig.totalBudget || budgetConfig.total,
      currency: budgetConfig.currency || 'CNY',
      dailyBudget: budgetConfig.dailyBudget,
      categoryLimits: budgetConfig.categoryLimits,
      alertThreshold: budgetConfig.alertThreshold ?? this.DEFAULT_ALERT_THRESHOLD,
      createdAt: budgetConfig.createdAt,
      updatedAt: budgetConfig.updatedAt,
    };
  }

  /**
   * 从准备度接口获取 budgetLevel 并计算推荐预算
   * 
   * @param tripId 行程 ID
   * @param trip 行程对象
   * @param userId 用户 ID（可选）
   * @returns 推荐的预算约束
   */
  private async getRecommendedBudgetFromReadiness(
    tripId: string,
    trip: any,
    userId?: string
  ): Promise<BudgetConstraint | null> {
    try {
      // 计算行程天数
      const startDate = DateTime.fromJSDate(trip.startDate);
      const endDate = DateTime.fromJSDate(trip.endDate);
      const durationDays = Math.ceil(endDate.diff(startDate, 'days').days) + 1;

      // 获取用户偏好信息（如果提供了 userId）
      let budgetLevel: 'low' | 'medium' | 'high' = 'medium';
      if (userId) {
        try {
          const userProfile = await this.prisma.userProfile.findUnique({
            where: { userId },
          });
          if (userProfile?.preferences) {
            const prefs = userProfile.preferences as any;
            budgetLevel = prefs.budgetLevel || prefs.travelPreferences?.budget?.toLowerCase() || 'medium';
          }
        } catch (error) {
          this.logger.warn(`Failed to get user profile for userId ${userId}: ${error}`);
        }
      }

      // 从行程 metadata 中获取 budgetLevel（如果存在）
      const metadata = trip.metadata as any || {};
      const preferences = metadata.preferences || {};
      if (preferences.budgetLevel) {
        budgetLevel = preferences.budgetLevel;
      }

      // 根据 budgetLevel 和行程天数计算推荐预算
      // 基准：中等预算水平，每人每天约 500 CNY
      const baseDailyPerPerson = 500;
      const travelers = (trip.metadata as any)?.travelers || 1;
      
      let dailyMultiplier = 1.0;
      if (budgetLevel === 'low') {
        dailyMultiplier = 0.6; // 低预算：60% 基准
      } else if (budgetLevel === 'high') {
        dailyMultiplier = 1.8; // 高预算：180% 基准
      }

      const recommendedDaily = baseDailyPerPerson * dailyMultiplier * travelers;
      const recommendedTotal = recommendedDaily * durationDays;

      // 计算分类预算分配（基于常见比例）
      const categoryLimits = {
        accommodation: Math.round(recommendedTotal * 0.35), // 35% 住宿
        transportation: Math.round(recommendedTotal * 0.25), // 25% 交通
        food: Math.round(recommendedTotal * 0.20), // 20% 餐饮
        activities: Math.round(recommendedTotal * 0.15), // 15% 活动
        other: Math.round(recommendedTotal * 0.05), // 5% 其他
      };

      return {
        total: Math.round(recommendedTotal),
        currency: 'CNY',
        dailyBudget: Math.round(recommendedDaily),
        categoryLimits,
        alertThreshold: this.DEFAULT_ALERT_THRESHOLD,
      };
    } catch (error) {
      this.logger.warn(`Failed to get recommended budget from readiness: ${error}`);
      return null;
    }
  }

  /**
   * 删除预算约束
   * 
   * @param tripId 行程 ID
   */
  async deleteBudgetConstraint(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 保留历史数据，只清除预算限制
    const budgetConfig = (trip.budgetConfig as any) || {};
    const updatedConfig = {
      ...budgetConfig,
      totalBudget: null,
      total: null,
      dailyBudget: null,
      categoryLimits: null,
      deletedAt: new Date().toISOString(),
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { budgetConfig: updatedConfig },
    });
  }

  /**
   * 获取预算明细
   * 
   * @param tripId 行程 ID
   * @param params 查询参数
   * @returns 预算明细
   */
  async getBudgetDetails(
    tripId: string,
    params: {
      startDate?: string;
      endDate?: string;
      category?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    items: BudgetDetailsItem[];
    total: number;
    limit: number;
    offset: number;
  }> {
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
    const currency = budgetConfig.currency || 'CNY';
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    // 构建明细项
    const items: BudgetDetailsItem[] = [];

    for (const day of trip.TripDay) {
      const dateKey = DateTime.fromJSDate(day.date).toISODate() || '';

      // 日期范围筛选
      if (params.startDate && dateKey < params.startDate) continue;
      if (params.endDate && dateKey > params.endDate) continue;

      for (const item of day.ItineraryItem) {
        const placeMetadata = (item.Place?.metadata as any) || {};
        const cost = placeMetadata.cost || placeMetadata.price || 0;
        const category = item.Place?.category || 'other';

        // 分类筛选
        if (params.category) {
          const categoryMap: Record<string, string> = {
            HOTEL: 'accommodation',
            RESTAURANT: 'food',
            ATTRACTION: 'activities',
            TRANSIT_HUB: 'transportation',
          };
          if (categoryMap[category] !== params.category && category !== params.category) {
            continue;
          }
        }

        if (cost > 0) {
          items.push({
            id: item.id,
            date: dateKey,
            category: this.mapCategory(category),
            itemName: item.Place?.nameCN || item.Place?.nameEN || '未知',
            amount: cost,
            currency,
            itineraryItemId: item.id,
            evidenceRefs: placeMetadata.evidenceRefs || [],
          });
        }
      }
    }

    // 排序：按日期倒序
    items.sort((a, b) => b.date.localeCompare(a.date));

    // 分页
    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      total,
      limit,
      offset,
    };
  }

  /**
   * 获取预算趋势
   * 
   * @param tripId 行程 ID
   * @param params 查询参数
   * @returns 预算趋势
   */
  async getBudgetTrends(
    tripId: string,
    params: {
      startDate?: string;
      endDate?: string;
      granularity?: 'daily' | 'weekly' | 'monthly';
    }
  ): Promise<BudgetTrendsResponse> {
    const summary = await this.getBudgetSummary(tripId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const granularity = params.granularity || 'daily';
    const start = params.startDate
      ? DateTime.fromISO(params.startDate)
      : DateTime.fromJSDate(trip.startDate);
    const end = params.endDate
      ? DateTime.fromISO(params.endDate)
      : DateTime.fromJSDate(trip.endDate);

    // 生成趋势数据
    const dailySpending: BudgetTrendsResponse['dailySpending'] = [];

    if (granularity === 'daily') {
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
    } else {
      // 周/月粒度（简化实现）
      const days = Math.floor(end.diff(start, 'days').days) + 1;
      const periodSize = granularity === 'weekly' ? 7 : 30;
      const periods = Math.ceil(days / periodSize);

      for (let p = 0; p < periods; p++) {
        const periodStart = start.plus({ days: p * periodSize });
        const periodEnd = periodStart.plus({ days: periodSize - 1 });
        const periodEndActual = periodEnd > end ? end : periodEnd;

        let periodSpent = 0;
        for (let i = 0; i < periodSize && periodStart.plus({ days: i }) <= periodEndActual; i++) {
          const date = periodStart.plus({ days: i });
          const dateKey = date.toISODate() || '';
          periodSpent += summary.dailySpent[dateKey] || 0;
        }

        dailySpending.push({
          date: periodStart.toISODate() || '',
          budget: summary.dailyBudget * Math.min(periodSize, Math.floor(periodEndActual.diff(periodStart, 'days').days) + 1),
          spent: periodSpent,
          ratio: summary.dailyBudget > 0 ? periodSpent / (summary.dailyBudget * Math.min(periodSize, Math.floor(periodEndActual.diff(periodStart, 'days').days) + 1)) : 0,
        });
      }
    }

    // 计算分类分布
    const totalSpent = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
    const categoryDistribution = {
      accommodation: totalSpent > 0 ? summary.categoryBreakdown.accommodation / totalSpent : 0,
      transportation: totalSpent > 0 ? summary.categoryBreakdown.transportation / totalSpent : 0,
      food: totalSpent > 0 ? summary.categoryBreakdown.food / totalSpent : 0,
      activities: totalSpent > 0 ? summary.categoryBreakdown.activities / totalSpent : 0,
      other: totalSpent > 0 ? summary.categoryBreakdown.other / totalSpent : 0,
    };

    // 预算预测（基于历史趋势）
    const forecast = this.calculateForecast(summary, dailySpending);

    return {
      dailySpending,
      categoryDistribution,
      forecast,
    };
  }

  /**
   * 获取预算执行统计
   * 
   * @param tripId 行程 ID
   * @returns 预算统计
   */
  async getBudgetStatistics(tripId: string): Promise<BudgetStatisticsResponse> {
    const summary = await this.getBudgetSummary(tripId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 完成度
    const completionRate = summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0;

    // 超支率（负数表示节省）
    const overspendRate = summary.totalBudget > 0
      ? (summary.totalSpent - summary.totalBudget) / summary.totalBudget
      : 0;

    // 分类占比
    const totalSpent = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
    const categoryPercentages = {
      accommodation: totalSpent > 0 ? summary.categoryBreakdown.accommodation / totalSpent : 0,
      transportation: totalSpent > 0 ? summary.categoryBreakdown.transportation / totalSpent : 0,
      food: totalSpent > 0 ? summary.categoryBreakdown.food / totalSpent : 0,
      activities: totalSpent > 0 ? summary.categoryBreakdown.activities / totalSpent : 0,
      other: totalSpent > 0 ? summary.categoryBreakdown.other / totalSpent : 0,
    };

    // 日均支出
    const start = DateTime.fromJSDate(trip.startDate);
    const end = DateTime.fromJSDate(trip.endDate);
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
    const dailyAverage = durationDays > 0 ? summary.totalSpent / durationDays : 0;

    // 预计完成日期（基于当前支出速度）
    const projectedCompletion = this.calculateProjectedCompletion(
      summary,
      start,
      end,
      durationDays
    );

    // 风险等级
    const riskLevel = this.calculateRiskLevel(completionRate, overspendRate, durationDays);

    return {
      completionRate,
      overspendRate,
      categoryPercentages,
      dailyAverage,
      projectedCompletion,
      riskLevel,
    };
  }

  /**
   * 获取实时预算监控数据
   * 
   * @param tripId 行程 ID
   * @returns 监控数据
   */
  async getBudgetMonitor(tripId: string): Promise<{
    currentSpent: number;
    remaining: number;
    dailySpent: Record<string, number>;
    alerts: BudgetAlert[];
    lastUpdated: string;
  }> {
    const summary = await this.getBudgetSummary(tripId);
    const alerts: BudgetAlert[] = [];

    // 检查预警
    const alertThreshold = 0.8; // 默认阈值
    const ratio = summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0;

    if (ratio > 1.0) {
      alerts.push({
        type: 'OVERSPEND',
        message: `预算已超支 ${((ratio - 1) * 100).toFixed(1)}%`,
        severity: 'error',
        suggestions: ['减少后续活动', '选择更便宜的替代方案'],
      });
    } else if (ratio > alertThreshold) {
      alerts.push({
        type: 'APPROACHING_LIMIT',
        message: `预算使用率已达 ${(ratio * 100).toFixed(1)}%`,
        severity: 'warning',
        suggestions: ['注意控制后续消费'],
      });
    }

    return {
      currentSpent: summary.totalSpent,
      remaining: summary.remaining,
      dailySpent: summary.dailySpent,
      alerts,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 辅助方法：映射分类
   */
  private mapCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      HOTEL: 'accommodation',
      RESTAURANT: 'food',
      ATTRACTION: 'activities',
      TRANSIT_HUB: 'transportation',
    };
    return categoryMap[category] || 'other';
  }

  /**
   * 辅助方法：计算预算预测
   */
  private calculateForecast(
    summary: BudgetSummary,
    dailySpending: Array<{ date: string; budget: number; spent: number; ratio: number }>
  ): BudgetTrendsResponse['forecast'] | undefined {
    if (dailySpending.length < 2) {
      return undefined;
    }

    // 计算平均每日支出
    const avgDailySpent = dailySpending.reduce((sum, day) => sum + day.spent, 0) / dailySpending.length;
    const remainingDays = Math.max(0, Math.ceil(summary.remaining / avgDailySpent));
    const projectedTotal = summary.totalSpent + (avgDailySpent * remainingDays);
    const projectedRemaining = summary.totalBudget - projectedTotal;

    // 置信度（基于数据点数量）
    const confidence = Math.min(1.0, dailySpending.length / 7);

    return {
      projectedTotal,
      projectedRemaining,
      confidence,
    };
  }

  /**
   * 辅助方法：计算预计完成日期
   */
  private calculateProjectedCompletion(
    summary: BudgetSummary,
    start: DateTime,
    end: DateTime,
    durationDays: number
  ): string {
    if (summary.totalSpent <= 0 || summary.dailyBudget <= 0) {
      return end.toISODate() || '';
    }

    const avgDailySpent = summary.totalSpent / durationDays;
    if (avgDailySpent <= 0) {
      return end.toISODate() || '';
    }

    const remainingDays = Math.ceil(summary.remaining / avgDailySpent);
    const projectedDate = DateTime.now().plus({ days: remainingDays });

    // 不超过行程结束日期
    return projectedDate > end ? end.toISODate() || '' : projectedDate.toISODate() || '';
  }

  /**
   * 辅助方法：计算风险等级
   */
  private calculateRiskLevel(
    completionRate: number,
    overspendRate: number,
    _durationDays: number
  ): 'low' | 'medium' | 'high' {
    if (overspendRate > 0.1 || completionRate > 1.0) {
      return 'high';
    }
    if (overspendRate > 0.05 || completionRate > 0.9) {
      return 'medium';
    }
    return 'low';
  }
}

