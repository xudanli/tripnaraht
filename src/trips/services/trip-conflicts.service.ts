// src/trips/services/trip-conflicts.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { ConflictDto, ConflictType, ConflictSeverity, ConflictsResponseDto } from '../dto/trip-conflicts.dto';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';

const DEFAULT_BUFFER_MINUTES = Number(process.env.TRIP_CONFLICT_BUFFER_MINUTES) || 15;

@Injectable()
export class TripConflictsService {
  private readonly logger = new Logger(TripConflictsService.name);

  constructor(
    private prisma: PrismaService,
    private smartRoutesService: SmartRoutesService,
  ) {}

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
    for (let i = 0; i < trip.TripDay.length; i++) {
      const dayConflicts = await this.detectDayConflicts(tripId, trip.TripDay[i], i + 1);
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

    // 获取 dayIndex（1-based）以正确关联 evidenceIds
    const trip = await this.prisma.trip.findUnique({
      where: { id: day.tripId },
      include: { TripDay: { orderBy: { date: 'asc' } } },
    });
    const idx = trip?.TripDay.findIndex((d) => d.id === day.id) ?? -1;
    const dayIndex = idx >= 0 ? idx + 1 : 1;

    return this.detectDayConflicts(tripId, day, dayIndex);
  }

  /**
   * 检测单日冲突
   * @param dayIndex 1-based 天数索引，用于与证据 ID 关联（ev-place-{id}-day-{dayIndex}-opening-hours）
   */
  private async detectDayConflicts(tripId: string, day: any, dayIndex: number): Promise<ConflictDto[]> {
    const conflicts: ConflictDto[] = [];
    const items = day.ItineraryItem || [];
    const date = DateTime.fromJSDate(day.date).toISODate() || '';

    // 获取 Place 坐标（用于交通时间检测）
    const placeIds = items.map((i: any) => i.placeId).filter((id: any) => id != null) as number[];
    const coordsMap = await this.getPlaceCoordinatesMap(placeIds);

    // 记录已报告 TRANSPORT_INSUFFICIENT 的行程项对，避免重复报告 BUFFER_INSUFFICIENT
    const transportInsufficientPairs = new Set<string>();

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

    // 1.5 🆕 检测交通时间不足（可用时间 < 交通时间 + 缓冲）
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (!current.endTime || !next.startTime || current.type === 'REST' || next.type === 'REST') {
        continue;
      }

      const fromCoords = current.placeId ? coordsMap.get(current.placeId) : null;
      const toCoords = next.placeId ? coordsMap.get(next.placeId) : null;
      if (!fromCoords || !toCoords) continue;

      const currentEnd = DateTime.fromJSDate(current.endTime);
      const nextStart = DateTime.fromJSDate(next.startTime);
      const availableMinutes = nextStart.diff(currentEnd, 'minutes').minutes;

      // 已有时间重叠则跳过（TIME_CONFLICT 已覆盖）
      if (availableMinutes <= 0) continue;

      const distanceKm = this.calculateHaversineDistance(
        fromCoords.lat, fromCoords.lng,
        toCoords.lat, toCoords.lng
      );
      // 优先使用行程项存储的实际交通时间；若无则调用路线 API（与行程展示一致）；最后回退到直线距离估算
      let travelTimeMinutes =
        next.travelFromPreviousDuration != null && next.travelFromPreviousDuration > 0
          ? next.travelFromPreviousDuration
          : null;
      if (travelTimeMinutes == null) {
        const travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' =
          distanceKm < 2 ? 'WALKING' : distanceKm < 50 ? 'DRIVING' : 'TRANSIT';
        try {
          const routes = await this.smartRoutesService.getRoutes(
            fromCoords.lat, fromCoords.lng,
            toCoords.lat, toCoords.lng,
            travelMode
          );
          if (routes.length > 0 && routes[0].durationMinutes) {
            travelTimeMinutes = routes[0].durationMinutes;
          }
        } catch (e) {
          this.logger.debug(`路线 API 调用失败，使用估算: ${(e as Error)?.message}`);
        }
        if (travelTimeMinutes == null) {
          travelTimeMinutes = this.estimateTravelTimeMinutes(distanceKm);
        }
      }
      const requiredMinutes = travelTimeMinutes + DEFAULT_BUFFER_MINUTES;

      if (availableMinutes < requiredMinutes) {
        const shortfallMinutes = Math.ceil(requiredMinutes - availableMinutes);
        transportInsufficientPairs.add(`${current.id}-${next.id}`);

        conflicts.push({
          id: `transport-insufficient-${current.id}-${next.id}`,
          type: ConflictType.TRANSPORT_INSUFFICIENT,
          severity: ConflictSeverity.HIGH,
          title: '交通时间不足',
          description: `从「${current.Place?.nameCN || current.Place?.nameEN || '未知'}」到「${next.Place?.nameCN || next.Place?.nameEN || '未知'}」需要约 ${travelTimeMinutes} 分钟，但仅预留了 ${Math.round(availableMinutes)} 分钟（差 ${shortfallMinutes} 分钟）`,
          affectedDays: [date],
          affectedItemIds: [current.id, next.id],
          travelTimeMinutes,
          availableMinutes: Math.round(availableMinutes),
          shortfallMinutes,
          distanceKm: Math.round(distanceKm * 10) / 10,
          suggestions: [
            {
              action: '调整时间',
              description: `将下一活动开始时间延后至少 ${shortfallMinutes} 分钟`,
              impact: '确保有足够时间完成交通',
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

    // 4. 检测缓冲不足（若已报告 TRANSPORT_INSUFFICIENT 则跳过，避免重复）
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (!current.endTime || !next.startTime) {
        continue;
      }

      if (transportInsufficientPairs.has(`${current.id}-${next.id}`)) {
        continue;
      }

      const currentEnd = DateTime.fromJSDate(current.endTime);
      const nextStart = DateTime.fromJSDate(next.startTime);
      const bufferMinutes = nextStart.diff(currentEnd, 'minutes').minutes;

      // 如果缓冲时间少于 15 分钟，可能存在风险
      if (bufferMinutes < DEFAULT_BUFFER_MINUTES && bufferMinutes > 0) {
        const shortfallMinutes = DEFAULT_BUFFER_MINUTES - bufferMinutes;
        conflicts.push({
          id: `buffer-insufficient-${current.id}-${next.id}`,
          type: ConflictType.BUFFER_INSUFFICIENT,
          severity: ConflictSeverity.MEDIUM,
          title: '缓冲时间不足',
          description: `活动 "${current.Place?.nameCN || current.Place?.nameEN || '未知'}" 到 "${next.Place?.nameCN || next.Place?.nameEN || '未知'}" 之间缓冲时间仅 ${bufferMinutes} 分钟`,
          affectedDays: [date],
          affectedItemIds: [current.id, next.id],
          shortfallMinutes,
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

    // 5. 检测闭园风险（支持 openingHours、opening_hours、visit_info.opening_hours）
    for (const item of items) {
      if (item.Place?.metadata && item.endTime) {
        const metadata = item.Place.metadata as any;
        const openingHours =
          metadata.openingHours ??
          metadata.opening_hours ??
          metadata.visit_info?.opening_hours;

        if (openingHours) {
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
   * 计算 11:00-14:00 内最长的连续空闲时间（可用于午餐），若 < 60 分钟则报告冲突
   */
  private detectLunchWindow(items: any[]): { duration: number; itemIds: string[] } | null {
    if (items.length === 0) return null;

    // 按开始时间排序，避免迭代顺序导致 lunchEnd < lunchStart 产生负值
    const sorted = [...items].filter((i) => i.startTime).sort(
      (a, b) => (a.startTime as Date).getTime() - (b.startTime as Date).getTime(),
    );
    if (sorted.length === 0) return null;

    // 取当天日期（用第一个活动的日期）
    const firstStart = DateTime.fromJSDate(sorted[0].startTime);
    const dayStart = firstStart.startOf('day');
    const windowStart = dayStart.set({ hour: 11, minute: 0 });
    const windowEnd = dayStart.set({ hour: 14, minute: 0 });

    // 找出 11:00-14:00 内与窗口重叠的活动
    const overlapping: Array<{ start: DateTime; end: DateTime; id: string }> = [];
    for (const item of sorted) {
      const start = DateTime.fromJSDate(item.startTime);
      const end = item.endTime ? DateTime.fromJSDate(item.endTime) : start.plus({ hours: 1 });
      // 与 11:00-14:00 有重叠
      if (start < windowEnd && end > windowStart) {
        overlapping.push({
          start: start > windowStart ? start : windowStart,
          end: end < windowEnd ? end : windowEnd,
          id: item.id,
        });
      }
    }

    if (overlapping.length === 0) {
      // 11:00-14:00 完全空闲
      return { duration: 180, itemIds: [] };
    }

    // 合并重叠区间，计算最长空闲段
    overlapping.sort((a, b) => a.start.toMillis() - b.start.toMillis());
    const merged: Array<{ start: DateTime; end: DateTime }> = [overlapping[0]];
    for (let i = 1; i < overlapping.length; i++) {
      const last = merged[merged.length - 1];
      if (overlapping[i].start <= last.end) {
        last.end = overlapping[i].end > last.end ? overlapping[i].end : last.end;
      } else {
        merged.push(overlapping[i]);
      }
    }

    // 最长空闲 = max(窗口开始到第一段开始, 段与段之间, 最后一段结束到窗口结束)
    let maxGap = 0;
    let prevEnd = windowStart;
    for (const seg of merged) {
      const gap = seg.start.diff(prevEnd, 'minutes').minutes;
      if (gap > maxGap) maxGap = gap;
      prevEnd = seg.end;
    }
    const gapAfterLast = windowEnd.diff(prevEnd, 'minutes').minutes;
    if (gapAfterLast > maxGap) maxGap = gapAfterLast;

    const duration = Math.max(0, maxGap);
    const itemIds = overlapping.map((o) => o.id);
    return { duration, itemIds };
  }

  /**
   * 解析闭园时间
   * 支持：字符串 "08:00-22:00"（取结束时间）、"22:00"、对象 osmFormat/weekday
   */
  private parseClosingTime(openingHours: any, date: Date): DateTime | null {
    if (!openingHours) return null;

    let hoursStr: string | undefined;
    if (typeof openingHours === 'string') {
      hoursStr = openingHours;
    } else if (typeof openingHours === 'object') {
      hoursStr =
        openingHours.osmFormat ??
        openingHours.weekday ??
        openingHours.weekend ??
        openingHours.mon ??
        openingHours.tue ??
        openingHours.wed ??
        openingHours.thu ??
        openingHours.fri ??
        openingHours.sat ??
        openingHours.sun;
    }

    if (!hoursStr || typeof hoursStr !== 'string') return null;

    // 24小时开放无闭园时间
    const lower = hoursStr.toLowerCase();
    if (/24\s*小时|24\/7|全天|24\s*hours/i.test(lower) || lower === '24小时开放') {
      return null;
    }

    // 格式 "HH:mm-HH:mm" 或 "HH:mm - HH:mm"：取结束时间（闭园）
    const rangeMatch = hoursStr.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (rangeMatch) {
      const hour = parseInt(rangeMatch[3], 10);
      const minute = parseInt(rangeMatch[4], 10);
      if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        return DateTime.fromJSDate(date).set({ hour, minute });
      }
    }

    // 单时间 "HH:mm"
    const singleMatch = hoursStr.match(/(\d{1,2}):(\d{2})/);
    if (singleMatch) {
      const hour = parseInt(singleMatch[1], 10);
      const minute = parseInt(singleMatch[2], 10);
      if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        return DateTime.fromJSDate(date).set({ hour, minute });
      }
    }

    return null;
  }

  /**
   * 批量获取 Place 坐标（用于交通时间估算）
   */
  private async getPlaceCoordinatesMap(placeIds: number[]): Promise<Map<number, { lat: number; lng: number }>> {
    const map = new Map<number, { lat: number; lng: number }>();
    if (placeIds.length === 0) return map;

    try {
      const results = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>(
        Prisma.sql`
        SELECT id, ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(placeIds)}) AND location IS NOT NULL
      `
      );
      for (const r of results) {
        map.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    } catch (err: any) {
      this.logger.warn(`获取 Place 坐标失败: ${err?.message}`);
    }
    return map;
  }

  /**
   * Haversine 计算两点间直线距离（公里）
   */
  private calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 根据直线距离估算交通时间（分钟）
   * 与 RouteDirectionsService 保持一致：< 1km 步行 12min/km，1-50km 驾车 2min/km，> 50km 长途 1min/km
   */
  private estimateTravelTimeMinutes(distanceKm: number): number {
    if (distanceKm < 1) return Math.ceil(distanceKm * 12);
    if (distanceKm < 50) return Math.ceil(distanceKm * 2);
    return Math.ceil(distanceKm * 1);
  }
}

