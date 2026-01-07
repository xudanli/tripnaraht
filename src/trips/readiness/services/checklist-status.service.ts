// src/trips/readiness/services/checklist-status.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UpdateChecklistStatusDto,
  ChecklistStatusResponseDto,
  GetChecklistStatusResponseDto,
} from '../dto/checklist-status.dto';

@Injectable()
export class ChecklistStatusService {
  private readonly logger = new Logger(ChecklistStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 批量保存勾选状态
   */
  async updateChecklistStatus(
    tripId: string,
    dto: UpdateChecklistStatusDto,
  ): Promise<ChecklistStatusResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 使用事务批量更新
    const updated = await this.prisma.$transaction(async (tx) => {
      // 先删除所有现有的勾选状态
      await tx.tripChecklistStatus.deleteMany({
        where: { tripId },
      });

      // 批量插入新的勾选状态
      if (dto.checkedItems.length > 0) {
        await tx.tripChecklistStatus.createMany({
          data: dto.checkedItems.map((findingId) => ({
            tripId,
            findingId,
            checked: true,
          })),
        });
      }

      return dto.checkedItems.length;
    });

    this.logger.debug(`更新了 ${updated} 个检查清单项的状态`);

    return {
      updated,
      checkedItems: dto.checkedItems,
    };
  }

  /**
   * 获取勾选状态
   */
  async getChecklistStatus(tripId: string): Promise<GetChecklistStatusResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 查询所有勾选状态
    const statuses = await this.prisma.tripChecklistStatus.findMany({
      where: { tripId },
      orderBy: { updatedAt: 'desc' },
    });

    // 获取最后更新时间
    const lastUpdated =
      statuses.length > 0
        ? statuses[0].updatedAt.toISOString()
        : new Date().toISOString();

    return {
      checkedItems: statuses.map((s) => s.findingId),
      lastUpdated,
    };
  }
}

