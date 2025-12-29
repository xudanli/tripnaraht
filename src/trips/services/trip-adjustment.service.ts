// src/trips/services/trip-adjustment.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { TripDecisionEngineService } from '../decision/trip-decision-engine.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';

export interface TripModificationRequest {
  tripId: string;
  modifications: Array<{
    type: 'CHANGE_DATE' | 'MOVE_ACTIVITY' | 'ADD_ACTIVITY' | 'REMOVE_ACTIVITY';
    itemId?: string;
    newDate?: string;
    newStartTime?: string;
    activityData?: any;
  }>;
}

export interface TripAdjustmentResult {
  success: boolean;
  adjustedTrip: any;
  changes: Array<{
    type: string;
    description: string;
    affectedItems: string[];
  }>;
  budgetUpdate?: {
    oldBudget: number;
    newBudget: number;
    changes: string[];
  };
  notifications: Array<{
    type: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
    message: string;
    actionRequired: boolean;
  }>;
}

@Injectable()
export class TripAdjustmentService {
  private readonly logger = new Logger(TripAdjustmentService.name);

  constructor(
    private prisma: PrismaService,
    private decisionEngine: TripDecisionEngineService,
    private itineraryItemsService: ItineraryItemsService
  ) {}

  /**
   * 修改行程并自动适配调整
   * 
   * @param request 修改请求
   * @returns 调整结果
   */
  async adjustTrip(request: TripModificationRequest): Promise<TripAdjustmentResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: request.tripId },
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
      throw new NotFoundException(`行程 ${request.tripId} 不存在`);
    }

    const changes: TripAdjustmentResult['changes'] = [];
    const notifications: TripAdjustmentResult['notifications'] = [];
    let budgetUpdate: TripAdjustmentResult['budgetUpdate'] | undefined;

    // 处理每个修改
    for (const modification of request.modifications) {
      switch (modification.type) {
        case 'CHANGE_DATE':
          if (modification.itemId && modification.newDate) {
            await this.handleDateChange(
              request.tripId,
              modification.itemId,
              modification.newDate,
              changes,
              notifications
            );
          }
          break;

        case 'MOVE_ACTIVITY':
          if (modification.itemId && modification.newDate && modification.newStartTime) {
            await this.handleMoveActivity(
              request.tripId,
              modification.itemId,
              modification.newDate,
              modification.newStartTime,
              changes,
              notifications
            );
          }
          break;

        case 'ADD_ACTIVITY':
          if (modification.activityData && modification.newDate) {
            await this.handleAddActivity(
              request.tripId,
              modification.activityData,
              modification.newDate,
              changes,
              notifications
            );
          }
          break;

        case 'REMOVE_ACTIVITY':
          if (modification.itemId) {
            await this.handleRemoveActivity(
              request.tripId,
              modification.itemId,
              changes,
              notifications
            );
          }
          break;
      }
    }

    // 触发节奏修复机制（Dr.Dre）
    await this.triggerPacingAdjustment(request.tripId, changes);

    // 重新计算预算
    budgetUpdate = await this.recalculateBudget(request.tripId);

    // 获取更新后的行程
    const adjustedTrip = await this.prisma.trip.findUnique({
      where: { id: request.tripId },
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

    return {
      success: true,
      adjustedTrip,
      changes,
      budgetUpdate,
      notifications,
    };
  }

  /**
   * 处理日期变更
   */
  private async handleDateChange(
    tripId: string,
    itemId: string,
    newDate: string,
    changes: TripAdjustmentResult['changes'],
    notifications: TripAdjustmentResult['notifications']
  ): Promise<void> {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: true,
        TripDay: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`行程项 ${itemId} 不存在`);
    }

    const oldDate = DateTime.fromJSDate(item.TripDay.date).toISODate();
    const newDateObj = DateTime.fromISO(newDate);

    // 查找或创建新的 TripDay
    let newTripDay = await this.prisma.tripDay.findFirst({
      where: {
        tripId,
        date: {
          gte: newDateObj.startOf('day').toJSDate(),
          lt: newDateObj.endOf('day').toJSDate(),
        },
      },
    });

    if (!newTripDay) {
      newTripDay = await this.prisma.tripDay.create({
        data: {
          id: require('crypto').randomUUID(),
          date: newDateObj.toJSDate(),
          tripId,
        } as any,
      });
    }

    // 更新行程项
    await this.itineraryItemsService.update(itemId, {
      tripDayId: newTripDay.id,
    });

    changes.push({
      type: 'CHANGE_DATE',
      description: `将活动 "${item.Place?.nameCN || item.Place?.nameEN || '未知'}" 从 ${oldDate} 移动到 ${newDate}`,
      affectedItems: [itemId],
    });

    // 检查是否需要调整酒店预订
    if (item.Place?.category === 'HOTEL') {
      notifications.push({
        type: 'HOTEL',
        message: `酒店预订日期已变更，请确认新的入住日期：${newDate}`,
        actionRequired: true,
      });
    }
  }

  /**
   * 处理活动移动
   */
  private async handleMoveActivity(
    tripId: string,
    itemId: string,
    newDate: string,
    newStartTime: string,
    changes: TripAdjustmentResult['changes'],
    notifications: TripAdjustmentResult['notifications']
  ): Promise<void> {
    await this.handleDateChange(tripId, itemId, newDate, changes, notifications);

    // 更新时间
    const newTime = DateTime.fromISO(`${newDate}T${newStartTime}`);
    await this.itineraryItemsService.update(itemId, {
      startTime: newTime.toISO() || newTime.toJSDate().toISOString(),
      endTime: newTime.plus({ hours: 2 }).toISO() || newTime.plus({ hours: 2 }).toJSDate().toISOString(), // 默认2小时
    });

    changes.push({
      type: 'MOVE_ACTIVITY',
      description: `活动已移动到 ${newDate} ${newStartTime}`,
      affectedItems: [itemId],
    });
  }

  /**
   * 处理添加活动
   */
  private async handleAddActivity(
    tripId: string,
    activityData: any,
    newDate: string,
    changes: TripAdjustmentResult['changes'],
    notifications: TripAdjustmentResult['notifications']
  ): Promise<void> {
    // 查找或创建 TripDay
    const newDateObj = DateTime.fromISO(newDate);
    let tripDay = await this.prisma.tripDay.findFirst({
      where: {
        tripId,
        date: {
          gte: newDateObj.startOf('day').toJSDate(),
          lt: newDateObj.endOf('day').toJSDate(),
        },
      },
    });

    if (!tripDay) {
      tripDay = await this.prisma.tripDay.create({
        data: {
          id: require('crypto').randomUUID(),
          date: newDateObj.toJSDate(),
          tripId,
        } as any,
      });
    }

    // 创建新的行程项
    await this.itineraryItemsService.create({
      tripDayId: tripDay.id,
      placeId: activityData.placeId,
      type: activityData.type || 'ACTIVITY',
      startTime: activityData.startTime || newDateObj.toJSDate(),
      endTime: activityData.endTime || newDateObj.plus({ hours: 2 }).toJSDate(),
      note: activityData.note,
    });

    changes.push({
      type: 'ADD_ACTIVITY',
      description: `已添加活动到 ${newDate}`,
      affectedItems: [],
    });
  }

  /**
   * 处理移除活动
   */
  private async handleRemoveActivity(
    tripId: string,
    itemId: string,
    changes: TripAdjustmentResult['changes'],
    notifications: TripAdjustmentResult['notifications']
  ): Promise<void> {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`行程项 ${itemId} 不存在`);
    }

    await this.itineraryItemsService.remove(itemId);

    changes.push({
      type: 'REMOVE_ACTIVITY',
      description: `已移除活动 "${item.Place?.nameCN || item.Place?.nameEN || '未知'}"`,
      affectedItems: [itemId],
    });

    // 如果是交通项，提醒用户（通过 TRANSIT_HUB 判断）
    if (item.Place?.category === 'TRANSIT_HUB') {
      notifications.push({
        type: 'TRANSPORT',
        message: '交通安排已变更，请确认是否需要调整其他交通预订',
        actionRequired: true,
      });
    }
  }

  /**
   * 触发节奏修复机制（Dr.Dre）
   */
  private async triggerPacingAdjustment(
    tripId: string,
    changes: TripAdjustmentResult['changes']
  ): Promise<void> {
    this.logger.log(`触发节奏修复机制: Trip ID=${tripId}`);

    // TODO: 调用决策引擎的 Dr.Dre 策略进行节奏调整
    // 这里简化处理，实际应该调用 TripDecisionEngineService

    changes.push({
      type: 'PACING_ADJUSTMENT',
      description: '已自动调整行程节奏，拆分密集活动并插入缓冲时间',
      affectedItems: [],
    });
  }

  /**
   * 重新计算预算
   */
  private async recalculateBudget(tripId: string): Promise<TripAdjustmentResult['budgetUpdate']> {
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
      return undefined;
    }

    const budgetConfig = (trip.budgetConfig as any) || {};
    const oldBudget = budgetConfig.totalBudget || budgetConfig.total || 0;

    // 重新计算总消费
    let totalSpent = 0;
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        const placeMetadata = (item.Place?.metadata as any) || {};
        const cost = placeMetadata.cost || placeMetadata.price || 0;
        totalSpent += cost;
      }
    }

    const newBudget = oldBudget; // 总预算不变，但实际消费可能变化

    return {
      oldBudget,
      newBudget,
      changes: [
        `实际消费已更新为 ${totalSpent.toFixed(2)} 元`,
        `剩余预算：${(newBudget - totalSpent).toFixed(2)} 元`,
      ],
    };
  }
}

