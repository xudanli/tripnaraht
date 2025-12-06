// src/itinerary-items/itinerary-items.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItineraryItemDto, ItemType } from './dto/create-itinerary-item.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { DateTime } from 'luxon';

@Injectable()
export class ItineraryItemsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 创建行程项（带智能校验）
   * 
   * 校验逻辑：
   * 1. 基础逻辑校验：结束时间必须晚于开始时间
   * 2. 营业状态校验：如果关联了地点，检查指定时间是否营业
   * 
   * @param dto 创建行程项的输入数据
   * @returns 创建成功的 ItineraryItem 对象（包含关联的 Place 信息）
   */
  async create(dto: CreateItineraryItemDto) {
    // ============================================
    // 步骤 1: 基础逻辑校验
    // ============================================
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    // 验证日期有效性
    if (isNaN(start.getTime())) {
      throw new BadRequestException('无效的开始时间');
    }
    if (isNaN(end.getTime())) {
      throw new BadRequestException('无效的结束时间');
    }

    // 结束时间必须晚于开始时间
    if (start >= end) {
      throw new BadRequestException('结束时间必须晚于开始时间');
    }

    // ============================================
    // 步骤 2: 验证 TripDay 是否存在
    // ============================================
    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: dto.tripDayId },
      include: { trip: true }
    });

    if (!tripDay) {
      throw new NotFoundException(`找不到指定的行程日期 (ID: ${dto.tripDayId})`);
    }

    // ============================================
    // 步骤 3: 智能营业时间校验（如果关联了地点）
    // ============================================
    // 只有当类型是 ACTIVITY 或 MEAL_ANCHOR 时才需要检查营业时间
    // TRANSIT、REST、MEAL_FLOATING 通常不需要检查
    if (dto.placeId && (dto.type === ItemType.ACTIVITY || dto.type === ItemType.MEAL_ANCHOR)) {
      const place = await this.prisma.place.findUnique({
        where: { id: dto.placeId },
        include: { city: true } // 获取城市信息（可能需要时区）
      });

      if (!place) {
        throw new NotFoundException(`找不到指定地点 (ID: ${dto.placeId})`);
      }

      // 获取元数据中的营业时间和时区
      const meta = place.metadata as any;
      const openingHours = meta?.openingHours;
      const timezone = meta?.timezone || 'Atlantic/Reykjavik'; // 默认冰岛时区

      // 如果地点有营业时间信息，进行校验
      if (openingHours) {
        // 获取指定日期的营业时间字符串
        const hoursStr = OpeningHoursUtil.getHoursForDate(meta, start, timezone);

        // 如果当天不营业
        if (hoursStr === 'Closed' || !hoursStr) {
          const dateStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
          throw new BadRequestException(
            `${place.name} 在 ${dateStr} 不营业`
          );
        }

        // 检查开始时间是否在营业时间内
        const isOpenAtStart = OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);

        if (!isOpenAtStart) {
          // 格式化时间显示
          const startTimeStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('HH:mm');
          const dateStr = DateTime.fromJSDate(start).setZone(timezone).toFormat('yyyy-MM-dd cccc', { locale: 'zh-CN' });
          
          throw new BadRequestException(
            `时间冲突警告：${place.name} 在 ${dateStr} ${startTimeStr} 可能未营业 (营业时间: ${hoursStr})`
          );
  }

        // 可选：检查结束时间是否也在营业时间内（更严格的校验）
        // 这里只检查开始时间，因为有些活动可能跨营业时间（如：10:00-12:00，但店铺 11:30 关门）
        // 如果需要更严格的校验，可以取消下面的注释
        /*
        const isOpenAtEnd = OpeningHoursUtil.isOpenAt(hoursStr, end, timezone);
        if (!isOpenAtEnd) {
          const endTimeStr = DateTime.fromJSDate(end).setZone(timezone).toFormat('HH:mm');
          throw new BadRequestException(
            `时间冲突警告：${place.name} 在 ${endTimeStr} 可能已关门 (营业时间: ${hoursStr})`
          );
        }
        */
      }
    }

    // ============================================
    // 步骤 4: 写入数据库
    // ============================================
    return this.prisma.itineraryItem.create({
      data: {
        tripDayId: dto.tripDayId,
        placeId: dto.placeId,
        type: dto.type as any, // Prisma 枚举类型
        startTime: start,
        endTime: end,
        note: dto.note,
      },
      include: {
        place: {
          include: {
            city: true,
          },
        },
        tripDay: {
          include: {
            trip: true,
          },
        },
      },
    });
  }

  /**
   * 获取所有行程项
   */
  async findAll() {
    return this.prisma.itineraryItem.findMany({
      include: {
        place: true,
        tripDay: {
          include: {
            trip: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  /**
   * 根据 ID 获取单个行程项
   */
  async findOne(id: string) {
    return this.prisma.itineraryItem.findUnique({
      where: { id },
      include: {
        place: {
          include: {
            city: true,
          },
        },
        tripDay: {
          include: {
            trip: true,
            items: {
              orderBy: {
                startTime: 'asc',
              },
            },
          },
        },
      },
    });
  }

  /**
   * 获取指定 TripDay 的所有行程项
   */
  async findByTripDay(tripDayId: string) {
    return this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      include: {
        place: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  /**
   * 更新行程项
   */
  async update(id: string, updateDto: Partial<CreateItineraryItemDto>) {
    // 如果更新了时间，需要重新校验
    if (updateDto.startTime || updateDto.endTime) {
      // 获取现有数据
      const existing = await this.prisma.itineraryItem.findUnique({
        where: { id },
        include: { place: true },
      });

      if (!existing) {
        throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
      }

      const start = updateDto.startTime ? new Date(updateDto.startTime) : existing.startTime;
      const end = updateDto.endTime ? new Date(updateDto.endTime) : existing.endTime;

      // 基础校验
      if (start >= end) {
        throw new BadRequestException('结束时间必须晚于开始时间');
      }

      // 如果关联了地点，重新校验营业时间
      if (existing.placeId && existing.place) {
        const meta = existing.place.metadata as any;
        const timezone = meta?.timezone || 'Atlantic/Reykjavik';
        const hoursStr = OpeningHoursUtil.getHoursForDate(meta, start, timezone);

        if (hoursStr !== 'Closed' && hoursStr) {
          const isOpen = OpeningHoursUtil.isOpenAt(hoursStr, start, timezone);
          if (!isOpen) {
            throw new BadRequestException(
              `时间冲突警告：${existing.place.name} 在指定时间可能未营业 (营业时间: ${hoursStr})`
            );
          }
        }
      }
    }

    return this.prisma.itineraryItem.update({
      where: { id },
      data: {
        ...(updateDto.placeId !== undefined && { placeId: updateDto.placeId }),
        ...(updateDto.type && { type: updateDto.type as any }),
        ...(updateDto.startTime && { startTime: new Date(updateDto.startTime) }),
        ...(updateDto.endTime && { endTime: new Date(updateDto.endTime) }),
        ...(updateDto.note !== undefined && { note: updateDto.note }),
      },
      include: {
        place: true,
        tripDay: true,
      },
    });
  }

  /**
   * 删除行程项
   */
  async remove(id: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${id})`);
    }

    return this.prisma.itineraryItem.delete({
      where: { id },
    });
  }
}
