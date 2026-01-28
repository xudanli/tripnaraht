// src/trips/readiness/services/capability-pack-checklist.service.ts

/**
 * Capability Pack Checklist Service
 * 
 * 管理从能力包添加到准备清单的项目
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AddFromCapabilityPackRule {
  id: string;
  level: 'blocker' | 'must' | 'should' | 'optional';
  message: string;
  category?: string;
  tasks?: Array<{
    title: string;
    dueOffsetDays?: number;
    tags?: string[];
  }>;
}

export interface AddFromCapabilityPackRequest {
  packType: string;
  rules: AddFromCapabilityPackRule[];
}

export interface CapabilityPackChecklistItem {
  id: string;
  ruleId: string;
  message: string;
  level: string;
  category?: string;
  tasks?: any;
  sourcePackType: string;
  checked: boolean;
  createdAt: string;
}

export interface AddFromCapabilityPackResponse {
  success: boolean;
  addedCount: number;
  skippedCount: number;
  items: CapabilityPackChecklistItem[];
}

@Injectable()
export class CapabilityPackChecklistService {
  private readonly logger = new Logger(CapabilityPackChecklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 从能力包添加规则到准备清单
   */
  async addFromCapabilityPack(
    tripId: string,
    request: AddFromCapabilityPackRequest,
  ): Promise<AddFromCapabilityPackResponse> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const addedItems: CapabilityPackChecklistItem[] = [];
    let skippedCount = 0;

    for (const rule of request.rules) {
      try {
        // 使用 upsert 避免重复添加
        const item = await this.prisma.tripCapabilityPackItem.upsert({
          where: {
            tripId_ruleId_sourcePackType: {
              tripId,
              ruleId: rule.id,
              sourcePackType: request.packType,
            },
          },
          update: {
            level: rule.level,
            message: rule.message,
            category: rule.category,
            tasks: rule.tasks as any,
          },
          create: {
            tripId,
            ruleId: rule.id,
            sourcePackType: request.packType,
            level: rule.level,
            message: rule.message,
            category: rule.category,
            tasks: rule.tasks as any,
          },
        });

        addedItems.push({
          id: item.id,
          ruleId: item.ruleId,
          message: item.message,
          level: item.level,
          category: item.category || undefined,
          tasks: item.tasks,
          sourcePackType: item.sourcePackType,
          checked: item.checked,
          createdAt: item.createdAt.toISOString(),
        });
      } catch (error) {
        this.logger.warn(`跳过规则 ${rule.id}: ${(error as Error).message}`);
        skippedCount++;
      }
    }

    this.logger.log(
      `为行程 ${tripId} 从能力包 ${request.packType} 添加了 ${addedItems.length} 条规则`,
    );

    return {
      success: true,
      addedCount: addedItems.length,
      skippedCount,
      items: addedItems,
    };
  }

  /**
   * 获取行程的能力包清单项
   */
  async getCapabilityPackItems(
    tripId: string,
    packType?: string,
  ): Promise<CapabilityPackChecklistItem[]> {
    const where: any = { tripId };
    if (packType) {
      where.sourcePackType = packType;
    }

    const items = await this.prisma.tripCapabilityPackItem.findMany({
      where,
      orderBy: [
        { sourcePackType: 'asc' },
        { level: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return items.map((item) => ({
      id: item.id,
      ruleId: item.ruleId,
      message: item.message,
      level: item.level,
      category: item.category || undefined,
      tasks: item.tasks,
      sourcePackType: item.sourcePackType,
      checked: item.checked,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  /**
   * 更新能力包清单项的勾选状态
   */
  async updateItemStatus(
    tripId: string,
    itemId: string,
    checked: boolean,
  ): Promise<CapabilityPackChecklistItem> {
    const item = await this.prisma.tripCapabilityPackItem.update({
      where: {
        id: itemId,
        tripId,
      },
      data: { checked },
    });

    return {
      id: item.id,
      ruleId: item.ruleId,
      message: item.message,
      level: item.level,
      category: item.category || undefined,
      tasks: item.tasks,
      sourcePackType: item.sourcePackType,
      checked: item.checked,
      createdAt: item.createdAt.toISOString(),
    };
  }

  /**
   * 批量更新能力包清单项的勾选状态
   */
  async batchUpdateItemStatus(
    tripId: string,
    updates: Array<{ itemId: string; checked: boolean }>,
  ): Promise<{ updatedCount: number }> {
    let updatedCount = 0;

    for (const update of updates) {
      try {
        await this.prisma.tripCapabilityPackItem.update({
          where: {
            id: update.itemId,
            tripId,
          },
          data: { checked: update.checked },
        });
        updatedCount++;
      } catch (error) {
        this.logger.warn(`更新项 ${update.itemId} 失败: ${(error as Error).message}`);
      }
    }

    return { updatedCount };
  }

  /**
   * 删除能力包清单项
   */
  async removeItem(tripId: string, itemId: string): Promise<{ removed: boolean }> {
    await this.prisma.tripCapabilityPackItem.delete({
      where: {
        id: itemId,
        tripId,
      },
    });

    return { removed: true };
  }

  /**
   * 按能力包类型删除所有清单项
   */
  async removeByPackType(
    tripId: string,
    packType: string,
  ): Promise<{ removedCount: number }> {
    const result = await this.prisma.tripCapabilityPackItem.deleteMany({
      where: {
        tripId,
        sourcePackType: packType,
      },
    });

    return { removedCount: result.count };
  }

  /**
   * 获取按级别分组的清单项（用于合并到个性化清单）
   */
  async getItemsGroupedByLevel(tripId: string): Promise<{
    blocker: CapabilityPackChecklistItem[];
    must: CapabilityPackChecklistItem[];
    should: CapabilityPackChecklistItem[];
    optional: CapabilityPackChecklistItem[];
  }> {
    const items = await this.getCapabilityPackItems(tripId);

    return {
      blocker: items.filter((i) => i.level === 'blocker'),
      must: items.filter((i) => i.level === 'must'),
      should: items.filter((i) => i.level === 'should'),
      optional: items.filter((i) => i.level === 'optional'),
    };
  }
}
