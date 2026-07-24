// src/trips/services/trip-metrics.service.ts
import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import {
  DayMetricsResponseDto,
  TripMetricsResponseDto,
  TripMetricsSummaryDto,
  AssessTripRequestDto,
  AssessTripResponseDto,
  DayAssessmentDto,
  DimensionAssessmentDto,
  AssessmentDimension,
  AssessmentGrade,
  DayType,
  AssessmentStatus,
  TravelMode,
} from '../dto/trip-metrics.dto';
import { TripConflictsService } from './trip-conflicts.service';
import {
  buildMealsAssessmentCopy,
  getMinLunchGapMinutes,
  normalizeLunchStrategy,
  resolveLunchStrategyFromTrip,
  type LunchStrategy,
} from '../../planning-policy/utils/lunch-strategy.util';
import {
  aggregateTripAssessmentDays,
  collectTopSuggestions,
  pickActionableTopSuggestion,
  scoreToAssessmentGrade,
} from '../utils/trip-assessment-aggregate.util';
import { assessTimingForDay } from '../utils/trip-assessment-timing.util';
import {
  buildTravelSegmentMap,
  resolveItemTravelMinutes,
  resolveTripAssessmentTravelMode,
  type ItemTravelSegment,
} from '../utils/trip-assessment-travel-mode.util';
import { PlanningConflictsService } from '../trip-constraint-solver/services/planning-conflicts.service';
import {
  buildAssessPlanningConflictsPayload,
  buildTripDayIndexMaps,
  capTripGradeForPlanningConflicts,
  groupPlanningConflictsByDate,
  integratePlanningConflictsIntoDay,
  integratePlanningConflictsIntoDays,
} from '../utils/trip-assessment-planning-conflicts.util';

@Injectable()
export class TripMetricsService {
  private readonly logger = new Logger(TripMetricsService.name);

  constructor(
    private prisma: PrismaService,
    private conflictsService: TripConflictsService,
    private readonly itineraryItems: ItineraryItemsService,
    @Inject(forwardRef(() => PlanningConflictsService))
    private readonly planningConflicts: PlanningConflictsService,
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
  async getTripMetrics(
    tripId: string,
    dates?: string[],
    options?: { includeConflicts?: boolean },
  ): Promise<TripMetricsResponseDto> {
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
    let previousDayLastItem: any | null = null;
    for (const day of trip.TripDay) {
      const date = DateTime.fromJSDate(day.date).toISODate() || '';
      const metrics = await this.calculateDayMetrics(day, previousDayLastItem);
      const conflicts = options?.includeConflicts === false
        ? []
        : await this.conflictsService.getDayConflicts(tripId, day.id);
      
      days.push({
        date,
        metrics,
        conflicts: conflicts as any, // ConflictDto 类型兼容，但包含更多字段
      });

      const items = day.ItineraryItem || [];
      previousDayLastItem = items.length > 0 ? items[items.length - 1] : previousDayLastItem;
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
  private async calculateDayMetrics(
    day: any,
    previousDayLastItem?: any | null,
  ): Promise<DayMetricsResponseDto['metrics']> {
    const items = day.ItineraryItem || [];
    const coordinateMap = await this.getPlaceCoordinateMap([previousDayLastItem, ...items]);
    
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

    // 使用新的交通信息字段计算；字段缺失时用 POI 坐标兜底估算。
    const travelPairs: Array<{ prev: any; current: any }> = [];
    if (previousDayLastItem && items.length > 0) {
      travelPairs.push({ prev: previousDayLastItem, current: items[0] });
    }
    for (let i = 1; i < items.length; i++) {
      travelPairs.push({ prev: items[i - 1], current: items[i] });
    }

    for (const pair of travelPairs) {
      const { prev, current } = pair;

      let distance = current.travelFromPreviousDistance || 0; // 米
      const travelMode = (current.travelMode || 'DRIVING').toUpperCase();
      if (!distance) {
        distance = this.estimateDistanceMeters(prev, current, coordinateMap);
      }

      let duration = current.travelFromPreviousDuration || 0; // 分钟
      if (!duration && distance > 0) {
        duration = this.estimateTravelDurationMinutes(distance, travelMode);
      }

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

  private async getPlaceCoordinateMap(items: Array<any | null | undefined>): Promise<Map<number, { lat: number; lng: number }>> {
    const placeIds = Array.from(
      new Set(
        items
          .map((item) => Number(item?.placeId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    if (placeIds.length === 0) {
      return new Map();
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
      `;
      return new Map(rows.map((row) => [row.id, { lat: Number(row.lat), lng: Number(row.lng) }]));
    } catch (error) {
      this.logger.debug(`Failed to fetch place coordinates for metrics fallback: ${error}`);
      return new Map();
    }
  }

  private estimateDistanceMeters(
    prev: any,
    current: any,
    coordinateMap: Map<number, { lat: number; lng: number }>,
  ): number {
    const prevCoords = this.resolveItemCoordinates(prev, coordinateMap);
    const currentCoords = this.resolveItemCoordinates(current, coordinateMap);
    if (!prevCoords || !currentCoords) {
      return 0;
    }
    return Math.round(
      this.haversineDistance(prevCoords.lat, prevCoords.lng, currentCoords.lat, currentCoords.lng) * 1000,
    );
  }

  private resolveItemCoordinates(
    item: any,
    coordinateMap: Map<number, { lat: number; lng: number }>,
  ): { lat: number; lng: number } | null {
    if (!item) {
      return null;
    }
    const placeId = Number(item.placeId);
    if (Number.isInteger(placeId) && coordinateMap.has(placeId)) {
      return coordinateMap.get(placeId)!;
    }
    const metadata = item.Place?.metadata as any;
    const candidates = [
      item.coordinates,
      metadata?.coordinates,
      metadata?.location,
      item.Place?.coordinates,
    ];
    for (const candidate of candidates) {
      const lat = Number(candidate?.lat ?? candidate?.latitude);
      const lng = Number(candidate?.lng ?? candidate?.lon ?? candidate?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return null;
  }

  private estimateTravelDurationMinutes(distanceMeters: number, travelMode: string): number {
    const distanceKm = distanceMeters / 1000;
    const speedKmh =
      travelMode === 'WALKING' ? 4.5 :
      travelMode === 'BICYCLE' ? 15 :
      travelMode === 'TRAIN' ? 80 :
      travelMode === 'FLIGHT' ? 500 :
      travelMode === 'FERRY' ? 35 :
      travelMode === 'TRANSIT' ? 35 :
      60;
    return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
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

  /**
   * 解析出行方式
   * 优先级：请求参数 > 行程配置 > 用户偏好 > 默认值
   */
  private async resolveTravelMode(
    tripId: string,
    pacingConfig: unknown,
    requestTravelMode?: TravelMode,
  ): Promise<TravelMode> {
    let userPreference: TravelMode | undefined;
    try {
      const collaborator = await this.prisma.tripCollaborator.findFirst({
        where: { tripId, role: 'OWNER' },
        select: { userId: true },
      });
      if (collaborator?.userId) {
        const userProfile = await this.prisma.userProfile.findUnique({
          where: { userId: collaborator.userId },
          select: { preferences: true },
        });
        userPreference = (
          userProfile?.preferences as { travelPreferences?: { travelMode?: TravelMode } } | null
        )?.travelPreferences?.travelMode;
      }
    } catch (error) {
      this.logger.debug(`Failed to get user travel mode preference: ${error}`);
    }

    return resolveTripAssessmentTravelMode(pacingConfig, requestTravelMode, userPreference);
  }

  private async loadDayTravelSegments(
    tripId: string,
    dayId: string,
  ): Promise<Map<string, ItemTravelSegment>> {
    try {
      const info = await this.itineraryItems.getDayTravelInfo(tripId, dayId);
      return buildTravelSegmentMap(info.segments);
    } catch (error) {
      this.logger.debug(`assess: travel-info unavailable for day ${dayId}: ${error}`);
      return new Map();
    }
  }

  /**
   * 评估行程每日安排是否合理
   */
  async assessTrip(tripId: string, dto: AssessTripRequestDto = {}): Promise<AssessTripResponseDto> {
    const [trip, planningConflictsResp, allTripDays] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            where: dto.dates
              ? { date: { in: dto.dates.map(d => DateTime.fromISO(d).toJSDate()) } }
              : undefined,
            include: {
              ItineraryItem: {
                include: { Place: true },
                orderBy: { startTime: 'asc' },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      }),
      this.planningConflicts.getPlanningConflicts(tripId).catch((error) => {
        this.logger.debug(`assess: planning-conflicts unavailable: ${error}`);
        return null;
      }),
      this.prisma.tripDay.findMany({
        where: { tripId },
        select: {
          id: true,
          date: true,
          ItineraryItem: { select: { id: true } },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取出行方式，优先级：请求参数 > 行程配置 > 用户偏好 > 默认值
    const travelMode = await this.resolveTravelMode(tripId, trip.pacingConfig, dto.travelMode);

    const lunchStrategy: LunchStrategy =
      normalizeLunchStrategy(dto.lunch_strategy) ?? resolveLunchStrategyFromTrip(trip);

    // 将出行方式与午餐策略注入到 dto 中，供后续方法使用
    const enrichedDto = { ...dto, travelMode, lunch_strategy: lunchStrategy };

    // 获取 Place 坐标用于地理分析
    const placeIds = trip.TripDay.flatMap(d =>
      (d.ItineraryItem || []).map((i: any) => i.placeId).filter((id: any) => id != null)
    );
    const coordsMap = await this.getPlaceCoordinatesMap(placeIds as number[]);

    const days: DayAssessmentDto[] = [];
    const totalTripDays = trip.TripDay.length;

    for (let i = 0; i < trip.TripDay.length; i++) {
      const day = trip.TripDay[i];
      const isFirstDay = i === 0;
      const isLastDay = i === totalTripDays - 1;

      const travelByToItem = await this.loadDayTravelSegments(tripId, day.id);

      const assessment = await this.assessDay(
        day,
        enrichedDto,
        coordsMap,
        isFirstDay,
        isLastDay,
        travelByToItem,
      );
      days.push(assessment);
    }

    const dayIndexMaps = buildTripDayIndexMaps(allTripDays);
    const mergedConflicts = planningConflictsResp?.conflicts ?? [];
    const conflictsByDate = groupPlanningConflictsByDate(mergedConflicts, dayIndexMaps);
    const { days: adjustedDays, tripWideConflicts } = integratePlanningConflictsIntoDays(
      days,
      conflictsByDate,
    );

    const aggregate = aggregateTripAssessmentDays(adjustedDays);
    const conflictSummary = planningConflictsResp?.summary ?? {
      mustHandle: 0,
      suggestAdjust: 0,
      pendingConfirm: 0,
      total: 0,
      byCategory: {},
    };
    const gradeCap = capTripGradeForPlanningConflicts(aggregate.overallAverageScore, {
      mustHandle: conflictSummary.mustHandle,
      suggestAdjust: conflictSummary.suggestAdjust,
    });
    const overallGrade = gradeCap.overallGrade;
    const overallAverageScore = gradeCap.overallAverageScore;
    const overallReasonableRate = overallAverageScore;

    const planningConflictsBlock = planningConflictsResp
      ? buildAssessPlanningConflictsPayload({
          summary: {
            total: planningConflictsResp.summary.total,
            mustHandle: planningConflictsResp.summary.mustHandle,
            suggestAdjust: planningConflictsResp.summary.suggestAdjust,
            pendingConfirm: planningConflictsResp.summary.pendingConfirm,
            verdictStatus: planningConflictsResp.verdict?.status,
          },
          items: mergedConflicts,
          tripWideItems: tripWideConflicts,
        })
      : undefined;

    let tripSummary = this.generateTripSummaryV2(
      adjustedDays,
      aggregate.reasonableDays,
      aggregate.needsAttentionDays,
      aggregate.hasIssuesDays,
      aggregate.unplannedDays,
      aggregate.restDays,
      aggregate.plannedDays,
    );
    if (tripWideConflicts.length > 0) {
      const tripWideNote = `另有 ${tripWideConflicts.length} 项行程级规划事项（见 planningConflicts.tripWideItems）`;
      tripSummary = tripSummary ? `${tripSummary}；${tripWideNote}` : tripWideNote;
    }

    return {
      tripId,
      totalDays: adjustedDays.length,
      reasonableDays: aggregate.reasonableDays,
      needsAttentionDays: aggregate.needsAttentionDays,
      hasIssuesDays: aggregate.hasIssuesDays,
      unplannedDays: aggregate.unplannedDays,
      restDays: aggregate.restDays,
      plannedDays: aggregate.plannedDays,
      overallReasonableRate,
      overallAverageScore,
      daysPassRate: aggregate.daysPassRate,
      overallGrade,
      effectiveTravelMode: travelMode,
      days: adjustedDays,
      summary: tripSummary,
      topSuggestions: collectTopSuggestions(adjustedDays),
      ...(planningConflictsBlock ? { planningConflicts: planningConflictsBlock } : {}),
    };
  }

  /**
   * 评估单日行程
   */
  private async assessDay(
    day: any,
    dto: AssessTripRequestDto,
    coordsMap: Map<number, { lat: number; lng: number }>,
    isFirstDay: boolean = false,
    isLastDay: boolean = false,
    travelByToItem: Map<string, ItemTravelSegment> = new Map(),
  ): Promise<DayAssessmentDto> {
    const allItems = day.ItineraryItem || [];
    const items = allItems.filter((i: any) => i.type !== 'REST');
    const date = DateTime.fromJSDate(day.date).toISODate() || '';

    // 检测日程类型
    const dayType = this.detectDayType(allItems, isFirstDay, isLastDay);

    // 计算活动时长
    let activeDurationMinutes = 0;
    for (const item of items) {
      if (item.startTime && item.endTime) {
        const start = DateTime.fromJSDate(item.startTime);
        const end = DateTime.fromJSDate(item.endTime);
        activeDurationMinutes += end.diff(start, 'minutes').minutes;
      }
    }

    // 未规划的日期（非休息日且无活动）- 特殊处理
    if (dayType === DayType.UNPLANNED) {
      return {
        date,
        dayType: DayType.UNPLANNED,
        status: AssessmentStatus.UNPLANNED,
        activityCount: 0,
        activeDurationHours: 0,
        overallScore: null,
        overallGrade: null,
        isReasonable: false,
        dimensions: undefined,
        criticalIssueCount: 0,
        warningCount: 1,
        summary: `${date} 尚未安排活动，请添加行程规划`,
        topSuggestion: '请为当天添加至少 2-3 个活动',
      };
    }

    // 休息日 - 宽松评估
    if (dayType === DayType.REST_DAY) {
      return {
        date,
        dayType: DayType.REST_DAY,
        status: AssessmentStatus.REASONABLE,
        activityCount: items.length,
        activeDurationHours: Math.round(activeDurationMinutes / 60 * 10) / 10,
        overallScore: 90,
        overallGrade: AssessmentGrade.EXCELLENT,
        isReasonable: true,
        dimensions: undefined,
        criticalIssueCount: 0,
        warningCount: 0,
        summary: `${date} 是休息日，安排合理`,
        topSuggestion: undefined,
      };
    }

    const dimensions: DimensionAssessmentDto[] = [];

    // 1. 时间安排评估（到达/离开日宽松阈值）
    dimensions.push(assessTimingForDay(items, dto, dayType));

    // 获取出行方式，默认公共交通
    const travelMode = dto.travelMode || TravelMode.PUBLIC_TRANSIT;

    // 2. 活动密度评估（根据日程类型和出行方式调整期望）
    dimensions.push(this.assessDensityV2(items, activeDurationMinutes, dto, dayType, travelMode));

    // 3. 用餐安排评估（到达日/离开日宽松处理）
    dimensions.push(
      this.assessMealsV2(items, day.date, dayType, dto.lunch_strategy ?? 'balanced'),
    );

    // 4. 体力负荷评估
    dimensions.push(this.assessPhysical(items, dto));

    // 5. 交通效率评估（根据出行方式调整标准；耗时与 travel-info 同源）
    dimensions.push(this.assessTransport(items, travelMode, travelByToItem));

    // 6. 地理分布评估（根据出行方式调整阈值）
    dimensions.push(this.assessGeography(items, coordsMap, travelMode));

    // 7. 缓冲时间评估（交通耗时与 travel-info 同源）
    dimensions.push(this.assessBuffer(items, travelByToItem));

    // 计算综合得分（加权平均）
    // 权重设计基于用户心智：景点密度和地理分布是核心关注点
    const mealsDim = dimensions.find((d) => d.dimension === AssessmentDimension.MEALS);
    const mealsHasIssues = Boolean(mealsDim?.issues && mealsDim.issues.length > 0);

    const weights: Partial<Record<AssessmentDimension, number>> = {
      [AssessmentDimension.TIMING]: 1.5,      // 时间合理性：高优先
      [AssessmentDimension.DENSITY]: 1.5,     // 活动密度：高优先
      [AssessmentDimension.GEOGRAPHY]: 1.5,   // 地理分布：高优先（用户关注"顺不顺路"）
      [AssessmentDimension.TRANSPORT]: 1.2,   // 交通效率：中高优先
      [AssessmentDimension.BUFFER]: 1.2,      // 缓冲时间：中高优先
      [AssessmentDimension.PHYSICAL]: 1.0,    // 体力负荷：中优先
      [AssessmentDimension.MEALS]: mealsHasIssues ? 1.2 : 0.5, // 有缺口时升级为中高优先
    };

    let totalWeight = 0;
    let weightedSum = 0;
    for (const dim of dimensions) {
      const weight = weights[dim.dimension] || 1;
      weightedSum += dim.score * weight;
      totalWeight += weight;
    }

    const overallScore = Math.round(weightedSum / totalWeight);
    const overallGrade = this.scoreToGrade(overallScore);
    
    // 根据分数确定状态
    const status = this.scoreToStatus(overallScore);
    const isReasonable = status === AssessmentStatus.REASONABLE;

    const criticalIssueCount = dimensions.filter(d => d.grade === AssessmentGrade.BAD).length;
    const warningCount = dimensions.filter(d => d.grade === AssessmentGrade.POOR || d.grade === AssessmentGrade.FAIR).length;

    const worstDimension = [...dimensions].sort((a, b) => a.score - b.score)[0];
    const topSuggestion = pickActionableTopSuggestion({
      overallScore,
      status,
      worstDimensionScore: worstDimension?.score ?? 100,
      suggestion: worstDimension?.suggestions?.[0],
    });

    return {
      date,
      dayType,
      status,
      activityCount: items.length,
      activeDurationHours: Math.round(activeDurationMinutes / 60 * 10) / 10,
      overallScore,
      overallGrade,
      isReasonable,
      dimensions,
      criticalIssueCount,
      warningCount,
      summary: this.generateDaySummaryV2(date, overallScore, status, dimensions),
      topSuggestion,
    };
  }

  /**
   * 检测日程类型
   */
  private detectDayType(items: any[], isFirstDay: boolean, isLastDay: boolean): DayType {
    const nonRestItems = items.filter((i: any) => i.type !== 'REST');
    const restItems = items.filter((i: any) => i.type === 'REST');
    
    // 检查是否有交通类活动（机场、火车站等）
    const hasArrivalTransit = items.some((i: any) => {
      const placeName = (i.Place?.nameCN || i.Place?.nameEN || '').toLowerCase();
      const placeCategory = i.Place?.category;
      return i.type === 'TRANSIT' || 
        placeCategory === 'AIRPORT' || 
        placeCategory === 'TRAIN_STATION' ||
        placeName.includes('机场') || 
        placeName.includes('airport') ||
        placeName.includes('火车站') ||
        placeName.includes('station');
    });

    // 无任何活动（包括REST）= 未规划
    if (items.length === 0) {
      return DayType.UNPLANNED;
    }

    // 只有酒店/住宿 = 休息日
    if (nonRestItems.length === 0 && restItems.length > 0) {
      return DayType.REST_DAY;
    }

    // 只有1个活动且是酒店 = 休息日
    if (nonRestItems.length === 0) {
      return DayType.REST_DAY;
    }

    // 首日且活动较少（0-2个） = 到达日
    if (isFirstDay && nonRestItems.length <= 2) {
      return DayType.ARRIVAL_DAY;
    }

    // 末日且活动较少（0-2个） = 离开日
    if (isLastDay && nonRestItems.length <= 2) {
      return DayType.DEPARTURE_DAY;
    }

    // 有交通且活动少 = 到达/离开日
    if (hasArrivalTransit && nonRestItems.length <= 2) {
      return isFirstDay ? DayType.ARRIVAL_DAY : DayType.DEPARTURE_DAY;
    }

    // 默认为游览日
    return DayType.TOURING_DAY;
  }

  /**
   * 分数转状态（三态）
   */
  private scoreToStatus(score: number): AssessmentStatus {
    if (score >= 75) return AssessmentStatus.REASONABLE;
    if (score >= 50) return AssessmentStatus.NEEDS_ATTENTION;
    return AssessmentStatus.HAS_ISSUES;
  }

  /**
   * 评估活动密度 V2 - 根据日程类型和出行方式调整期望
   */
  private assessDensityV2(
    items: any[],
    activeDurationMinutes: number,
    dto: AssessTripRequestDto,
    dayType: DayType,
    travelMode: TravelMode
  ): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const activityCount = items.length;
    const activeDurationHours = activeDurationMinutes / 60;

    // 自驾机动性更强，可以多安排活动
    const isDriving = travelMode === TravelMode.DRIVING;
    const activityBonus = isDriving ? 1 : 0;  // 自驾每档多 1 个活动
    const hourBonus = isDriving ? 1 : 0;      // 自驾每档多 1 小时

    // 根据日程类型和偏好调整阈值
    let minActivities: number;
    let optimalActivities: number;
    let maxActivities: number;
    let maxHours: number;

    switch (dayType) {
      case DayType.ARRIVAL_DAY:
      case DayType.DEPARTURE_DAY:
        minActivities = 1;
        optimalActivities = 2 + activityBonus;
        maxActivities = 4 + activityBonus;
        maxHours = 6 + hourBonus;
        break;
      case DayType.REST_DAY:
        minActivities = 0;
        optimalActivities = 1;
        maxActivities = 2;
        maxHours = 3;
        break;
      case DayType.TOURING_DAY:
      default:
        // 游览日根据节奏偏好调整
        if (dto.pacingPreference === 'relaxed') {
          minActivities = 2;
          optimalActivities = 3 + activityBonus;
          maxActivities = 4 + activityBonus;
          maxHours = 6 + hourBonus;
        } else if (dto.pacingPreference === 'intensive') {
          minActivities = 3;
          optimalActivities = 5 + activityBonus;
          maxActivities = 8 + activityBonus;
          maxHours = 10 + hourBonus;
        } else {
          minActivities = 2;
          optimalActivities = 4 + activityBonus;
          maxActivities = 6 + activityBonus;
          maxHours = 8 + hourBonus;
        }
        break;
    }

    // 评估活动数量
    if (activityCount === 0 && dayType === DayType.TOURING_DAY) {
      // 游览日无活动 - 严重扣分
      score -= 50;
      issues.push('游览日没有安排任何活动');
      suggestions.push(`建议添加 ${minActivities}-${maxActivities} 个活动`);
    } else if (activityCount < minActivities) {
      // 活动太少
      const deficit = minActivities - activityCount;
      score -= deficit * 20;
      issues.push(`活动数量偏少 (${activityCount} 个，建议至少 ${minActivities} 个)`);
      suggestions.push(`建议再添加 ${deficit} 个活动`);
    } else if (activityCount > maxActivities) {
      // 活动太多
      const excess = activityCount - maxActivities;
      score -= excess * 10;
      issues.push(`活动数量过多 (${activityCount} 个)`);
      suggestions.push(`建议减少到 ${maxActivities} 个活动以内`);
    } else if (activityCount >= minActivities && activityCount <= optimalActivities + 1) {
      // 最优区间 - 额外加分
      score = Math.min(100, score + 5);
    }

    // 检查活动时长
    if (activeDurationHours > maxHours) {
      score -= 15;
      issues.push(`活动总时长过长 (${Math.round(activeDurationHours)} 小时)`);
      suggestions.push(`建议控制活动总时长在 ${maxHours} 小时内`);
    } else if (activeDurationHours < 2 && dayType === DayType.TOURING_DAY && activityCount >= 2) {
      score -= 10;
      issues.push(`活动总时长过短 (${Math.round(activeDurationHours)} 小时)`);
    }

    // 检查是否有特长活动（超过 4 小时）
    for (const item of items) {
      if (item.startTime && item.endTime) {
        const duration = DateTime.fromJSDate(item.endTime).diff(DateTime.fromJSDate(item.startTime), 'hours').hours;
        if (duration > 4) {
          const placeName = item.Place?.nameCN || item.Place?.nameEN || '活动';
          issues.push(`「${placeName}」时间过长 (${Math.round(duration)} 小时)`);
          score -= 5;
        }
      }
    }

    return {
      dimension: AssessmentDimension.DENSITY,
      name: '活动密度',
      score: Math.max(0, Math.min(100, score)),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '活动密度适中' : `发现 ${issues.length} 个密度问题`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 评估用餐安排 V2 - 极简版，只检测极端情况
   * 
   * 产品逻辑：用户主要关注景点和距离，用餐通常"到时候再说"
   * 只在以下极端情况才提示：
   * 1. 连续活动跨越午餐时段（11:00-14:00）且中间无空档
   * 2. 连续活动跨越晚餐时段（17:00-20:00）且中间无空档
   */
  private assessMealsV2(
    items: any[],
    date: Date,
    _dayType: DayType,
    lunchStrategy: LunchStrategy = 'balanced',
  ): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;
    const minLunchGap = getMinLunchGapMinutes(lunchStrategy);

    // 无活动或活动很少时，不评估用餐
    if (items.length < 2) {
      return {
        dimension: AssessmentDimension.MEALS,
        name: '用餐安排',
        score: 100,
        grade: AssessmentGrade.EXCELLENT,
        passed: true,
        description: '无需评估',
      };
    }

    const dayStart = DateTime.fromJSDate(date).startOf('day');

    // 按开始时间排序活动
    const sortedItems = items
      .filter((i: any) => i.startTime && i.endTime)
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (sortedItems.length < 2) {
      return {
        dimension: AssessmentDimension.MEALS,
        name: '用餐安排',
        score: 100,
        grade: AssessmentGrade.EXCELLENT,
        passed: true,
        description: '无需评估',
      };
    }

    // 检查午餐时段空档 (11:00-14:00)
    const lunchStart = dayStart.set({ hour: 11, minute: 0 });
    const lunchEnd = dayStart.set({ hour: 14, minute: 0 });
    const lunchGap = this.findMaxGapInWindow(sortedItems, lunchStart, lunchEnd);
    
    if (lunchGap < minLunchGap) {
      score -= lunchStrategy === 'rigid' ? 25 : 15;
      const copy = buildMealsAssessmentCopy({
        strategy: lunchStrategy,
        lunchGapMinutes: lunchGap,
        minRequired: minLunchGap,
      });
      issues.push(copy.issue);
      suggestions.push(copy.suggestion);
    }

    // 检查晚餐时段空档 (17:00-20:00)
    const dinnerStart = dayStart.set({ hour: 17, minute: 0 });
    const dinnerEnd = dayStart.set({ hour: 20, minute: 0 });
    const dinnerGap = this.findMaxGapInWindow(sortedItems, dinnerStart, dinnerEnd);
    
    // 只有当晚间有活动时才检查晚餐空档
    const hasEveningActivity = sortedItems.some((i: any) => {
      const hour = DateTime.fromJSDate(i.startTime).hour;
      return hour >= 17;
    });

    if (hasEveningActivity && dinnerGap < 30) {
      score -= 15;
      issues.push(`晚餐时段 (17:00-20:00) 空档不足，仅 ${dinnerGap} 分钟`);
      suggestions.push('建议在晚间活动前预留用餐时间');
    }

    return {
      dimension: AssessmentDimension.MEALS,
      name: '用餐安排',
      score: Math.max(0, score),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '用餐时间充足' : `${issues.length} 个时段较紧凑`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 计算指定时间窗口内活动间的最大空档
   */
  private findMaxGapInWindow(sortedItems: any[], windowStart: DateTime, windowEnd: DateTime): number {
    let maxGap = 0;
    
    // 检查窗口开始到第一个活动的空档
    const firstInWindow = sortedItems.find((i: any) => {
      const start = DateTime.fromJSDate(i.startTime);
      return start >= windowStart && start <= windowEnd;
    });
    
    if (firstInWindow) {
      const firstStart = DateTime.fromJSDate(firstInWindow.startTime);
      const gapToFirst = firstStart.diff(windowStart, 'minutes').minutes;
      if (gapToFirst > 0) {
        maxGap = Math.max(maxGap, gapToFirst);
      }
    } else {
      // 窗口内没有活动，检查是否有活动跨越这个窗口
      const crossingItem = sortedItems.find((i: any) => {
        const start = DateTime.fromJSDate(i.startTime);
        const end = DateTime.fromJSDate(i.endTime);
        return start < windowStart && end > windowEnd;
      });
      
      if (!crossingItem) {
        // 窗口完全空闲
        return windowEnd.diff(windowStart, 'minutes').minutes;
      } else {
        // 有活动完全覆盖窗口
        return 0;
      }
    }

    // 检查窗口内相邻活动之间的空档
    const itemsInWindow = sortedItems.filter((i: any) => {
      const start = DateTime.fromJSDate(i.startTime);
      const end = DateTime.fromJSDate(i.endTime);
      return (start >= windowStart && start <= windowEnd) || 
             (end >= windowStart && end <= windowEnd) ||
             (start < windowStart && end > windowEnd);
    });

    for (let j = 0; j < itemsInWindow.length - 1; j++) {
      const currentEnd = DateTime.fromJSDate(itemsInWindow[j].endTime);
      const nextStart = DateTime.fromJSDate(itemsInWindow[j + 1].startTime);
      
      // 计算在窗口范围内的空档
      const gapStart = currentEnd < windowStart ? windowStart : currentEnd;
      const gapEnd = nextStart > windowEnd ? windowEnd : nextStart;
      
      if (gapEnd > gapStart) {
        const gap = gapEnd.diff(gapStart, 'minutes').minutes;
        maxGap = Math.max(maxGap, gap);
      }
    }

    // 检查最后一个活动到窗口结束的空档
    if (itemsInWindow.length > 0) {
      const lastEnd = DateTime.fromJSDate(itemsInWindow[itemsInWindow.length - 1].endTime);
      if (lastEnd < windowEnd) {
        const gapToEnd = windowEnd.diff(lastEnd, 'minutes').minutes;
        maxGap = Math.max(maxGap, gapToEnd);
      }
    }

    return Math.round(maxGap);
  }

  /**
   * 生成每日评语 V2
   */
  private generateDaySummaryV2(
    date: string,
    score: number,
    status: AssessmentStatus,
    dimensions: DimensionAssessmentDto[]
  ): string {
    const failedDims = dimensions.filter(d => !d.passed);

    switch (status) {
      case AssessmentStatus.REASONABLE:
        return `${date} 的行程安排合理，可以放心出行。`;
      case AssessmentStatus.NEEDS_ATTENTION:
        const attentionIssues = failedDims.map(d => d.name).join('、');
        return `${date} 的行程基本可行，但 ${attentionIssues || '部分方面'} 需要关注。`;
      case AssessmentStatus.HAS_ISSUES:
        const criticalIssues = failedDims.map(d => d.name).join('、');
        return `${date} 的行程存在问题，建议重点调整 ${criticalIssues || '活动安排'}。`;
      default:
        return `${date} 尚未规划，请添加活动。`;
    }
  }

  /**
   * 生成整体评语 V2
   */
  private generateTripSummaryV2(
    days: DayAssessmentDto[],
    reasonableDays: number,
    needsAttentionDays: number,
    hasIssuesDays: number,
    unplannedDays: number,
    restDays: number,
    plannedDays: number,
  ): string {
    const totalDays = days.length;

    if (unplannedDays === totalDays) {
      return '行程尚未开始规划，请为每天添加活动。';
    }

    if (plannedDays === 0) {
      return restDays > 0
        ? `当前 ${restDays} 天为休息日，尚未安排有效游览活动。`
        : '行程尚未开始规划，请为每天添加活动。';
    }

    if (unplannedDays > 0) {
      const restHint = restDays > 0 ? `（另有 ${restDays} 天为休息日）` : '';
      return `还有 ${unplannedDays} 天尚未规划，已有效规划的 ${plannedDays} 天中 ${reasonableDays} 天安排合理${restHint}。`;
    }

    if (hasIssuesDays === 0 && needsAttentionDays === 0) {
      const restHint = restDays > 0 ? `（含 ${restDays} 天休息日）` : '';
      return `行程整体安排合理，有效规划日都经过了良好的评估${restHint}。`;
    }

    if (hasIssuesDays === 0) {
      return `行程整体安排良好，${needsAttentionDays} 天需要微调。`;
    }

    if (hasIssuesDays <= totalDays * 0.3) {
      return `行程基本可行，${hasIssuesDays} 天存在问题需要调整。`;
    }

    return `行程安排存在较多问题（${hasIssuesDays} 天），建议重新规划。`;
  }

  /**
   * 评估体力负荷
   */
  private assessPhysical(items: any[], dto: AssessTripRequestDto): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // 计算总疲劳分
    let totalFatigue = 0;
    let totalWalkKm = 0;
    let totalAscent = 0;
    let highIntensityCount = 0;

    for (const item of items) {
      if (item.Place?.physicalMetadata) {
        const physical = item.Place.physicalMetadata as any;
        totalFatigue += physical.fatigueScore || 0;
        totalAscent += physical.elevationGain || physical.elevation || 0;
        
        if (physical.intensity_factor && physical.intensity_factor >= 1.5) {
          highIntensityCount++;
        }
      }
      
      // 累计步行距离
      if (item.travelFromPreviousDistance && item.travelMode === 'WALKING') {
        totalWalkKm += item.travelFromPreviousDistance / 1000;
      }
    }

    // 根据用户体力水平和偏好调整阈值
    const fitnessLevel = dto.fitnessLevel || 3;
    const baseFatigueThreshold = 80;
    const fatigueThreshold = baseFatigueThreshold * (fitnessLevel / 3);

    // 有老人或儿童时降低阈值
    const adjustedThreshold = (dto.hasElderly || dto.hasChildren)
      ? fatigueThreshold * 0.7
      : fatigueThreshold;

    if (totalFatigue > adjustedThreshold) {
      const excess = Math.round(totalFatigue - adjustedThreshold);
      score -= Math.min(40, excess / 2);
      issues.push(`体力消耗过大 (疲劳指数 ${Math.round(totalFatigue)})`);
      suggestions.push('建议减少高强度活动或增加休息时间');
    }

    if (highIntensityCount >= 3) {
      score -= 15;
      issues.push(`高强度活动过多 (${highIntensityCount} 个)`);
      suggestions.push('建议将高强度活动分散到不同天');
    }

    if (totalAscent > 500) {
      score -= 10;
      issues.push(`累计爬升较高 (${totalAscent} 米)`);
      if (dto.hasElderly || dto.hasChildren) {
        score -= 10;
        suggestions.push('携带老人/儿童时建议减少爬坡活动');
      }
    }

    if (totalWalkKm > 10) {
      score -= 10;
      issues.push(`步行距离较长 (${Math.round(totalWalkKm)} 公里)`);
    }

    return {
      dimension: AssessmentDimension.PHYSICAL,
      name: '体力负荷',
      score: Math.max(0, score),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '体力安排合理' : `发现 ${issues.length} 个体力问题`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 评估交通效率（根据出行方式调整标准）
   */
  private assessTransport(
    items: any[],
    travelMode: TravelMode,
    travelByToItem: Map<string, ItemTravelSegment>,
  ): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    if (items.length < 2) {
      return {
        dimension: AssessmentDimension.TRANSPORT,
        name: '交通效率',
        score: 100,
        grade: AssessmentGrade.EXCELLENT,
        passed: true,
        description: '活动较少，无需评估交通',
      };
    }

    // 根据出行方式设置阈值
    // 自驾：门到门效率高，可接受更长的单程和更高的交通占比
    // 公共交通：需要等车、换乘，对效率要求更严格
    const isDriving = travelMode === TravelMode.DRIVING;
    const longTravelThreshold = isDriving ? 90 : 60;        // 单程"过长"阈值（分钟）
    const highRatioThreshold = isDriving ? 0.45 : 0.35;     // "过高"交通占比
    const mediumRatioThreshold = isDriving ? 0.35 : 0.25;   // "较高"交通占比
    const totalTravelThreshold = isDriving ? 240 : 180;     // 总交通时间阈值（分钟）

    // 统计交通时间
    let totalTravelMinutes = 0;
    let longTravelCount = 0;

    for (const item of items) {
      const duration = resolveItemTravelMinutes(item, travelByToItem);
      totalTravelMinutes += duration;

      if (duration > longTravelThreshold) {
        longTravelCount++;
        const placeName = item.Place?.nameCN || item.Place?.nameEN || '活动';
        issues.push(`前往「${placeName}」交通时间过长 (${duration} 分钟)`);
      }
    }

    // 检查总交通时间占比
    const totalActivityMinutes = items.reduce((sum: number, item: any) => {
      if (item.startTime && item.endTime) {
        return sum + DateTime.fromJSDate(item.endTime).diff(DateTime.fromJSDate(item.startTime), 'minutes').minutes;
      }
      return sum;
    }, 0);

    const travelRatio = totalActivityMinutes > 0
      ? totalTravelMinutes / (totalActivityMinutes + totalTravelMinutes)
      : 0;

    if (travelRatio > highRatioThreshold) {
      score -= 25;
      issues.push(`交通时间占比过高 (${Math.round(travelRatio * 100)}%)`);
      suggestions.push('建议优化地点顺序或选择更近的景点');
    } else if (travelRatio > mediumRatioThreshold) {
      score -= 10;
      issues.push(`交通时间占比较高 (${Math.round(travelRatio * 100)}%)`);
    }

    if (longTravelCount >= 2) {
      score -= isDriving ? 10 : 15;  // 自驾对多次长途更宽容
      suggestions.push('建议减少长途移动次数，或将长途移动安排在相邻日期');
    }

    if (totalTravelMinutes > totalTravelThreshold) {
      score -= 15;
      issues.push(`总交通时间过长 (${Math.round(totalTravelMinutes / 60)} 小时)`);
    }

    return {
      dimension: AssessmentDimension.TRANSPORT,
      name: '交通效率',
      score: Math.max(0, score),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '交通安排高效' : `发现 ${issues.length} 个交通问题`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 评估地理分布（根据出行方式调整阈值）
   */
  private assessGeography(
    items: any[],
    coordsMap: Map<number, { lat: number; lng: number }>,
    travelMode: TravelMode
  ): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    if (items.length < 2) {
      return {
        dimension: AssessmentDimension.GEOGRAPHY,
        name: '地理分布',
        score: 100,
        grade: AssessmentGrade.EXCELLENT,
        passed: true,
        description: '活动较少，无需评估地理分布',
      };
    }

    // 根据出行方式设置距离阈值
    // 自驾：可接受更分散的景点（高速公路快）
    // 公共交通：需要景点更集中（换乘耗时）
    const isDriving = travelMode === TravelMode.DRIVING;
    const maxDistanceHigh = isDriving ? 80 : 50;      // "过远"阈值（公里）
    const maxDistanceMedium = isDriving ? 50 : 30;    // "较大"阈值（公里）
    const backtrackPenalty = isDriving ? 15 : 20;     // 折返扣分

    // 收集有坐标的活动
    const locatedItems = items
      .filter((i: any) => i.placeId && coordsMap.has(i.placeId))
      .map((i: any) => ({
        item: i,
        coords: coordsMap.get(i.placeId)!,
      }));

    if (locatedItems.length < 2) {
      return {
        dimension: AssessmentDimension.GEOGRAPHY,
        name: '地理分布',
        score: 85,
        grade: AssessmentGrade.GOOD,
        passed: true,
        description: '部分活动缺少位置信息',
      };
    }

    // 检查是否存在「折返」（A -> B -> A 模式）
    let backtrackCount = 0;
    for (let i = 0; i < locatedItems.length - 2; i++) {
      const a = locatedItems[i].coords;
      const b = locatedItems[i + 1].coords;
      const c = locatedItems[i + 2].coords;

      const distAB = this.haversineDistance(a.lat, a.lng, b.lat, b.lng);
      const distBC = this.haversineDistance(b.lat, b.lng, c.lat, c.lng);
      const distAC = this.haversineDistance(a.lat, a.lng, c.lat, c.lng);

      // 如果 A 到 C 的距离明显小于 A->B + B->C，可能存在折返
      if (distAC < (distAB + distBC) * 0.5 && distAB > 2 && distBC > 2) {
        backtrackCount++;
      }
    }

    if (backtrackCount >= 2) {
      score -= backtrackPenalty;
      issues.push('路线存在多次折返，不够顺畅');
      suggestions.push('建议调整活动顺序，避免来回折返');
    } else if (backtrackCount === 1) {
      score -= Math.round(backtrackPenalty / 2);
      issues.push('路线存在一次折返');
    }

    // 计算活动间的最大距离跨度
    let maxDistance = 0;
    for (let i = 0; i < locatedItems.length - 1; i++) {
      const from = locatedItems[i].coords;
      const to = locatedItems[i + 1].coords;
      const dist = this.haversineDistance(from.lat, from.lng, to.lat, to.lng);
      maxDistance = Math.max(maxDistance, dist);
    }

    if (maxDistance > maxDistanceHigh) {
      score -= 20;
      issues.push(`活动间最大距离过远 (${Math.round(maxDistance)} 公里)`);
      suggestions.push('建议将距离较远的活动安排在不同天');
    } else if (maxDistance > maxDistanceMedium) {
      score -= 10;
      issues.push(`活动间距离跨度较大 (${Math.round(maxDistance)} 公里)`);
    }

    return {
      dimension: AssessmentDimension.GEOGRAPHY,
      name: '地理分布',
      score: Math.max(0, score),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '地理分布合理' : `发现 ${issues.length} 个路线问题`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 评估缓冲时间
   */
  private assessBuffer(
    items: any[],
    travelByToItem: Map<string, ItemTravelSegment>,
  ): DimensionAssessmentDto {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    if (items.length < 2) {
      return {
        dimension: AssessmentDimension.BUFFER,
        name: '缓冲时间',
        score: 100,
        grade: AssessmentGrade.EXCELLENT,
        passed: true,
        description: '活动较少，缓冲充足',
      };
    }

    let tightScheduleCount = 0;
    let negativeBufferCount = 0;

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (!current.endTime || !next.startTime) continue;

      const end = DateTime.fromJSDate(current.endTime);
      const start = DateTime.fromJSDate(next.startTime);
      const gapMinutes = start.diff(end, 'minutes').minutes;
      const travelMinutes = resolveItemTravelMinutes(next, travelByToItem);
      const bufferMinutes = gapMinutes - travelMinutes;

      if (gapMinutes < 0) {
        negativeBufferCount++;
      } else if (bufferMinutes < 10) {
        tightScheduleCount++;
      }
    }

    if (negativeBufferCount > 0) {
      score -= negativeBufferCount * 15;
      issues.push(`存在 ${negativeBufferCount} 处时间重叠`);
      suggestions.push('建议检查并修正时间冲突');
    }

    if (tightScheduleCount >= 3) {
      score -= 20;
      issues.push(`${tightScheduleCount} 处缓冲时间不足 (<10分钟)`);
      suggestions.push('建议在活动间预留至少 15 分钟缓冲');
    } else if (tightScheduleCount > 0) {
      score -= tightScheduleCount * 5;
      issues.push(`${tightScheduleCount} 处缓冲时间较紧`);
    }

    return {
      dimension: AssessmentDimension.BUFFER,
      name: '缓冲时间',
      score: Math.max(0, score),
      grade: this.scoreToGrade(Math.max(0, score)),
      passed: score >= 60,
      description: issues.length === 0 ? '缓冲时间充足' : `发现 ${issues.length} 个缓冲问题`,
      issues: issues.length > 0 ? issues : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 辅助方法：分数转等级
   */
  private scoreToGrade(score: number): AssessmentGrade {
    if (score >= 90) return AssessmentGrade.EXCELLENT;
    if (score >= 75) return AssessmentGrade.GOOD;
    if (score >= 60) return AssessmentGrade.FAIR;
    if (score >= 40) return AssessmentGrade.POOR;
    return AssessmentGrade.BAD;
  }

  /**
   * 辅助方法：检查时段内是否有用餐
   */
  private hasMealInWindow(items: any[], windowStart: DateTime, windowEnd: DateTime): boolean {
    for (const item of items) {
      if (!item.startTime) continue;

      // 检查是否是用餐类型
      const isMeal = item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING' ||
        item.Place?.category === 'RESTAURANT';

      if (!isMeal) continue;

      const start = DateTime.fromJSDate(item.startTime);
      if (start >= windowStart && start < windowEnd) {
        return true;
      }
    }
    return false;
  }

  /**
   * 辅助方法：计算时段内的可用时间
   */
  private calculateMealWindow(items: any[], windowStart: DateTime, windowEnd: DateTime): number {
    let maxGap = 0;
    let prevEnd = windowStart;

    const sorted = items
      .filter((i: any) => i.startTime)
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    for (const item of sorted) {
      const start = DateTime.fromJSDate(item.startTime);
      const end = item.endTime ? DateTime.fromJSDate(item.endTime) : start.plus({ hours: 1 });

      if (start >= windowEnd) break;
      if (end <= windowStart) continue;

      const gapStart = prevEnd > windowStart ? prevEnd : windowStart;
      const gapEnd = start < windowEnd ? start : windowEnd;

      if (gapEnd > gapStart) {
        const gap = gapEnd.diff(gapStart, 'minutes').minutes;
        maxGap = Math.max(maxGap, gap);
      }

      prevEnd = end > prevEnd ? end : prevEnd;
    }

    // 最后一段空隙
    if (prevEnd < windowEnd) {
      const gap = windowEnd.diff(prevEnd, 'minutes').minutes;
      maxGap = Math.max(maxGap, gap);
    }

    return maxGap;
  }

  /**
   * 辅助方法：获取 Place 坐标
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

}
