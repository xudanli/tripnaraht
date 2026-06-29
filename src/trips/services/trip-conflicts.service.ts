// src/trips/services/trip-conflicts.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  ConflictDto,
  ConflictType,
  ConflictSeverity,
  ConflictsResponseDto,
  ResolveConflictsRequestDto,
  ResolveConflictsResponseDto,
  ConflictResolutionResultDto,
  ConflictResolutionStrategy,
} from '../dto/trip-conflicts.dto';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { TravelTimeEstimatorService } from '../../transport/services/travel-time-estimator.service';
import {
  PoiHopTravelSegmentService,
  resolveTripDefaultTravelMode,
  type TripDefaultTravelMode,
} from '../../transport/services/poi-hop-travel-segment.service';
import { assertRealityWorldReadAllowed } from '../reality-kernel/reality-policy-engine';
import {
  RealityExecutionBlockedError,
  requiresPlanningHeuristicWorldModelOnly,
} from '../reality-kernel/reality-execution-gate';
import { RealityBypassBlockedError } from '../reality-kernel/reality-read-audit';
import { getBoundDecisionContext } from '../reality-kernel/reality-context.storage';
import {
  buildLunchWindowConflictCopy,
  getMinLunchGapMinutes,
  resolveLunchStrategyFromTrip,
  type LunchStrategy,
} from '../../planning-policy/utils/lunch-strategy.util';
import {
  accumulateDailyDrivingMinutes,
  buildDailyDriveExceededConflicts,
} from '../trip-constraint-solver/utils/daily-drive-conflicts.util';
import {
  isSelfDriveTrip,
  resolveMaxDailyDrivingHours,
} from '../trip-constraint-solver/utils/daily-drive-threshold.util';

const DEFAULT_BUFFER_MINUTES = Number(process.env.TRIP_CONFLICT_BUFFER_MINUTES) || 15;
const START_TOO_EARLY_THRESHOLD_MINUTES =
  Number(process.env.TRIP_CONFLICT_START_TOO_EARLY_THRESHOLD_MINUTES) || 5;
const TIGHT_TRAVEL_GAP_MINUTES = Number(process.env.TRIP_CONFLICT_TIGHT_TRAVEL_GAP_MINUTES) || 30;

interface TravelSegmentEstimate {
  travelMinutes: number;
  travelDistanceMeters: number;
  travelMode: 'DRIVING' | 'WALKING' | 'TRANSIT';
}

export interface TripConflictsQueryOpts {
  /** false 时全程用启发式路程，跳过 Google Routes（planning-conflicts 首包） */
  useRouteApi?: boolean;
}

@Injectable()
export class TripConflictsService {
  private readonly logger = new Logger(TripConflictsService.name);

  constructor(
    private prisma: PrismaService,
    private smartRoutesService: SmartRoutesService,
    private travelTimeEstimator: TravelTimeEstimatorService,
    private poiHopTravelSegment: PoiHopTravelSegmentService,
  ) {}

  /**
   * 获取行程冲突列表
   */
  async getConflicts(
    tripId: string,
    date?: string,
    severity?: ConflictSeverity,
    opts?: TripConflictsQueryOpts,
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
    const lunchStrategy = resolveLunchStrategyFromTrip(trip);
    const defaultTravelMode = resolveTripDefaultTravelMode(trip.pacingConfig);

    const useRouteApi = opts?.useRouteApi !== false;
    const dailyDriveMinutes = new Map<number, number>();
    const dailyDriveItemIds = new Map<number, string[]>();
    const maxDailyDrive = resolveMaxDailyDrivingHours({
      metadata: trip.metadata,
      pacingConfig: trip.pacingConfig,
    });
    const trackDailyDrive =
      maxDailyDrive != null && isSelfDriveTrip(trip.pacingConfig);

    // 检测所有日期的冲突
    for (let i = 0; i < trip.TripDay.length; i++) {
      const dayConflicts = await this.detectDayConflicts(
        tripId,
        trip.TripDay[i],
        i + 1,
        lunchStrategy,
        defaultTravelMode,
        useRouteApi,
        trackDailyDrive ? dailyDriveMinutes : undefined,
      );
      conflicts.push(...dayConflicts);
      if (trackDailyDrive) {
        const itemIds = (trip.TripDay[i].ItineraryItem ?? [])
          .map((item: { id: string }) => item.id)
          .filter(Boolean);
        if (itemIds.length) dailyDriveItemIds.set(i + 1, itemIds);
      }
    }

    if (!date) {
      conflicts.push(
        ...(await this.detectInterDayTravelConflicts(
          trip.TripDay,
          defaultTravelMode,
          useRouteApi,
          trackDailyDrive ? dailyDriveMinutes : undefined,
        )),
      );
    }

    if (trackDailyDrive && maxDailyDrive) {
      conflicts.push(
        ...buildDailyDriveExceededConflicts({
          dailyDriveMinutes,
          maxDailyDrivingHours: maxDailyDrive.maxDailyDrivingHours,
          dayItemIds: dailyDriveItemIds,
        }),
      );
    }

    // 跨日重复检测：同一地点（placeId 或 place 名称）在行程中多天出现
    const placeIdToItemsCrossDay = new Map<number, Array<{ item: any; dayDate: string }>>();
    const placeNameToItemsCrossDay = new Map<string, Array<{ item: any; dayDate: string }>>();
    for (const day of trip.TripDay) {
      const dayDate = DateTime.fromJSDate(day.date).toISODate() || '';
      for (const item of day.ItineraryItem || []) {
        if (item.placeId != null) {
          const list = placeIdToItemsCrossDay.get(item.placeId) || [];
          list.push({ item, dayDate });
          placeIdToItemsCrossDay.set(item.placeId, list);
        }
        if (item.Place) {
          const name = (item.Place.nameCN || item.Place.nameEN || '').trim();
          if (name) {
            const list = placeNameToItemsCrossDay.get(name) || [];
            list.push({ item, dayDate });
            placeNameToItemsCrossDay.set(name, list);
          }
        }
      }
    }
    const reportedCrossDay = new Set<string>();
    for (const [placeId, entries] of placeIdToItemsCrossDay) {
      // 🆕 对齐排产策略：跨日重访 2 次（跨 2 天）允许，不作为冲突提示；>2 才提示
      if (entries.length <= 2) continue;
      const uniqueDays = new Set(entries.map(e => e.dayDate));
      if (uniqueDays.size < 2) continue; // 同一天内已由 detectDayConflicts 处理
      const placeName = entries[0].item.Place?.nameCN || entries[0].item.Place?.nameEN || '未知';
      const key = `place-${placeId}`;
      if (reportedCrossDay.has(key)) continue;
      reportedCrossDay.add(key);
      conflicts.push({
        id: `duplicate-item-cross-day-place-${placeId}`,
        type: ConflictType.DUPLICATE_ITEM,
        severity: ConflictSeverity.LOW,
        title: '行程项重复',
        description: `「${placeName}」在行程中被安排了 ${entries.length} 次（跨 ${uniqueDays.size} 天）`,
        affectedDays: Array.from(uniqueDays),
        affectedItemIds: entries.map(e => e.item.id),
        suggestions: [
          {
            action: '合并或移除重复项',
            description: '若为计划内重访可保留，否则建议合并或移除',
            impact: '避免重复游览同一地点，优化行程安排',
          },
        ],
      });
    }
    for (const [placeName, entries] of placeNameToItemsCrossDay) {
      // 🆕 对齐排产策略：跨日重访 2 次允许，>2 才提示
      if (entries.length <= 2) continue;
      const uniquePlaceIds = new Set(entries.map(e => e.item.placeId));
      const uniqueDays = new Set(entries.map(e => e.dayDate));
      if (uniqueDays.size < 2) continue;
      if (uniquePlaceIds.size === 1) continue; // 已由 placeId 分组覆盖
      const key = `name-${placeName}`;
      if (reportedCrossDay.has(key)) continue;
      reportedCrossDay.add(key);
      conflicts.push({
        id: `duplicate-item-cross-day-name-${placeName.replace(/\s/g, '-')}`,
        type: ConflictType.DUPLICATE_ITEM,
        severity: ConflictSeverity.LOW,
        title: '行程项重复',
        description: `「${placeName}」在行程中被安排了 ${entries.length} 次（跨 ${uniqueDays.size} 天）`,
        affectedDays: Array.from(uniqueDays),
        affectedItemIds: entries.map(e => e.item.id),
        suggestions: [
          {
            action: '合并或移除重复项',
            description: '若为计划内重访可保留，否则建议合并或移除',
            impact: '避免重复游览同一地点，优化行程安排',
          },
        ],
      });
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
    const lunchStrategy = trip ? resolveLunchStrategyFromTrip(trip) : 'balanced';

    return this.detectDayConflicts(tripId, day, dayIndex, lunchStrategy);
  }

  /**
   * 检测单日冲突
   * @param dayIndex 1-based 天数索引，用于与证据 ID 关联（ev-place-{id}-day-{dayIndex}-opening-hours）
   */
  private async detectDayConflicts(
    tripId: string,
    day: any,
    _dayIndex: number,
    lunchStrategy: LunchStrategy = 'balanced',
    defaultTravelMode: TripDefaultTravelMode = 'DRIVING',
    useRouteApi = true,
    dailyDriveAccumulator?: Map<number, number>,
  ): Promise<ConflictDto[]> {
    const conflicts: ConflictDto[] = [];
    const items = day.ItineraryItem || [];
    const date = DateTime.fromJSDate(day.date).toISODate() || '';

    // 获取 Place 坐标（用于交通时间检测）
    const placeIds = items.map((i: any) => i.placeId).filter((id: any) => id != null) as number[];
    const coordsMap = await this.getPlaceCoordinatesMap(placeIds);

    // 记录已报告 TRANSPORT_INSUFFICIENT 的行程项对，避免重复报告 BUFFER_INSUFFICIENT
    const transportInsufficientPairs = new Set<string>();

    // 0. 检测行程项重复
    // 0.1 同一天内：同一 placeId 出现多次
    const placeIdToItems = new Map<number, any[]>();
    for (const item of items) {
      if (item.placeId == null) continue;
      const list = placeIdToItems.get(item.placeId) || [];
      list.push(item);
      placeIdToItems.set(item.placeId, list);
    }
    for (const [placeId, dupItems] of placeIdToItems) {
      if (dupItems.length < 2) continue;
      const placeName = dupItems[0].Place?.nameCN || dupItems[0].Place?.nameEN || '未知';
      conflicts.push({
        id: `duplicate-item-${date}-place-${placeId}`,
        type: ConflictType.DUPLICATE_ITEM,
        severity: ConflictSeverity.MEDIUM,
        title: '行程项重复',
        description: `「${placeName}」在同一天被安排了 ${dupItems.length} 次`,
        affectedDays: [date],
        affectedItemIds: dupItems.map((i: any) => i.id),
        suggestions: [
          {
            action: '合并或移除重复项',
            description: '保留一次访问，移除或合并其他重复的行程项',
            impact: '避免重复游览同一地点，优化行程安排',
          },
        ],
      });
    }
    // 0.2 同一天内：不同 placeId 但同一地点名称（如数据中有重复 Place 记录）
    const placeNameToItems = new Map<string, any[]>();
    for (const item of items) {
      if (!item.placeId || !item.Place) continue;
      const name = (item.Place.nameCN || item.Place.nameEN || '').trim();
      if (!name) continue;
      const list = placeNameToItems.get(name) || [];
      list.push(item);
      placeNameToItems.set(name, list);
    }
    const reportedByPlaceId = new Set(Array.from(placeIdToItems.entries()).filter(([, v]) => v.length >= 2).flatMap(([, v]) => v.map((i: any) => i.id)));
    for (const [placeName, dupItems] of placeNameToItems) {
      if (dupItems.length < 2) continue;
      const uniquePlaceIds = new Set(dupItems.map((i: any) => i.placeId));
      if (uniquePlaceIds.size < 2) continue; // 已由 placeId 分组覆盖
      const alreadyReported = dupItems.every((i: any) => reportedByPlaceId.has(i.id));
      if (alreadyReported) continue;
      conflicts.push({
        id: `duplicate-item-${date}-name-${placeName.replace(/\s/g, '-')}`,
        type: ConflictType.DUPLICATE_ITEM,
        severity: ConflictSeverity.MEDIUM,
        title: '行程项重复',
        description: `「${placeName}」在同一天被安排了 ${dupItems.length} 次（可能对应不同地点记录）`,
        affectedDays: [date],
        affectedItemIds: dupItems.map((i: any) => i.id),
        suggestions: [
          {
            action: '合并或移除重复项',
            description: '保留一次访问，移除或合并其他重复的行程项',
            impact: '避免重复游览同一地点，优化行程安排',
          },
        ],
      });
    }

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

    // 1.5 检测交通衔接：按 A→B 路段耗时验算抵达时刻，不使用日程空档冒充交通时长。
    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (current.type === 'REST' || next.type === 'REST') {
        continue;
      }

      const fromCoords = current.placeId ? coordsMap.get(current.placeId) : null;
      const toCoords = next.placeId ? coordsMap.get(next.placeId) : null;
      if (!fromCoords || !toCoords) continue;

      const estimate = await this.estimateTravelSegment(
        fromCoords,
        toCoords,
        next.travelMode,
        defaultTravelMode,
        useRouteApi,
      );
      if (dailyDriveAccumulator) {
        accumulateDailyDrivingMinutes(
          dailyDriveAccumulator,
          _dayIndex,
          estimate.travelMinutes,
          estimate.travelMode,
        );
      }
      const currentEnd = current.endTime ? DateTime.fromJSDate(current.endTime) : null;
      const nextStart = next.startTime ? DateTime.fromJSDate(next.startTime) : null;
      const fromName = this.getItemPlaceLabel(current);
      const toName = this.getItemPlaceLabel(next);
      const distanceKm = Math.round((estimate.travelDistanceMeters / 1000) * 10) / 10;

      if (!currentEnd || !nextStart) {
        transportInsufficientPairs.add(`${current.id}-${next.id}`);
        conflicts.push(this.buildTravelTimingConflict({
          id: `same-day-travel-${current.id}-${next.id}`,
          issueKind: 'same_day_travel',
          title: '交通时间待确认',
          fromItem: current,
          toItem: next,
          fromName,
          toName,
          fromDayNumber: _dayIndex,
          toDayNumber: _dayIndex,
          affectedDays: [String(_dayIndex)],
          estimate,
          distanceKm,
          priority: 'pending_confirm',
          severity: ConflictSeverity.LOW,
          timingSource: 'missing_times',
        }));
        continue;
      }

      const availableMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
      const arriveAt = currentEnd.plus({ minutes: estimate.travelMinutes });
      const gapMinutes = nextStart.diff(arriveAt, 'minutes').minutes;
      const isStartTooEarly = gapMinutes < -START_TOO_EARLY_THRESHOLD_MINUTES;
      const shortfallMinutes = Math.max(0, Math.ceil(-gapMinutes));

      if (!isStartTooEarly && gapMinutes > TIGHT_TRAVEL_GAP_MINUTES) continue;

      const priority = isStartTooEarly ? 'must_handle' : 'suggest_adjust';
      const severity = isStartTooEarly ? ConflictSeverity.HIGH : ConflictSeverity.MEDIUM;
      const suggestedTime = arriveAt.plus({ minutes: START_TOO_EARLY_THRESHOLD_MINUTES });
      transportInsufficientPairs.add(`${current.id}-${next.id}`);

      conflicts.push(this.buildTravelTimingConflict({
        id: `same-day-travel-${current.id}-${next.id}`,
        issueKind: 'same_day_travel',
        title: isStartTooEarly ? '交通时间不足' : '交通缓冲偏紧',
        fromItem: current,
        toItem: next,
        fromName,
        toName,
        fromDayNumber: _dayIndex,
        toDayNumber: _dayIndex,
        affectedDays: [String(_dayIndex)],
        estimate,
        distanceKm,
        departAt: currentEnd,
        arriveAt,
        activityStartAt: nextStart,
        availableMinutes,
        gapMinutes,
        shortfallMinutes,
        suggestedTime,
        priority,
        severity,
        isStartTooEarly,
        timingSource: 'computed',
      }));
    }

    // 2. 检测午餐时间窗（若当日已有足够午餐/用餐安排，则不报冲突）
    const minLunchGap = getMinLunchGapMinutes(lunchStrategy);
    const lunchWindow = this.detectLunchWindow(items);
    if (
      lunchWindow &&
      lunchWindow.duration < minLunchGap &&
      !this.hasAdequateLunchInWindow(items, day.date, minLunchGap)
    ) {
      const copy = buildLunchWindowConflictCopy({
        strategy: lunchStrategy,
        durationMinutes: lunchWindow.duration,
        minRequired: minLunchGap,
      });
      conflicts.push({
        id: `lunch-window-${date}`,
        type: ConflictType.LUNCH_WINDOW,
        severity: lunchStrategy === 'rigid' ? ConflictSeverity.HIGH : ConflictSeverity.MEDIUM,
        title: copy.title,
        description: copy.description,
        affectedDays: [date],
        affectedItemIds: lunchWindow.itemIds,
        suggestions: copy.suggestions,
        lunchStrategy,
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
        const fromName = this.getItemPlaceLabel(current);
        const toName = this.getItemPlaceLabel(next);
        const suggestedTime = currentEnd.plus({ minutes: DEFAULT_BUFFER_MINUTES });
        conflicts.push({
          id: `buffer-insufficient-${current.id}-${next.id}`,
          type: ConflictType.BUFFER_INSUFFICIENT,
          severity: ConflictSeverity.MEDIUM,
          title: '缓冲时间不足',
          description: `活动 "${fromName}" 到 "${toName}" 之间缓冲时间仅 ${Math.round(bufferMinutes)} 分钟`,
          affectedDays: [String(_dayIndex)],
          affectedItemIds: [current.id, next.id],
          fromItemId: current.id,
          toItemId: next.id,
          fromPlaceLabel: fromName,
          toPlaceLabel: toName,
          fromDayNumber: _dayIndex,
          toDayNumber: _dayIndex,
          issueKind: 'buffer_insufficient',
          gapMinutes: Math.round(bufferMinutes),
          shortfallMinutes,
          suggestedTime: suggestedTime.toISO() ?? undefined,
          priority: 'suggest_adjust',
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

  private async detectInterDayTravelConflicts(
    days: any[],
    defaultTravelMode: TripDefaultTravelMode = 'DRIVING',
    useRouteApi = true,
    dailyDriveAccumulator?: Map<number, number>,
  ): Promise<ConflictDto[]> {
    const conflicts: ConflictDto[] = [];
    if (!days || days.length < 2) return conflicts;

    const placeIds = days
      .flatMap((day) => day.ItineraryItem ?? [])
      .map((item: any) => item.placeId)
      .filter((id: any) => id != null) as number[];
    const coordsMap = await this.getPlaceCoordinatesMap([...new Set(placeIds)]);

    for (let i = 0; i < days.length - 1; i++) {
      const prevItems = [...(days[i].ItineraryItem ?? [])].filter((item: any) => item.placeId);
      const nextItems = [...(days[i + 1].ItineraryItem ?? [])].filter(
        (item: any) => item.placeId && item.type !== 'REST',
      );
      const fromItem = prevItems[prevItems.length - 1];
      const toItem = nextItems[0];
      if (!fromItem || !toItem) continue;

      const fromCoords = coordsMap.get(fromItem.placeId);
      const toCoords = coordsMap.get(toItem.placeId);
      if (!fromCoords || !toCoords) continue;

      const estimate = await this.estimateTravelSegment(
        fromCoords,
        toCoords,
        toItem.travelMode,
        defaultTravelMode,
        useRouteApi,
      );
      if (dailyDriveAccumulator) {
        accumulateDailyDrivingMinutes(
          dailyDriveAccumulator,
          i + 2,
          estimate.travelMinutes,
          estimate.travelMode,
        );
      }
      const fromEnd = fromItem.endTime ? DateTime.fromJSDate(fromItem.endTime) : null;
      const toStart = toItem.startTime ? DateTime.fromJSDate(toItem.startTime) : null;
      const fromName = this.getItemPlaceLabel(fromItem);
      const toName = this.getItemPlaceLabel(toItem);
      const distanceKm = Math.round((estimate.travelDistanceMeters / 1000) * 10) / 10;

      if (!fromEnd || !toStart) {
        conflicts.push(this.buildTravelTimingConflict({
          id: `inter-day-travel-${fromItem.id}-${toItem.id}`,
          issueKind: 'inter_day_travel',
          title: '跨天交通时间待确认',
          fromItem,
          toItem,
          fromName,
          toName,
          fromDayNumber: i + 1,
          toDayNumber: i + 2,
          affectedDays: [String(i + 1), String(i + 2)],
          estimate,
          distanceKm,
          priority: 'pending_confirm',
          severity: ConflictSeverity.LOW,
          timingSource: 'missing_times',
        }));
        continue;
      }

      const availableMinutes = toStart.diff(fromEnd, 'minutes').minutes;
      const arriveAt = fromEnd.plus({ minutes: estimate.travelMinutes });
      const gapMinutes = toStart.diff(arriveAt, 'minutes').minutes;
      const isStartTooEarly = gapMinutes < -START_TOO_EARLY_THRESHOLD_MINUTES;
      const shortfallMinutes = Math.max(0, Math.ceil(-gapMinutes));

      if (!isStartTooEarly && gapMinutes > TIGHT_TRAVEL_GAP_MINUTES) continue;

      const priority = isStartTooEarly ? 'must_handle' : 'suggest_adjust';
      const severity = isStartTooEarly ? ConflictSeverity.HIGH : ConflictSeverity.MEDIUM;
      const suggestedTime = arriveAt.plus({ minutes: START_TOO_EARLY_THRESHOLD_MINUTES });

      conflicts.push(this.buildTravelTimingConflict({
        id: `inter-day-travel-${fromItem.id}-${toItem.id}`,
        issueKind: 'inter_day_travel',
        title: isStartTooEarly ? '跨天交通时间不足' : '跨天交通缓冲偏紧',
        fromItem,
        toItem,
        fromName,
        toName,
        fromDayNumber: i + 1,
        toDayNumber: i + 2,
        affectedDays: [String(i + 1), String(i + 2)],
        estimate,
        distanceKm,
        departAt: fromEnd,
        arriveAt,
        activityStartAt: toStart,
        availableMinutes,
        gapMinutes,
        shortfallMinutes,
        suggestedTime,
        priority,
        severity,
        isStartTooEarly,
        timingSource: 'computed',
      }));
    }

    return conflicts;
  }

  /**
   * 判断 11:00-14:00 内是否已有足够时长的午餐/用餐活动
   * 若有，则不应再报「午餐时间窗过短」
   */
  private hasAdequateLunchInWindow(items: any[], date: Date, minMinutes = 60): boolean {
    const dayStart = DateTime.fromJSDate(date).startOf('day');
    const windowStart = dayStart.set({ hour: 11, minute: 0 });
    const windowEnd = dayStart.set({ hour: 14, minute: 0 });

    for (const item of items) {
      if (!item.startTime || !item.endTime) continue;
      if (!this.isLunchOrMealActivity(item)) continue;

      const start = DateTime.fromJSDate(item.startTime);
      const end = DateTime.fromJSDate(item.endTime);
      if (start >= windowEnd || end <= windowStart) continue;

      const overlapStart = start > windowStart ? start : windowStart;
      const overlapEnd = end < windowEnd ? end : windowEnd;
      const durationMinutes = overlapEnd.diff(overlapStart, 'minutes').minutes;
      if (durationMinutes >= minMinutes) return true;
    }
    return false;
  }

  /** 是否为午餐/用餐类活动（REST、MEAL、餐厅） */
  private isLunchOrMealActivity(item: any): boolean {
    if (item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING' || item.type === 'REST') return true;
    const category = item.Place?.category;
    return category === 'RESTAURANT';
  }

  /**
   * 检测午餐时间窗
   * 计算 11:00-14:00 内最长的连续空闲时间（可用于午餐），若 < 60 分钟则报告冲突
   * 注：午餐/用餐活动不视为「占用」午餐窗，即用户已安排的 12:00-13:00 午餐不会导致「仅30分钟」误报
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

    // 找出 11:00-14:00 内与窗口重叠的活动（排除午餐/用餐类，这些本身即午餐时间）
    const overlapping: Array<{ start: DateTime; end: DateTime; id: string }> = [];
    for (const item of sorted) {
      if (this.isLunchOrMealActivity(item)) continue;
      const start = DateTime.fromJSDate(item.startTime);
      const end = item.endTime ? DateTime.fromJSDate(item.endTime) : start.plus({ hours: 1 });
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

  private getItemPlaceLabel(item: any): string {
    return item?.Place?.nameCN || item?.Place?.nameEN || item?.title || item?.name || '未知地点';
  }

  private formatTravelMinutes(minutes: number): string {
    const rounded = Math.max(0, Math.round(minutes));
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (hours > 0 && mins > 0) return `${hours} 小时 ${mins} 分钟`;
    if (hours > 0) return `${hours} 小时`;
    return `${mins} 分钟`;
  }

  private async estimateTravelSegment(
    fromCoords: { lat: number; lng: number },
    toCoords: { lat: number; lng: number },
    preferredMode?: string | null,
    defaultTravelMode: TripDefaultTravelMode = 'DRIVING',
    useRouteApi = true,
  ): Promise<TravelSegmentEstimate> {
    const useHeuristicOnly =
      !useRouteApi || requiresPlanningHeuristicWorldModelOnly(getBoundDecisionContext());

    if (!useHeuristicOnly) {
      try {
        assertRealityWorldReadAllowed(
          this.logger,
          'TripConflictsService.getRoutes',
          'route provider read',
        );
      } catch (e) {
        if (e instanceof RealityBypassBlockedError || e instanceof RealityExecutionBlockedError) {
          throw e;
        }
      }
    }

    try {
      const segment = await this.poiHopTravelSegment.resolveSegment({
        from: fromCoords,
        to: toCoords,
        preferredMode,
        defaultMode: defaultTravelMode,
        useRouteApi: !useHeuristicOnly,
      });
      return {
        travelMinutes: segment.durationMinutes,
        travelDistanceMeters: segment.distanceMeters,
        travelMode: segment.travelMode,
      };
    } catch (e) {
      if (e instanceof RealityBypassBlockedError || e instanceof RealityExecutionBlockedError) {
        throw e;
      }
      this.logger.debug(`路线 API 调用失败，使用统一估算: ${(e as Error)?.message}`);
      const segment = await this.poiHopTravelSegment.resolveSegment({
        from: fromCoords,
        to: toCoords,
        preferredMode,
        defaultMode: defaultTravelMode,
        useRouteApi: false,
      });
      return {
        travelMinutes: segment.durationMinutes,
        travelDistanceMeters: segment.distanceMeters,
        travelMode: segment.travelMode,
      };
    }
  }

  /** @deprecated use PoiHopTravelSegmentService.estimateRouteDistanceKm */
  private estimateRouteDistanceKm(straightDistanceKm: number, travelMode: string): number {
    if (travelMode === 'DRIVING' && straightDistanceKm >= 50) {
      return straightDistanceKm * 1.2;
    }
    return straightDistanceKm;
  }

  private buildTravelTimingConflict(input: {
    id: string;
    issueKind: 'same_day_travel' | 'inter_day_travel';
    title: string;
    fromItem: any;
    toItem: any;
    fromName: string;
    toName: string;
    fromDayNumber: number;
    toDayNumber: number;
    affectedDays: string[];
    estimate: TravelSegmentEstimate;
    distanceKm: number;
    departAt?: DateTime;
    arriveAt?: DateTime;
    activityStartAt?: DateTime;
    availableMinutes?: number;
    gapMinutes?: number;
    shortfallMinutes?: number;
    suggestedTime?: DateTime;
    priority: NonNullable<ConflictDto['priority']>;
    severity: ConflictSeverity;
    isStartTooEarly?: boolean;
    timingSource: NonNullable<ConflictDto['timingSource']>;
  }): ConflictDto {
    const travelText = this.formatTravelMinutes(input.estimate.travelMinutes);
    const suffix =
      input.timingSource === 'missing_times'
        ? '缺少出发或开始时间，需确认交通衔接'
        : input.isStartTooEarly
          ? '首项开始时间偏早'
          : '抵达后缓冲偏紧';
    const description = `第${input.toDayNumber}天 · ${input.fromName} → ${input.toName}（约 ${input.distanceKm} km）：路上约需 ${travelText}，${suffix}`;
    const suggestedIso = input.suggestedTime?.toISO() ?? undefined;

    return {
      id: input.id,
      type: ConflictType.TRANSPORT_INSUFFICIENT,
      severity: input.severity,
      title: input.title,
      description,
      affectedDays: input.affectedDays,
      affectedItemIds: [input.fromItem.id, input.toItem.id],
      fromItemId: input.fromItem.id,
      toItemId: input.toItem.id,
      fromDayNumber: input.fromDayNumber,
      toDayNumber: input.toDayNumber,
      fromPlaceLabel: input.fromName,
      toPlaceLabel: input.toName,
      fromTime: input.departAt?.toISO() ?? undefined,
      toTime: input.activityStartAt?.toISO() ?? undefined,
      departAt: input.departAt?.toISO() ?? undefined,
      arriveAt: input.arriveAt?.toISO() ?? undefined,
      activityStartAt: input.activityStartAt?.toISO() ?? undefined,
      issueKind: input.issueKind,
      priority: input.priority,
      travelMode: input.estimate.travelMode,
      travelMinutes: input.estimate.travelMinutes,
      travelTimeMinutes: input.estimate.travelMinutes,
      travelDistanceMeters: input.estimate.travelDistanceMeters,
      availableMinutes: input.availableMinutes != null ? Math.round(input.availableMinutes) : undefined,
      gapMinutes: input.gapMinutes != null ? Math.round(input.gapMinutes) : undefined,
      shortfallMinutes: input.shortfallMinutes != null ? Math.round(input.shortfallMinutes) : undefined,
      suggestedTime: suggestedIso,
      distanceKm: input.distanceKm,
      isStartTooEarly: input.isStartTooEarly,
      timingSource: input.timingSource,
      suggestions: [
        {
          action: 'adjust_time',
          description: suggestedIso
            ? `将「${input.toName}」开始时间调整到 ${suggestedIso}`
            : `确认「${input.fromName}」和「${input.toName}」的时间锚点`,
          impact: input.isStartTooEarly ? '消除交通时间不足' : '补足交通衔接缓冲',
          payload: {
            suggestedValue: suggestedIso,
            itemId: input.toItem.id,
            field: 'startTime',
          },
        },
        ...(input.issueKind === 'inter_day_travel' && input.isStartTooEarly
          ? [
              {
                action: 'add_buffer',
                description: `在 Day ${input.fromDayNumber} 与 Day ${input.toDayNumber} 之间插入缓冲日`,
                impact: '增加 1 天行程缓冲',
                payload: {
                  beforeDayNumber: input.toDayNumber,
                  afterDayNumber: input.fromDayNumber,
                  itemId: input.toItem.id,
                },
              },
            ]
          : []),
        ...(input.issueKind === 'inter_day_travel'
          ? [
              {
                action: 'move_to_day',
                description: `将「${input.toName}」移动到更宽松的一天`,
                impact: '避免跨天首段交通压缩出发窗口',
                payload: {
                  suggestedValue: { dayNumber: input.toDayNumber + 1 },
                  itemId: input.toItem.id,
                },
              },
            ]
          : []),
      ],
    };
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
   * 一键解决冲突列表
   * 自动检测并解决行程中的冲突
   */
  async resolveConflicts(
    tripId: string,
    dto: ResolveConflictsRequestDto
  ): Promise<ResolveConflictsResponseDto> {
    const dryRun = dto.dryRun ?? false;
    const strategy = dto.strategy ?? ConflictResolutionStrategy.AUTO;

    // 1. 获取当前冲突列表
    const conflictsResponse = await this.getConflicts(tripId, dto.date, dto.minSeverity);
    let conflicts = conflictsResponse.conflicts;

    // 2. 过滤冲突（如果指定了 conflictIds 或 conflictTypes）
    if (dto.conflictIds && dto.conflictIds.length > 0) {
      conflicts = conflicts.filter(c => dto.conflictIds!.includes(c.id));
    }
    if (dto.conflictTypes && dto.conflictTypes.length > 0) {
      conflicts = conflicts.filter(c => dto.conflictTypes!.includes(c.type));
    }

    // 3. 按优先级排序（HIGH > MEDIUM > LOW，TIME_CONFLICT 优先处理）
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const typeOrder: Record<ConflictType, number> = {
      [ConflictType.TIME_CONFLICT]: 0,
      [ConflictType.TRANSPORT_INSUFFICIENT]: 1,
      [ConflictType.MAX_DAILY_DRIVE_EXCEEDED]: 2,
      [ConflictType.BUFFER_INSUFFICIENT]: 3,
      [ConflictType.DUPLICATE_ITEM]: 4,
      [ConflictType.CLOSURE_RISK]: 5,
      [ConflictType.LUNCH_MISSING]: 6,
      [ConflictType.DINNER_MISSING]: 7,
      [ConflictType.LUNCH_WINDOW]: 8,
      [ConflictType.FATIGUE_EXCEEDED]: 9,
      [ConflictType.ACCESSIBILITY_MISMATCH]: 10,
      [ConflictType.TRANSPORT_TOO_LONG]: 11,
    };
    conflicts.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return typeOrder[a.type] - typeOrder[b.type];
    });

    const results: ConflictResolutionResultDto[] = [];
    let resolvedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 4. 逐个处理冲突
    for (const conflict of conflicts) {
      const result = await this.resolveSingleConflict(tripId, conflict, strategy, dryRun);
      results.push(result);

      if (result.resolved) {
        resolvedCount++;
      } else if (result.strategy === ConflictResolutionStrategy.SKIP) {
        skippedCount++;
      } else {
        failedCount++;
      }
    }

    // 5. 获取剩余冲突（如果不是 dryRun 模式）
    let remainingConflicts: ConflictDto[] | undefined;
    if (!dryRun && resolvedCount > 0) {
      const remaining = await this.getConflicts(tripId, dto.date, dto.minSeverity);
      remainingConflicts = remaining.conflicts;
    }

    return {
      tripId,
      dryRun,
      results,
      resolvedCount,
      skippedCount,
      failedCount,
      totalProcessed: conflicts.length,
      remainingConflicts,
    };
  }

  /**
   * 解决单个冲突
   */
  private async resolveSingleConflict(
    tripId: string,
    conflict: ConflictDto,
    globalStrategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    const strategy = globalStrategy === ConflictResolutionStrategy.AUTO
      ? this.determineStrategy(conflict)
      : globalStrategy;

    // 不可自动解决的冲突类型
    const unresolvableTypes = [
      ConflictType.FATIGUE_EXCEEDED,
      ConflictType.ACCESSIBILITY_MISMATCH,
      ConflictType.TRANSPORT_TOO_LONG,
      ConflictType.MAX_DAILY_DRIVE_EXCEEDED,
    ];

    if (unresolvableTypes.includes(conflict.type)) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: `冲突类型 ${conflict.type} 需要人工处理`,
        failureReason: '该类型冲突无法自动解决，建议手动调整行程',
      };
    }

    try {
      switch (conflict.type) {
        case ConflictType.TIME_CONFLICT:
          return await this.resolveTimeConflict(tripId, conflict, strategy, dryRun);

        case ConflictType.TRANSPORT_INSUFFICIENT:
        case ConflictType.BUFFER_INSUFFICIENT:
          return await this.resolveBufferConflict(tripId, conflict, strategy, dryRun);

        case ConflictType.DUPLICATE_ITEM:
          return await this.resolveDuplicateItem(tripId, conflict, strategy, dryRun);

        case ConflictType.CLOSURE_RISK:
          return await this.resolveClosureRisk(tripId, conflict, strategy, dryRun);

        case ConflictType.LUNCH_MISSING:
        case ConflictType.DINNER_MISSING:
          return await this.resolveMealMissing(tripId, conflict, strategy, dryRun);

        case ConflictType.LUNCH_WINDOW:
          return await this.resolveLunchWindow(tripId, conflict, strategy, dryRun);

        default:
          return {
            conflictId: conflict.id,
            conflictType: conflict.type,
            resolved: false,
            strategy: ConflictResolutionStrategy.SKIP,
            description: `未知冲突类型: ${conflict.type}`,
            failureReason: '不支持的冲突类型',
          };
      }
    } catch (error: any) {
      this.logger.error(`解决冲突 ${conflict.id} 失败`, error);
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy,
        description: `解决冲突失败: ${error.message}`,
        failureReason: error.message,
      };
    }
  }

  /**
   * 根据冲突类型确定最佳策略
   */
  private determineStrategy(conflict: ConflictDto): ConflictResolutionStrategy {
    switch (conflict.type) {
      case ConflictType.TIME_CONFLICT:
      case ConflictType.TRANSPORT_INSUFFICIENT:
      case ConflictType.BUFFER_INSUFFICIENT:
        return ConflictResolutionStrategy.SHIFT_LATER;

      case ConflictType.DUPLICATE_ITEM:
        return ConflictResolutionStrategy.REMOVE_ITEM;

      case ConflictType.CLOSURE_RISK:
        return ConflictResolutionStrategy.SHIFT_LATER;

      case ConflictType.LUNCH_WINDOW:
        return ConflictResolutionStrategy.SHIFT_LATER;

      default:
        return ConflictResolutionStrategy.SKIP;
    }
  }

  /**
   * 解决时间冲突：将后一个活动延后
   */
  private async resolveTimeConflict(
    tripId: string,
    conflict: ConflictDto,
    strategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    if (conflict.affectedItemIds.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '缺少受影响的行程项信息',
        failureReason: '需要至少两个行程项才能解决时间冲突',
      };
    }

    const [firstItemId, secondItemId] = conflict.affectedItemIds;
    const overlapMinutes = conflict.overlapMinutes || 30;

    // 获取两个行程项
    const items = await this.prisma.itineraryItem.findMany({
      where: { id: { in: [firstItemId, secondItemId] } },
      include: { Place: true },
      orderBy: { startTime: 'asc' },
    });

    if (items.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '找不到相关行程项',
        failureReason: '行程项可能已被删除',
      };
    }

    const [, secondItem] = items;
    const secondStartTime = secondItem.startTime;
    const secondEndTime = secondItem.endTime;
    if (!secondStartTime || !secondEndTime) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '行程项缺少开始或结束时间',
        failureReason: '无法处理没有完整时间的行程项',
      };
    }
    const secondStart = DateTime.fromJSDate(secondStartTime);
    const secondEnd = DateTime.fromJSDate(secondEndTime);

    // 计算需要延后的时间（重叠时间 + 15分钟缓冲）
    const shiftMinutes = overlapMinutes + DEFAULT_BUFFER_MINUTES;
    const newSecondStart = secondStart.plus({ minutes: shiftMinutes });
    const newSecondEnd = secondEnd.plus({ minutes: shiftMinutes });

    const changes = [
      {
        itemId: secondItem.id,
        field: 'startTime',
        oldValue: secondStart.toISO()!,
        newValue: newSecondStart.toISO()!,
      },
      {
        itemId: secondItem.id,
        field: 'endTime',
        oldValue: secondEnd.toISO()!,
        newValue: newSecondEnd.toISO()!,
      },
    ];

    if (!dryRun) {
      await this.prisma.itineraryItem.update({
        where: { id: secondItem.id },
        data: {
          startTime: newSecondStart.toJSDate(),
          endTime: newSecondEnd.toJSDate(),
        },
      });
    }

    const secondName = secondItem.Place?.nameCN || secondItem.Place?.nameEN || '活动';
    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: true,
      strategy: ConflictResolutionStrategy.SHIFT_LATER,
      description: `将「${secondName}」延后 ${shiftMinutes} 分钟，新时间: ${newSecondStart.toFormat('HH:mm')}-${newSecondEnd.toFormat('HH:mm')}`,
      affectedItemIds: [secondItem.id],
      changes,
    };
  }

  /**
   * 解决缓冲/交通时间不足：将后一个活动延后
   */
  private async resolveBufferConflict(
    tripId: string,
    conflict: ConflictDto,
    strategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    if (conflict.affectedItemIds.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '缺少受影响的行程项信息',
        failureReason: '需要至少两个行程项',
      };
    }

    const [firstItemId, secondItemId] = conflict.affectedItemIds;
    const shortfallMinutes = conflict.shortfallMinutes || DEFAULT_BUFFER_MINUTES;

    const items = await this.prisma.itineraryItem.findMany({
      where: { id: { in: [firstItemId, secondItemId] } },
      include: { Place: true },
      orderBy: { startTime: 'asc' },
    });

    if (items.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '找不到相关行程项',
        failureReason: '行程项可能已被删除',
      };
    }

    const [, secondItem] = items;
    const secondStartTime = secondItem.startTime;
    const secondEndTime = secondItem.endTime;
    if (!secondStartTime || !secondEndTime) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '行程项缺少开始或结束时间',
        failureReason: '无法处理没有完整时间的行程项',
      };
    }
    const secondStart = DateTime.fromJSDate(secondStartTime);
    const secondEnd = DateTime.fromJSDate(secondEndTime);

    // 延后时间 = 缺口 + 5分钟额外缓冲
    const shiftMinutes = shortfallMinutes + 5;
    const newSecondStart = secondStart.plus({ minutes: shiftMinutes });
    const newSecondEnd = secondEnd.plus({ minutes: shiftMinutes });

    const changes = [
      {
        itemId: secondItem.id,
        field: 'startTime',
        oldValue: secondStart.toISO()!,
        newValue: newSecondStart.toISO()!,
      },
      {
        itemId: secondItem.id,
        field: 'endTime',
        oldValue: secondEnd.toISO()!,
        newValue: newSecondEnd.toISO()!,
      },
    ];

    if (!dryRun) {
      await this.prisma.itineraryItem.update({
        where: { id: secondItem.id },
        data: {
          startTime: newSecondStart.toJSDate(),
          endTime: newSecondEnd.toJSDate(),
        },
      });
    }

    const secondName = secondItem.Place?.nameCN || secondItem.Place?.nameEN || '活动';
    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: true,
      strategy: ConflictResolutionStrategy.SHIFT_LATER,
      description: `将「${secondName}」延后 ${shiftMinutes} 分钟，确保有足够交通/缓冲时间`,
      affectedItemIds: [secondItem.id],
      changes,
    };
  }

  /**
   * 解决重复行程项：移除后出现的重复项
   */
  private async resolveDuplicateItem(
    tripId: string,
    conflict: ConflictDto,
    strategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    if (conflict.affectedItemIds.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '缺少重复项信息',
        failureReason: '需要至少两个重复项',
      };
    }

    // 获取所有重复项，按开始时间排序，保留第一个，删除其余
    const items = await this.prisma.itineraryItem.findMany({
      where: { id: { in: conflict.affectedItemIds } },
      include: { Place: true },
      orderBy: { startTime: 'asc' },
    });

    if (items.length < 2) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '找不到重复的行程项',
        failureReason: '行程项可能已被删除',
      };
    }

    // 保留第一个，删除其余
    const [keepItem, ...removeItems] = items;
    const removeIds = removeItems.map(i => i.id);

    if (!dryRun) {
      await this.prisma.itineraryItem.deleteMany({
        where: { id: { in: removeIds } },
      });
    }

    const placeName = keepItem.Place?.nameCN || keepItem.Place?.nameEN || '地点';
    const keepTime = keepItem.startTime 
      ? DateTime.fromJSDate(keepItem.startTime).toFormat('HH:mm')
      : '未知时间';

    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: true,
      strategy: ConflictResolutionStrategy.REMOVE_ITEM,
      description: `保留「${placeName}」的 ${keepTime} 时段安排，移除了 ${removeIds.length} 个重复项`,
      affectedItemIds: removeIds,
      changes: removeIds.map(id => ({
        itemId: id,
        field: 'deleted',
        oldValue: 'exists',
        newValue: 'deleted',
      })),
    };
  }

  /**
   * 解决闭园风险：将活动时间提前
   */
  private async resolveClosureRisk(
    tripId: string,
    conflict: ConflictDto,
    strategy: ConflictResolutionStrategy,
    dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    if (conflict.affectedItemIds.length === 0) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '缺少受影响的行程项信息',
        failureReason: '没有关联的行程项',
      };
    }

    const itemId = conflict.affectedItemIds[0];
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { Place: true },
    });

    if (!item) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '找不到行程项',
        failureReason: '行程项可能已被删除',
      };
    }

    const itemStartTime = item.startTime;
    const itemEndTime = item.endTime;
    if (!itemStartTime || !itemEndTime) {
      return {
        conflictId: conflict.id,
        conflictType: conflict.type,
        resolved: false,
        strategy: ConflictResolutionStrategy.SKIP,
        description: '行程项缺少开始或结束时间',
        failureReason: '无法处理没有完整时间的行程项',
      };
    }

    // 将活动提前 30 分钟
    const shiftMinutes = 30;
    const oldStart = DateTime.fromJSDate(itemStartTime);
    const oldEnd = DateTime.fromJSDate(itemEndTime);
    const newStart = oldStart.minus({ minutes: shiftMinutes });
    const newEnd = oldEnd.minus({ minutes: shiftMinutes });

    const changes = [
      {
        itemId: item.id,
        field: 'startTime',
        oldValue: oldStart.toISO()!,
        newValue: newStart.toISO()!,
      },
      {
        itemId: item.id,
        field: 'endTime',
        oldValue: oldEnd.toISO()!,
        newValue: newEnd.toISO()!,
      },
    ];

    if (!dryRun) {
      await this.prisma.itineraryItem.update({
        where: { id: item.id },
        data: {
          startTime: newStart.toJSDate(),
          endTime: newEnd.toJSDate(),
        },
      });
    }

    const placeName = item.Place?.nameCN || item.Place?.nameEN || '活动';
    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: true,
      strategy: ConflictResolutionStrategy.SHIFT_LATER,
      description: `将「${placeName}」提前 ${shiftMinutes} 分钟，新时间: ${newStart.toFormat('HH:mm')}-${newEnd.toFormat('HH:mm')}，避免闭园风险`,
      affectedItemIds: [item.id],
      changes,
    };
  }

  /**
   * 解决缺少用餐：在适当时段添加用餐占位符提示
   * 注：此方法不会自动创建行程项，只返回建议
   */
  private async resolveMealMissing(
    tripId: string,
    conflict: ConflictDto,
    _strategy: ConflictResolutionStrategy,
    _dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    const isLunch = conflict.type === ConflictType.LUNCH_MISSING;
    const mealType = isLunch ? '午餐' : '晚餐';
    const suggestedWindow = isLunch ? '12:00-13:00' : '18:30-19:30';

    // 暂不自动创建用餐项，只返回建议
    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: false,
      strategy: ConflictResolutionStrategy.SKIP,
      description: `建议在 ${suggestedWindow} 添加${mealType}活动`,
      failureReason: `需要手动添加${mealType}，系统无法自动选择餐厅`,
    };
  }

  /**
   * 解决午餐时间窗过短：调整周边活动时间
   */
  private async resolveLunchWindow(
    tripId: string,
    conflict: ConflictDto,
    _strategy: ConflictResolutionStrategy,
    _dryRun: boolean
  ): Promise<ConflictResolutionResultDto> {
    // 此类冲突通常需要更复杂的调整，暂时跳过
    return {
      conflictId: conflict.id,
      conflictType: conflict.type,
      resolved: false,
      strategy: ConflictResolutionStrategy.SKIP,
      description: '午餐时间窗过短需要手动调整周边活动时间',
      failureReason: '需要综合考虑多个活动的时间安排',
    };
  }

}
