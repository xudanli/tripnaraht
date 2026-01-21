// src/itinerary-items/services/item-cost.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ItemType } from '../dto/create-itinerary-item.dto';
import { 
  CostCategory, 
  ItemCostDto, 
  BatchUpdateCostDto,
  TripCostSummaryDto,
  CategoryCostSummaryDto,
  DailyCostSummaryDto,
  BatchUpdateCostResultDto,
} from '../dto/item-cost.dto';

@Injectable()
export class ItemCostService {
  private readonly logger = new Logger(ItemCostService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 根据 ItemType 获取默认费用分类
   */
  getDefaultCostCategory(itemType: ItemType): CostCategory {
    const mapping: Record<ItemType, CostCategory> = {
      [ItemType.ACTIVITY]: CostCategory.ACTIVITIES,
      [ItemType.REST]: CostCategory.OTHER,
      [ItemType.MEAL_ANCHOR]: CostCategory.FOOD,
      [ItemType.MEAL_FLOATING]: CostCategory.FOOD,
      [ItemType.TRANSIT]: CostCategory.TRANSPORTATION,
    };
    return mapping[itemType] || CostCategory.OTHER;
  }

  /**
   * 更新单个行程项的费用
   */
  async updateItemCost(itemId: string, costData: ItemCostDto) {
    // 验证行程项存在
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`行程项 ${itemId} 不存在`);
    }

    this.logger.log(`更新行程项费用: ${itemId}, 数据: ${JSON.stringify(costData)}`);

    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        estimatedCost: costData.estimatedCost,
        actualCost: costData.actualCost,
        currency: costData.currency,
        costCategory: costData.costCategory,
        costNote: costData.costNote,
        isPaid: costData.isPaid,
        paidBy: costData.paidBy,
      },
      include: {
        Place: {
          select: {
            id: true,
            nameCN: true,
            nameEN: true,
            category: true,
          },
        },
      },
    });
  }

  /**
   * 批量更新费用
   */
  async batchUpdateCost(dto: BatchUpdateCostDto): Promise<BatchUpdateCostResultDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${dto.tripId} 不存在`);
    }

    // 获取该行程下的所有行程项ID
    const tripItems = await this.prisma.itineraryItem.findMany({
      where: {
        TripDay: {
          tripId: dto.tripId,
        },
      },
      select: { id: true },
    });

    const validItemIds = new Set(tripItems.map(item => item.id));
    const failedIds: string[] = [];
    let updated = 0;

    // 使用事务批量更新
    const updates = dto.items
      .filter(item => {
        if (!validItemIds.has(item.id)) {
          failedIds.push(item.id);
          return false;
        }
        return true;
      })
      .map(item =>
        this.prisma.itineraryItem.update({
          where: { id: item.id },
          data: {
            actualCost: item.actualCost,
            isPaid: item.isPaid,
            costNote: item.costNote,
          },
        })
      );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
      updated = updates.length;
    }

    this.logger.log(`批量更新费用完成: 成功 ${updated} 条, 失败 ${failedIds.length} 条`);

    return {
      updated,
      failed: failedIds.length,
      failedIds: failedIds.length > 0 ? failedIds : undefined,
    };
  }

  /**
   * 获取行程费用汇总
   */
  async getTripCostSummary(tripId: string): Promise<TripCostSummaryDto> {
    // 获取行程及其所有行程项
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 获取预算配置
    const budgetConfig = (trip.budgetConfig as any) || {};
    const totalBudget = budgetConfig.totalBudget || budgetConfig.total || 0;
    const currency = budgetConfig.currency || 'CNY';

    // 初始化汇总数据
    let totalEstimated = 0;
    let totalActual = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;

    const byCategory: Record<string, CategoryCostSummaryDto> = {};
    const byDay: DailyCostSummaryDto[] = [];

    // 初始化所有分类
    Object.values(CostCategory).forEach(cat => {
      byCategory[cat] = { estimated: 0, actual: 0, count: 0 };
    });

    // 遍历每日计算
    for (const day of trip.TripDay) {
      let dayEstimated = 0;
      let dayActual = 0;
      let dayItemCount = 0;

      for (const item of day.ItineraryItem) {
        const estimated = item.estimatedCost || 0;
        const actual = item.actualCost || 0;
        const category = (item.costCategory as CostCategory) || CostCategory.OTHER;
        const isPaid = item.isPaid || false;

        // 累计总费用
        totalEstimated += estimated;
        totalActual += actual;

        // 累计支付状态
        if (isPaid) {
          totalPaid += actual || estimated;
        } else if (actual > 0 || estimated > 0) {
          totalUnpaid += actual || estimated;
        }

        // 累计每日费用
        dayEstimated += estimated;
        dayActual += actual;
        if (estimated > 0 || actual > 0) {
          dayItemCount++;
        }

        // 累计分类费用
        if (byCategory[category]) {
          byCategory[category].estimated += estimated;
          byCategory[category].actual += actual;
          if (estimated > 0 || actual > 0) {
            byCategory[category].count++;
          }
        }
      }

      byDay.push({
        date: day.date.toISOString().split('T')[0],
        estimated: Math.round(dayEstimated * 100) / 100,
        actual: Math.round(dayActual * 100) / 100,
        itemCount: dayItemCount,
      });
    }

    // 计算偏差（实际 vs 预估）
    const varianceAmount = totalActual - totalEstimated;
    const variancePercentage = totalEstimated > 0 
      ? (varianceAmount / totalEstimated) * 100 
      : 0;
    
    // 判断预算状态
    let status: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET';
    if (totalBudget > 0 && totalActual > totalBudget) {
      status = 'OVER_BUDGET';
    } else if (totalActual < totalEstimated * 0.95) {
      status = 'UNDER_BUDGET';
    } else {
      status = 'ON_BUDGET';
    }

    // 计算预算使用率
    const budgetUsagePercent = totalBudget > 0 
      ? Math.round((totalActual / totalBudget) * 10000) / 100
      : 0;

    // 四舍五入所有金额
    const roundedByCategory: Record<string, CategoryCostSummaryDto> = {};
    Object.entries(byCategory).forEach(([key, value]) => {
      roundedByCategory[key] = {
        estimated: Math.round(value.estimated * 100) / 100,
        actual: Math.round(value.actual * 100) / 100,
        count: value.count,
      };
    });

    return {
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalEstimated: Math.round(totalEstimated * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalUnpaid: Math.round(totalUnpaid * 100) / 100,
      currency,
      byCategory: roundedByCategory,
      byDay,
      variance: {
        amount: Math.round(varianceAmount * 100) / 100,
        percentage: Math.round(variancePercentage * 100) / 100,
        status,
      },
      budgetUsagePercent,
    };
  }

  /**
   * 获取单个行程项的费用信息
   */
  async getItemCost(itemId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        estimatedCost: true,
        actualCost: true,
        currency: true,
        costCategory: true,
        costNote: true,
        isPaid: true,
        paidBy: true,
        type: true,
        Place: {
          select: {
            nameCN: true,
            nameEN: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`行程项 ${itemId} 不存在`);
    }

    return item;
  }

  /**
   * 获取未支付的行程项列表
   */
  async getUnpaidItems(tripId: string) {
    const items = await this.prisma.itineraryItem.findMany({
      where: {
        TripDay: {
          tripId,
        },
        isPaid: false,
        OR: [
          { estimatedCost: { gt: 0 } },
          { actualCost: { gt: 0 } },
        ],
      },
      include: {
        Place: {
          select: {
            nameCN: true,
            nameEN: true,
          },
        },
        TripDay: {
          select: {
            date: true,
          },
        },
      },
      orderBy: {
        TripDay: {
          date: 'asc',
        },
      },
    });

    return items.map(item => ({
      id: item.id,
      placeName: item.Place?.nameCN || item.Place?.nameEN || '未知地点',
      date: item.TripDay.date.toISOString().split('T')[0],
      estimatedCost: item.estimatedCost,
      actualCost: item.actualCost,
      currency: item.currency,
      costCategory: item.costCategory,
      costNote: item.costNote,
    }));
  }
}
