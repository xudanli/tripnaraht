// src/trips/services/trip-metrics.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { DayMetricsResponseDto, TripMetricsResponseDto, TripMetricsSummaryDto } from '../dto/trip-metrics.dto';
import { TripConflictsService } from './trip-conflicts.service';

@Injectable()
export class TripMetricsService {
  private readonly logger = new Logger(TripMetricsService.name);

  constructor(
    private prisma: PrismaService,
    private conflictsService: TripConflictsService
  ) {}

  /**
   * 获取每日指标
   */
  async getDayMetrics(tripId: string, dayId: string): Promise<DayMetricsResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
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
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const day = trip.TripDay[0];
    if (!day) {
      throw new NotFoundException(`日期 ID ${dayId} 不存在`);
    }

    const date = DateTime.fromJSDate(day.date).toISODate() || '';
    const metrics = await this.calculateDayMetrics(day);
    const conflicts = await this.conflictsService.getDayConflicts(tripId, dayId);

    return {
      date,
      metrics,
      conflicts: conflicts as any, // ConflictDto 类型兼容，但包含更多字段
    };
  }

  /**
   * 批量获取多日指标
   */
  async getTripMetrics(tripId: string, dates?: string[]): Promise<TripMetricsResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          where: dates
            ? {
                date: {
                  in: dates.map(d => DateTime.fromISO(d).toJSDate()),
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

    const days: DayMetricsResponseDto[] = [];
    for (const day of trip.TripDay) {
      const date = DateTime.fromJSDate(day.date).toISODate() || '';
      const metrics = await this.calculateDayMetrics(day);
      const conflicts = await this.conflictsService.getDayConflicts(tripId, day.id);
      
      days.push({
        date,
        metrics,
        conflicts: conflicts as any, // ConflictDto 类型兼容，但包含更多字段
      });
    }

    const summary = this.calculateSummary(days);

    return {
      tripId,
      days,
      summary,
    };
  }

  /**
   * 计算每日指标
   */
  private async calculateDayMetrics(day: any): Promise<DayMetricsResponseDto['metrics']> {
    const items = day.ItineraryItem || [];
    
    let totalWalk = 0; // 公里
    let totalDrive = 0; // 分钟 (兼容旧字段)
    let totalBuffer = 0; // 分钟
    let totalFatigue = 0;
    let totalAscent = 0; // 米
    let totalCost = 0;
    let totalDistance = 0; // 米
    let totalTravelTime = 0; // 分钟

    // 按交通方式分类的时间
    const travelByMode = {
      walking: 0,
      driving: 0,
      transit: 0,
      train: 0,
      flight: 0,
      ferry: 0,
      bicycle: 0,
      taxi: 0,
    };

    // 使用新的交通信息字段计算
    for (let i = 1; i < items.length; i++) {
      const current = items[i];
      const prev = items[i - 1];

      const distance = current.travelFromPreviousDistance || 0; // 米
      const duration = current.travelFromPreviousDuration || 0; // 分钟
      const travelMode = (current.travelMode || 'DRIVING').toUpperCase();

      totalDistance += distance;
      totalTravelTime += duration;

      // 按交通方式分类计算时间
      switch (travelMode) {
        case 'WALKING':
          travelByMode.walking += duration;
          totalWalk += distance / 1000; // 步行距离（公里）
          break;
        case 'DRIVING':
          travelByMode.driving += duration;
          totalDrive += duration;
          break;
        case 'TRANSIT':
          travelByMode.transit += duration;
          totalDrive += duration;
          break;
        case 'TRAIN':
          travelByMode.train += duration;
          totalDrive += duration;
          break;
        case 'FLIGHT':
          travelByMode.flight += duration;
          totalDrive += duration;
          break;
        case 'FERRY':
          travelByMode.ferry += duration;
          totalDrive += duration;
          break;
        case 'BICYCLE':
          travelByMode.bicycle += duration;
          totalWalk += distance / 1000; // 骑行也算入步行距离
          break;
        case 'TAXI':
          travelByMode.taxi += duration;
          totalDrive += duration;
          break;
        default:
          // 未知类型，根据距离判断
          if (distance < 2000) {
            travelByMode.walking += duration;
            totalWalk += distance / 1000;
          } else {
            travelByMode.driving += duration;
            totalDrive += duration;
          }
      }

      // 计算缓冲时间
      if (prev.endTime && current.startTime) {
        const prevEnd = DateTime.fromJSDate(prev.endTime);
        const currentStart = DateTime.fromJSDate(current.startTime);
        const bufferMinutes = currentStart.diff(prevEnd, 'minutes').minutes;
        
        // 减去交通时间，得到实际缓冲时间
        const actualBuffer = bufferMinutes - duration;
        if (actualBuffer > 0) {
          totalBuffer += actualBuffer;
        }
      }
    }

    // 计算疲劳指数和爬升
    for (const item of items) {
      if (item.Place?.physicalMetadata) {
        const physical = item.Place.physicalMetadata as any;
        totalFatigue += physical.fatigueScore || 0;
        totalAscent += physical.elevationGain || physical.elevation || 0;
      }

      // 计算花费（使用行程项的费用字段）
      totalCost += item.estimatedCost || item.actualCost || 0;
      
      // 如果行程项没有费用，尝试从 Place 获取
      if (!item.estimatedCost && !item.actualCost && item.Place?.metadata) {
        const metadata = item.Place.metadata as any;
        totalCost += metadata.cost || metadata.price || 0;
      }
    }

    return {
      walk: Math.round(totalWalk * 100) / 100,
      drive: totalDrive,
      buffer: Math.max(0, totalBuffer),
      fatigue: Math.min(100, totalFatigue),
      ascent: totalAscent,
      cost: totalCost,
      travelByMode,
      totalTravelTime,
      totalDistance,
    };
  }

  /**
   * 计算摘要
   */
  private calculateSummary(days: DayMetricsResponseDto[]): TripMetricsSummaryDto {
    const totalWalk = days.reduce((sum, day) => sum + day.metrics.walk, 0);
    const totalDrive = days.reduce((sum, day) => sum + day.metrics.drive, 0);
    const totalBuffer = days.reduce((sum, day) => sum + day.metrics.buffer, 0);
    const totalFatigue = days.reduce((sum, day) => sum + day.metrics.fatigue, 0);
    const totalCost = days.reduce((sum, day) => sum + day.metrics.cost, 0);

    const dayCount = days.length || 1;

    return {
      totalWalk: Math.round(totalWalk * 100) / 100,
      totalDrive,
      totalBuffer,
      totalFatigue: Math.min(100, totalFatigue),
      totalCost,
      averageWalkPerDay: Math.round((totalWalk / dayCount) * 100) / 100,
      averageDrivePerDay: Math.round(totalDrive / dayCount),
    };
  }

  /**
   * Haversine 距离计算（公里）
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

