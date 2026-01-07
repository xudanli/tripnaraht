// src/trips/readiness/services/finding-marks.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  MarkNotApplicableDto,
  MarkNotApplicableResponseDto,
  AddToLaterDto,
  AddToLaterResponseDto,
  GetNotApplicableResponseDto,
  GetLaterResponseDto,
  NotApplicableItemDto,
  LaterItemDto,
} from '../dto/finding-mark.dto';

@Injectable()
export class FindingMarksService {
  private readonly logger = new Logger(FindingMarksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 标记项为不适用
   */
  async markNotApplicable(
    tripId: string,
    findingId: string,
    dto: MarkNotApplicableDto,
  ): Promise<MarkNotApplicableResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 使用 upsert 创建或更新标记
    const mark = await this.prisma.tripFindingMark.upsert({
      where: {
        tripId_findingId_markType: {
          tripId,
          findingId,
          markType: 'not_applicable',
        },
      },
      update: {
        reason: dto.reason,
        createdAt: new Date(),
      },
      create: {
        tripId,
        findingId,
        markType: 'not_applicable',
        reason: dto.reason,
      },
    });

    this.logger.debug(`标记 finding ${findingId} 为不适用`);

    return {
      findingId,
      marked: true,
      reason: mark.reason || undefined,
      markedAt: mark.createdAt.toISOString(),
    };
  }

  /**
   * 取消标记不适用
   */
  async unmarkNotApplicable(
    tripId: string,
    findingId: string,
  ): Promise<{ findingId: string; marked: boolean }> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 删除标记
    await this.prisma.tripFindingMark.deleteMany({
      where: {
        tripId,
        findingId,
        markType: 'not_applicable',
      },
    });

    this.logger.debug(`取消标记 finding ${findingId} 为不适用`);

    return {
      findingId,
      marked: false,
    };
  }

  /**
   * 获取不适用项列表
   */
  async getNotApplicableItems(tripId: string): Promise<GetNotApplicableResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 查询所有不适用标记
    const marks = await this.prisma.tripFindingMark.findMany({
      where: {
        tripId,
        markType: 'not_applicable',
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      notApplicableItems: marks.map(
        (mark): NotApplicableItemDto => ({
          findingId: mark.findingId,
          reason: mark.reason || undefined,
          markedAt: mark.createdAt.toISOString(),
        }),
      ),
    };
  }

  /**
   * 添加到稍后处理
   */
  async addToLater(
    tripId: string,
    findingId: string,
    dto: AddToLaterDto,
  ): Promise<AddToLaterResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 使用 upsert 创建或更新标记
    const mark = await this.prisma.tripFindingMark.upsert({
      where: {
        tripId_findingId_markType: {
          tripId,
          findingId,
          markType: 'later',
        },
      },
      update: {
        reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
        note: dto.note,
        createdAt: new Date(),
      },
      create: {
        tripId,
        findingId,
        markType: 'later',
        reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
        note: dto.note,
      },
    });

    this.logger.debug(`添加 finding ${findingId} 到稍后处理`);

    return {
      findingId,
      added: true,
      reminderDate: mark.reminderDate?.toISOString(),
      note: mark.note || undefined,
      addedAt: mark.createdAt.toISOString(),
    };
  }

  /**
   * 从稍后处理移除
   */
  async removeFromLater(
    tripId: string,
    findingId: string,
  ): Promise<{ findingId: string; removed: boolean }> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 删除标记
    await this.prisma.tripFindingMark.deleteMany({
      where: {
        tripId,
        findingId,
        markType: 'later',
      },
    });

    this.logger.debug(`从稍后处理移除 finding ${findingId}`);

    return {
      findingId,
      removed: true,
    };
  }

  /**
   * 获取稍后处理列表
   */
  async getLaterItems(tripId: string): Promise<GetLaterResponseDto> {
    // 验证行程是否存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 查询所有稍后处理标记
    const marks = await this.prisma.tripFindingMark.findMany({
      where: {
        tripId,
        markType: 'later',
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      laterItems: marks.map(
        (mark): LaterItemDto => ({
          findingId: mark.findingId,
          reminderDate: mark.reminderDate?.toISOString(),
          note: mark.note || undefined,
          addedAt: mark.createdAt.toISOString(),
        }),
      ),
    };
  }
}

