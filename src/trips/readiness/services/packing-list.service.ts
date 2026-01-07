// src/trips/readiness/services/packing-list.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GeneratePackingListDto,
  GeneratePackingListResponseDto,
  GetPackingListResponseDto,
  UpdatePackingListItemDto,
  UpdatePackingListItemResponseDto,
  PackingListItemDto,
  PackingListSummaryDto,
} from '../dto/packing-list.dto';
import { ReadinessService } from './readiness.service';

@Injectable()
export class PackingListService {
  private readonly logger = new Logger(PackingListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: ReadinessService,
  ) {}

  /**
   * 生成打包清单
   */
  async generatePackingList(
    tripId: string,
    dto: GeneratePackingListDto,
  ): Promise<GeneratePackingListResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取准备度检查结果
    const readinessResult = await this.readinessService.checkFromDestination(
      trip.destination,
      {
        traveler: {},
        trip: {
          startDate: trip.startDate.toISOString().split('T')[0],
          endDate: trip.endDate.toISOString().split('T')[0],
        },
        itinerary: {
          countries: [trip.destination],
        },
      },
    );

    // 调试日志：查看 readinessResult 的数据
    this.logger.debug(
      `Readiness check result for trip ${tripId}: ${readinessResult.findings.length} findings`,
    );
    for (const finding of readinessResult.findings) {
      this.logger.debug(
        `Finding: ${finding.packId || finding.destinationId}, must: ${finding.must?.length || 0}, should: ${finding.should?.length || 0}, optional: ${finding.optional?.length || 0}`,
      );
      if (finding.must && finding.must.length > 0) {
        const categories = finding.must.map((item) => item.category);
        this.logger.debug(`Must items categories: ${categories.join(', ')}`);
      }
      if (finding.should && finding.should.length > 0) {
        const categories = finding.should.map((item) => item.category);
        this.logger.debug(`Should items categories: ${categories.join(', ')}`);
      }
    }

    // 从准备度检查结果生成打包清单项
    const items: PackingListItemDto[] = [];

    // 处理 must 和 should 项
    // 只处理与打包清单相关的类别：
    // - safety_hazards: 安全装备（如防滑链、急救包等）
    // - gear_packing: 装备与穿搭
    // - health_insurance: 医疗相关物品（如药品、保险单等）
    const packingRelevantCategories = ['safety_hazards', 'gear_packing', 'health_insurance'];
    
    for (const finding of readinessResult.findings) {
      for (const mustItem of finding.must || []) {
        if (packingRelevantCategories.includes(mustItem.category)) {
          items.push({
            id: `item-${mustItem.id}`,
            name: this.extractItemName(mustItem.message),
            category: this.mapCategory(mustItem.category),
            quantity: 1,
            priority: 'must',
            reason: mustItem.message,
            sourceFindingId: mustItem.id,
            checked: false,
          });
        }
      }

      for (const shouldItem of finding.should || []) {
        if (packingRelevantCategories.includes(shouldItem.category)) {
          items.push({
            id: `item-${shouldItem.id}`,
            name: this.extractItemName(shouldItem.message),
            category: this.mapCategory(shouldItem.category),
            quantity: 1,
            priority: 'should',
            reason: shouldItem.message,
            sourceFindingId: shouldItem.id,
            checked: false,
          });
        }
      }

      // 处理可选物品
      if (dto.includeOptional) {
        for (const optionalItem of finding.optional || []) {
          if (packingRelevantCategories.includes(optionalItem.category)) {
            items.push({
              id: `item-${optionalItem.id}`,
              name: this.extractItemName(optionalItem.message),
              category: this.mapCategory(optionalItem.category),
              quantity: 1,
              priority: 'optional',
              reason: optionalItem.message,
              sourceFindingId: optionalItem.id,
              checked: false,
            });
          }
        }
      }
    }

    // 添加用户自定义物品
    if (dto.customItems) {
      for (const customItem of dto.customItems) {
        items.push({
          id: `custom-${Date.now()}-${Math.random()}`,
          name: customItem.name,
          category: customItem.category as any,
          quantity: customItem.quantity || 1,
          priority: 'optional',
          note: customItem.note,
          checked: false,
        });
      }
    }

    // 过滤类别（如果指定）
    const filteredItems = dto.categories
      ? items.filter((item) => dto.categories!.includes(item.category))
      : items;

    // 保存到数据库
    await this.prisma.$transaction(async (tx) => {
      // 删除旧的打包清单
      await tx.tripPackingListItem.deleteMany({
        where: { tripId },
      });

      // 批量插入新的打包清单
      if (filteredItems.length > 0) {
        await tx.tripPackingListItem.createMany({
          data: filteredItems.map((item) => ({
            tripId,
            itemName: item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            priority: item.priority,
            reason: item.reason,
            sourceFindingId: item.sourceFindingId,
            checked: item.checked,
            note: item.note,
          })),
        });
      }
    });

    // 计算摘要
    const summary = this.calculateSummary(filteredItems);

    this.logger.debug(`为行程 ${tripId} 生成了 ${filteredItems.length} 个打包清单项`);

    return {
      tripId,
      generatedAt: new Date().toISOString(),
      items: filteredItems,
      summary,
    };
  }

  /**
   * 获取打包清单
   */
  async getPackingList(tripId: string): Promise<GetPackingListResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 查询打包清单项
    const dbItems = await this.prisma.tripPackingListItem.findMany({
      where: { tripId },
      orderBy: [{ category: 'asc' }, { priority: 'asc' }],
    });

    const items: PackingListItemDto[] = dbItems.map((item) => ({
      id: item.id,
      name: item.itemName,
      category: item.category as any,
      quantity: item.quantity,
      unit: item.unit || undefined,
      priority: item.priority as any,
      reason: item.reason || undefined,
      sourceFindingId: item.sourceFindingId || undefined,
      checked: item.checked,
      note: item.note || undefined,
    }));

    const summary = this.calculateSummary(items);

    // 获取最后生成时间（使用第一个项的创建时间作为参考）
    const lastGeneratedAt =
      dbItems.length > 0 ? dbItems[0].createdAt.toISOString() : undefined;

    return {
      tripId,
      items,
      summary,
      lastGeneratedAt,
    };
  }

  /**
   * 更新打包清单项状态
   */
  async updatePackingListItem(
    tripId: string,
    itemId: string,
    dto: UpdatePackingListItemDto,
  ): Promise<UpdatePackingListItemResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 验证项是否存在
    const item = await this.prisma.tripPackingListItem.findFirst({
      where: {
        id: itemId,
        tripId,
      },
    });

    if (!item) {
      throw new NotFoundException(`打包清单项 ID ${itemId} 不存在`);
    }

    // 更新项
    await this.prisma.tripPackingListItem.update({
      where: { id: itemId },
      data: {
        checked: dto.checked !== undefined ? dto.checked : item.checked,
        quantity: dto.quantity !== undefined ? dto.quantity : item.quantity,
        note: dto.note !== undefined ? dto.note : item.note,
      },
    });

    this.logger.debug(`更新了打包清单项 ${itemId}`);

    return {
      itemId,
      updated: true,
    };
  }

  /**
   * 从消息中提取物品名称（简单实现）
   */
  private extractItemName(message: string): string {
    // 简单的提取逻辑，实际可以更复杂
    if (message.includes('衣物') || message.includes('clothing')) {
      return '分层保暖衣物';
    }
    if (message.includes('车辆') || message.includes('vehicle')) {
      return '4x4 车辆租赁确认单';
    }
    if (message.includes('保险') || message.includes('insurance')) {
      return '旅行保险';
    }
    if (message.includes('防滑') || message.includes('chain')) {
      return '防滑链';
    }
    // 默认返回消息的前30个字符
    return message.substring(0, 30);
  }

  /**
   * 映射类别
   */
  private mapCategory(category: string): 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other' {
    const categoryMap: Record<string, 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other'> = {
      safety_hazards: 'gear',
      gear_packing: 'gear',
      entry_transit: 'documents',
      health_insurance: 'medical', // 医疗相关物品（药品、保险单等）
      activities_bookings: 'documents',
      logistics: 'other',
      clothing: 'clothing',
      documents: 'documents',
      electronics: 'electronics',
      food: 'food',
      medical: 'medical',
    };
    return categoryMap[category] || 'other';
  }

  /**
   * 计算摘要
   */
  private calculateSummary(items: PackingListItemDto[]): PackingListSummaryDto {
    const byCategory: Record<string, number> = {};
    let checkedItems = 0;

    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      if (item.checked) {
        checkedItems++;
      }
    }

    return {
      totalItems: items.length,
      checkedItems,
      byCategory,
    };
  }
}

