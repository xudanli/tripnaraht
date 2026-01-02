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
    let totalDrive = 0; // 分钟
    let totalBuffer = 0; // 分钟
    let totalFatigue = 0;
    let totalAscent = 0; // 米
    let totalCost = 0;

    // 计算步行距离和车程
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      // Place 的 location 字段可能是 lat/lng 或者 location 对象
      const currentLat = (current.Place as any)?.lat || (current.Place as any)?.location?.lat;
      const currentLng = (current.Place as any)?.lng || (current.Place as any)?.location?.lng;
      const nextLat = (next.Place as any)?.lat || (next.Place as any)?.location?.lat;
      const nextLng = (next.Place as any)?.lng || (next.Place as any)?.location?.lng;

      if (!currentLat || !currentLng || !nextLat || !nextLng) {
        continue;
      }

      const distance = this.haversineDistance(
        currentLat,
        currentLng,
        nextLat,
        nextLng
      );

      // 判断是步行还是车程（简化：距离 < 2km 为步行，否则为车程）
      if (distance < 2) {
        totalWalk += distance;
      } else {
        // 车程时间估算：假设平均速度 50 km/h
        totalDrive += Math.round((distance / 50) * 60);
      }

      // 计算缓冲时间
      if (current.endTime && next.startTime) {
        const currentEnd = DateTime.fromJSDate(current.endTime);
        const nextStart = DateTime.fromJSDate(next.startTime);
        const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
        if (bufferMinutes > 0) {
          totalBuffer += bufferMinutes;
        }
      }
    }

    // 计算疲劳指数和爬升
    for (const item of items) {
      if (item.Place?.physicalMetadata) {
        const physical = item.Place.physicalMetadata as any;
        totalFatigue += physical.fatigueScore || 0;
        totalAscent += physical.elevationGain || 0;
      }

      // 计算花费
      if (item.Place?.metadata) {
        const metadata = item.Place.metadata as any;
        totalCost += metadata.cost || metadata.price || 0;
      }
    }

    return {
      walk: Math.round(totalWalk * 100) / 100, // 保留两位小数
      drive: totalDrive,
      buffer: totalBuffer,
      fatigue: Math.min(100, totalFatigue), // 限制在 0-100
      ascent: totalAscent,
      cost: totalCost,
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

