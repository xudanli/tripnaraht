// src/trips/services/trip-conflicts.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { ConflictDto, ConflictType, ConflictSeverity, ConflictsResponseDto } from '../dto/trip-conflicts.dto';

@Injectable()
export class TripConflictsService {
  private readonly logger = new Logger(TripConflictsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取行程冲突列表
   */
  async getConflicts(
    tripId: string,
    date?: string,
    severity?: ConflictSeverity
  ): Promise<ConflictsResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          where: date
            ? {
                date: {
                  gte: DateTime.fromISO(date).startOf('day').toJSDate(),
                  lt: DateTime.fromISO(date).endOf('day').toJSDate(),
                },
              }
            : undefined,
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
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const conflicts: ConflictDto[] = [];

    // 检测所有日期的冲突
    for (const day of trip.TripDay) {
      const dayConflicts = await this.detectDayConflicts(tripId, day);
      conflicts.push(...dayConflicts);
    }

    // 应用严重程度过滤
    let filteredConflicts = conflicts;
    if (severity) {
      filteredConflicts = conflicts.filter(c => c.severity === severity);
    }

    return {
      tripId,
      conflicts: filteredConflicts,
      total: filteredConflicts.length,
    };
  }

  /**
   * 获取单日冲突
   */
  async getDayConflicts(tripId: string, dayId: string): Promise<ConflictDto[]> {
    const day = await this.prisma.tripDay.findUnique({
      where: { id: dayId },
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
    });

    if (!day) {
      return [];
    }

    return this.detectDayConflicts(tripId, day);
  }

  /**
   * 检测单日冲突
   */
  private async detectDayConflicts(tripId: string, day: any): Promise<ConflictDto[]> {
    const conflicts: ConflictDto[] = [];
    const items = day.ItineraryItem || [];
    const date = DateTime.fromJSDate(day.date).toISODate() || '';

    // 1. 检测时间冲突（排除 REST 类型的住宿项，因为酒店可以与其他活动时间重叠）
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (!current.endTime || !next.startTime) {
        continue;
      }

      // 🆕 如果其中一个是 REST 类型（酒店），跳过时间冲突检测
      // 因为酒店是跨天的住宿，可以与其他活动时间重叠
      if (current.type === 'REST' || next.type === 'REST') {
        continue;
      }

      const currentEnd = DateTime.fromJSDate(current.endTime);
      const nextStart = DateTime.fromJSDate(next.startTime);

      // 如果当前活动结束时间晚于下一个活动开始时间，存在时间冲突
      if (currentEnd > nextStart) {
        // 计算实际重叠时间（分钟）
        const overlapMinutes = Math.ceil(currentEnd.diff(nextStart, 'minutes').minutes);
        
        conflicts.push({
          id: `time-conflict-${current.id}-${next.id}`,
          type: ConflictType.TIME_CONFLICT,
          severity: ConflictSeverity.HIGH,
          title: '时间冲突',
          description: `活动 "${current.Place?.nameCN || current.Place?.nameEN || '未知'}" 与 "${next.Place?.nameCN || next.Place?.nameEN || '未知'}" 时间重叠 ${overlapMinutes} 分钟`,
          affectedDays: [date],
          affectedItemIds: [current.id, next.id],
          overlapMinutes: overlapMinutes, // 添加重叠时间信息
          suggestions: [
            {
              action: '调整时间',
              description: '调整其中一个活动的开始或结束时间',
              impact: '解决时间冲突，确保行程可行',
            },
          ],
        });
      }
    }

    // 2. 检测午餐时间窗
    const lunchWindow = this.detectLunchWindow(items);
    if (lunchWindow && lunchWindow.duration < 60) {
      conflicts.push({
        id: `lunch-window-${date}`,
        type: ConflictType.LUNCH_WINDOW,
        severity: ConflictSeverity.MEDIUM,
        title: '午餐时间窗过短',
        description: `午餐时间窗仅 ${lunchWindow.duration} 分钟，建议至少 60 分钟`,
        affectedDays: [date],
        affectedItemIds: lunchWindow.itemIds,
        suggestions: [
          {
            action: '延长午餐时间',
            description: '调整前后活动时间，为午餐留出更多时间',
            impact: '确保有足够时间用餐',
          },
        ],
      });
    }

    // 3. 检测疲劳超标
    let totalFatigue = 0;
    for (const item of items) {
      if (item.Place?.physicalMetadata) {
        const physical = item.Place.physicalMetadata as any;
        totalFatigue += physical.fatigueScore || 0;
      }
    }

    if (totalFatigue > 80) {
      conflicts.push({
        id: `fatigue-exceeded-${date}`,
        type: ConflictType.FATIGUE_EXCEEDED,
        severity: ConflictSeverity.HIGH,
        title: '体力超标',
        description: `当日疲劳指数 ${totalFatigue.toFixed(1)}，超过建议值 80`,
        affectedDays: [date],
        affectedItemIds: items.map((i: any) => i.id),
        suggestions: [
          {
            action: '减少活动',
            description: '移除部分高强度活动或增加休息时间',
            impact: '降低疲劳指数，提高行程舒适度',
          },
        ],
      });
    }

    // 4. 检测缓冲不足
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (!current.endTime || !next.startTime) {
        continue;
      }

      const currentEnd = DateTime.fromJSDate(current.endTime);
      const nextStart = DateTime.fromJSDate(next.startTime);
      const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;

      // 如果缓冲时间少于 15 分钟，可能存在风险
      if (bufferMinutes < 15 && bufferMinutes > 0) {
        conflicts.push({
          id: `buffer-insufficient-${current.id}-${next.id}`,
          type: ConflictType.BUFFER_INSUFFICIENT,
          severity: ConflictSeverity.MEDIUM,
          title: '缓冲时间不足',
          description: `活动 "${current.Place?.nameCN || current.Place?.nameEN || '未知'}" 到 "${next.Place?.nameCN || next.Place?.nameEN || '未知'}" 之间缓冲时间仅 ${bufferMinutes} 分钟`,
          affectedDays: [date],
          affectedItemIds: [current.id, next.id],
          suggestions: [
            {
              action: '增加缓冲时间',
              description: '调整活动时间，增加至少 15 分钟缓冲',
              impact: '降低行程延误风险',
            },
          ],
        });
      }
    }

    // 5. 检测闭园风险
    for (const item of items) {
      if (item.Place?.metadata) {
        const metadata = item.Place.metadata as any;
        const openingHours = metadata.openingHours;

        if (openingHours && item.endTime) {
          const itemEnd = DateTime.fromJSDate(item.endTime);
          const closingTime = this.parseClosingTime(openingHours, day.date);

          if (closingTime && itemEnd > closingTime.minus({ minutes: 30 })) {
            conflicts.push({
              id: `closure-risk-${item.id}`,
              type: ConflictType.CLOSURE_RISK,
              severity: ConflictSeverity.MEDIUM,
              title: '闭园风险',
              description: `活动 "${item.Place?.nameCN || item.Place?.nameEN || '未知'}" 可能接近闭园时间`,
              affectedDays: [date],
              affectedItemIds: [item.id],
              suggestions: [
                {
                  action: '提前活动时间',
                  description: '将活动时间提前，确保在闭园前完成',
                  impact: '避免无法完成活动',
                },
              ],
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * 检测午餐时间窗
   */
  private detectLunchWindow(items: any[]): { duration: number; itemIds: string[] } | null {
    // 查找 11:00-14:00 之间的时间窗
    let lunchStart: DateTime | null = null;
    let lunchEnd: DateTime | null = null;
    const itemIds: string[] = [];

    for (const item of items) {
      if (!item.startTime) continue;

      const start = DateTime.fromJSDate(item.startTime);
      const hour = start.hour;

      // 如果活动在午餐时间范围内
      if (hour >= 11 && hour < 14) {
        if (!lunchStart) {
          lunchStart = start;
        }
        lunchEnd = item.endTime ? DateTime.fromJSDate(item.endTime) : start.plus({ hours: 1 });
        itemIds.push(item.id);
      }
    }

    if (lunchStart && lunchEnd) {
      const duration = lunchEnd.diff(lunchStart, 'minutes').minutes;
      return { duration, itemIds };
    }

    return null;
  }

  /**
   * 解析闭园时间
   */
  private parseClosingTime(openingHours: any, date: Date): DateTime | null {
    // 简化处理：假设 openingHours 是字符串或对象
    // 实际应该根据具体格式解析
    if (typeof openingHours === 'string') {
      // 尝试解析字符串格式
      const match = openingHours.match(/(\d{2}):(\d{2})/);
      if (match) {
        const hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        return DateTime.fromJSDate(date).set({ hour, minute });
      }
    }

    return null;
  }
}

