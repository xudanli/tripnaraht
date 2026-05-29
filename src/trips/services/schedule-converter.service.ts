// src/trips/services/schedule-converter.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DayScheduleResult,
  PlannedStop,
  ScheduleItineraryItemView,
} from '../../planning-policy/interfaces/scheduler.interface';

const DEFAULT_SCHEDULE_METRICS: DayScheduleResult['metrics'] = {
  totalTravelMin: 0,
  totalWalkMin: 0,
  totalTransfers: 0,
  totalQueueMin: 0,
  overtimeMin: 0,
  hpEnd: 100,
};
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
   * 归一化 PUT /schedule 请求体。
   * 支持：{ schedule }, 根级 DayScheduleResult（含 stops），或仅 { items }（GET 回写）。
   */
  normalizeDaySchedulePayload(body: unknown, dateISO: string): DayScheduleResult {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('请求体无效：需要 schedule 或 stops/items');
    }

    const raw = body as Record<string, unknown>;
    const candidate =
      (raw.schedule as DayScheduleResult | undefined) ??
      (Array.isArray(raw.stops) || Array.isArray(raw.items)
        ? (raw as unknown as DayScheduleResult)
        : undefined);

    if (!candidate || typeof candidate !== 'object') {
      throw new BadRequestException(
        '缺少 schedule：请传 { "schedule": { "stops": [...] } } 或根级 stops/items',
      );
    }

    let stops = Array.isArray(candidate.stops) ? candidate.stops : [];
    if (stops.length === 0 && Array.isArray(candidate.items) && candidate.items.length > 0) {
      stops = this.stopsFromScheduleItems(candidate.items, dateISO);
    }

    return {
      ...candidate,
      stops,
      metrics: candidate.metrics ?? DEFAULT_SCHEDULE_METRICS,
    };
  }

  private stopsFromScheduleItems(
    items: ScheduleItineraryItemView[],
    dateISO: string,
  ): PlannedStop[] {
    const dayStart = DateTime.fromISO(dateISO).startOf('day');

    return items
      .filter((item) => item.placeId != null)
      .map((item) => {
        const startMin = this.minutesFromScheduleItemTime(item, 'start', dayStart);
        const endMin = this.minutesFromScheduleItemTime(item, 'end', dayStart);
        const coords = item.Place?.coordinates;

        return {
          kind: 'POI' as const,
          id: `poi-${item.placeId}`,
          name: item.placeName ?? item.Place?.nameCN ?? item.Place?.nameEN ?? 'POI',
          startMin,
          endMin: Math.max(endMin, startMin + (item.durationMinutes ?? 30)),
          lat: coords?.lat ?? 0,
          lng: coords?.lng ?? 0,
          notes: item.note ? [item.note] : [],
        };
      });
  }

  private minutesFromScheduleItemTime(
    item: ScheduleItineraryItemView,
    which: 'start' | 'end',
    dayStart: DateTime,
  ): number {
    const iso = which === 'start' ? item.startTimeISO : item.endTimeISO;
    if (iso) {
      const dt = DateTime.fromISO(iso);
      if (dt.isValid) {
        return Math.round(dt.diff(dayStart, 'minutes').minutes);
      }
    }

    const hhmm = which === 'start' ? item.startTime : item.endTime;
    if (hhmm && /^\d{1,2}:\d{2}/.test(hhmm)) {
      const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        return h * 60 + m;
      }
    }

    return which === 'start' ? 9 * 60 : 10 * 60;
  }

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

    const stops = Array.isArray(schedule?.stops) ? schedule.stops : [];

    // 2. 将 stops 转换为 ItineraryItem
    const items = stops
      .filter(stop => stop.kind === 'POI') // 只处理 POI 类型的 stop
      .map((stop: PlannedStop, index: number) => {
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
          order: index + 1, // 🆕 设置显示顺序
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
        Place: true,
      },
      orderBy: { startTime: 'asc' },
    });

    if (items.length === 0) {
      return null;
    }

    const date = DateTime.fromISO(dateISO);
    const dayStart = date.startOf('day');
    const stops: PlannedStop[] = [];
    let totalTravelMin = 0;
    const totalWalkMin = 0;
    const totalTransfers = 0;
    const totalQueueMin = 0;
    const overtimeMin = 0;

    const scheduleItems: ScheduleItineraryItemView[] = [];
    let totalActivityMinutes = 0;
    let totalInterLegTravel = 0;
    let totalCost = 0;

    for (const item of items) {
      const startDt = item.startTime ? DateTime.fromJSDate(item.startTime) : null;
      const endDt = item.endTime ? DateTime.fromJSDate(item.endTime) : null;

      let durationMinutes: number | null = null;
      if (startDt && endDt) {
        durationMinutes = Math.round(endDt.diff(startDt, 'minutes').minutes);
        if (!Number.isNaN(durationMinutes) && durationMinutes >= 0) {
          totalActivityMinutes += durationMinutes;
        }
      }

      const legTravel = item.travelFromPreviousDuration ?? 0;
      if (legTravel > 0) {
        totalInterLegTravel += legTravel;
      }

      const rowCost = item.actualCost ?? item.estimatedCost;
      if (rowCost != null && typeof rowCost === 'number' && !Number.isNaN(rowCost)) {
        totalCost += rowCost;
      }

      const placeName =
        item.Place?.nameCN || item.Place?.nameEN || null;

      scheduleItems.push({
        id: item.id,
        type: String(item.type),
        order: item.order ?? null,
        placeId: item.placeId ?? null,
        trailId: item.trailId ?? null,
        startTime: startDt ? startDt.toFormat('HH:mm') : null,
        endTime: endDt ? endDt.toFormat('HH:mm') : null,
        startTimeISO: startDt ? startDt.toISO() : null,
        endTimeISO: endDt ? endDt.toISO() : null,
        durationMinutes,
        note: item.note ?? null,
        estimatedCost: item.estimatedCost ?? null,
        actualCost: item.actualCost ?? null,
        currency: item.currency ?? null,
        travelFromPreviousDuration: item.travelFromPreviousDuration ?? null,
        travelFromPreviousDistance: item.travelFromPreviousDistance ?? null,
        travelMode: item.travelMode ?? null,
        placeName,
        Place: item.Place
          ? {
              id: item.Place.id,
              nameCN: item.Place.nameCN ?? null,
              nameEN: item.Place.nameEN ?? null,
              address: item.Place.address ?? null,
              category: item.Place.category != null ? String(item.Place.category) : null,
              rating: item.Place.rating ?? null,
              coordinates: this.extractCoordinates((item.Place as { location?: unknown }).location),
            }
          : null,
      });

      if (item.Place && startDt && endDt) {
        const startMin = startDt.diff(dayStart, 'minutes').minutes;
        const endMin = endDt.diff(dayStart, 'minutes').minutes;

        stops.push({
          kind: 'POI',
          id: `poi-${item.Place.id}`,
          name: item.Place.nameEN || item.Place.nameCN,
          startMin,
          endMin,
          lat: this.extractLat(item.Place),
          lng: this.extractLng(item.Place),
          notes: item.note ? [item.note] : [],
        });

        if (stops.length > 1) {
          const prevStop = stops[stops.length - 2];
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
      items: scheduleItems,
      totalDuration: totalActivityMinutes + totalInterLegTravel,
      totalCost,
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
