// src/trips/services/schedule-converter.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DayScheduleResult, PlannedStop } from '../../planning-policy/interfaces/scheduler.interface';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';

/**
 * Schedule 转换服务
 * 
 * 负责在 DayScheduleResult（算法结构）和 ItineraryItem（数据库结构）之间转换
 */
@Injectable()
export class ScheduleConverterService {
  constructor(private prisma: PrismaService) {}

  /**
   * 将 DayScheduleResult 转换为 ItineraryItem 并保存到数据库
   * 
   * @param tripId 行程 ID
   * @param tripDayId 行程日期 ID
   * @param schedule DayScheduleResult
   * @param dateISO 日期（YYYY-MM-DD）
   */
  async saveScheduleToDatabase(
    tripId: string,
    tripDayId: string,
    schedule: DayScheduleResult,
    dateISO: string
  ) {
    // 1. 删除该日期现有的所有 ItineraryItem
    await this.prisma.itineraryItem.deleteMany({
      where: { tripDayId },
    });

    // 2. 将 stops 转换为 ItineraryItem
    const items = schedule.stops
      .filter(stop => stop.kind === 'POI') // 只处理 POI 类型的 stop
      .map((stop: PlannedStop) => {
        const date = DateTime.fromISO(dateISO);
        const startTime = date.startOf('day').plus({ minutes: stop.startMin }).toJSDate();
        const endTime = date.startOf('day').plus({ minutes: stop.endMin }).toJSDate();

        return {
          id: randomUUID(),
          tripDayId,
          placeId: stop.id ? parseInt(stop.id.replace('poi-', ''), 10) : null,
          type: this.mapStopKindToItemType(stop.kind),
          startTime,
          endTime,
          note: stop.notes?.join('; ') || null,
        };
      });

    // 3. 批量创建 ItineraryItem
    if (items.length > 0) {
      await this.prisma.itineraryItem.createMany({
        data: items as any,
      });
    }

    return items;
  }

  /**
   * 从数据库读取 ItineraryItem 并转换为 DayScheduleResult
   * 
   * @param tripDayId 行程日期 ID
   * @param dateISO 日期（YYYY-MM-DD）
   * @returns DayScheduleResult 或 null
   */
  async loadScheduleFromDatabase(
    tripDayId: string,
    dateISO: string
  ): Promise<DayScheduleResult | null> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId },
      include: {
        place: true,
      },
      orderBy: { startTime: 'asc' },
    });

    if (items.length === 0) {
      return null;
    }

    const date = DateTime.fromISO(dateISO);
    const stops: PlannedStop[] = [];
    let totalTravelMin = 0;
    let totalWalkMin = 0;
    let totalTransfers = 0;
    let totalQueueMin = 0;
    let overtimeMin = 0;

    for (const item of items) {
      const startTime = DateTime.fromJSDate(item.startTime!);
      const endTime = DateTime.fromJSDate(item.endTime!);
      const startMin = startTime.diff(date.startOf('day'), 'minutes').minutes;
      const endMin = endTime.diff(date.startOf('day'), 'minutes').minutes;

      if (item.place) {
        stops.push({
          kind: 'POI',
          id: `poi-${item.place.id}`,
          name: item.place.nameEN || item.place.nameCN,
          startMin,
          endMin,
          lat: this.extractLat(item.place),
          lng: this.extractLng(item.place),
          notes: item.note ? [item.note] : [],
        });

        // 计算交通时间（如果有 transitIn）
        // 这里简化处理，实际应该从 transitIn 中提取
        if (stops.length > 1) {
          const prevStop = stops[stops.length - 2];
          // 估算交通时间（可以根据实际需求优化）
          const transitTime = Math.max(0, startMin - prevStop.endMin);
          totalTravelMin += transitTime;
        }
      }
    }

    return {
      stops,
      metrics: {
        totalTravelMin,
        totalWalkMin,
        totalTransfers,
        totalQueueMin,
        overtimeMin,
        hpEnd: 100, // 默认值，实际应该从调度结果中获取
      },
    };
  }

  /**
   * 将 stop kind 映射到 ItemType
   */
  private mapStopKindToItemType(kind: string): string {
    switch (kind) {
      case 'POI':
        return 'ACTIVITY';
      case 'REST':
        return 'REST';
      case 'MEAL':
        return 'MEAL_ANCHOR';
      default:
        return 'ACTIVITY';
    }
  }

  /**
   * 从 Place 提取纬度
   */
  private extractLat(place: any): number {
    const location = place.location;
    if (!location) return 0;
    const coords = this.extractCoordinates(location);
    return coords?.lat || 0;
  }

  /**
   * 从 Place 提取经度
   */
  private extractLng(place: any): number {
    const location = place.location;
    if (!location) return 0;
    const coords = this.extractCoordinates(location);
    return coords?.lng || 0;
  }

  /**
   * 提取坐标（从 PostGIS POINT 格式）
   */
  private extractCoordinates(location: any): { lat: number; lng: number } | null {
    if (!location) return null;

    if (typeof location === 'string') {
      const match = location.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
        return { lat, lng };
      }
    }

    if (typeof location === 'object') {
      if (location.coordinates) {
        return { lng: location.coordinates[0], lat: location.coordinates[1] };
      }
      if (location.lat && location.lng) {
        return { lat: location.lat, lng: location.lng };
      }
    }

    return null;
  }
}
