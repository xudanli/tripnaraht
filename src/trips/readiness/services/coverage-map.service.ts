// src/trips/readiness/services/coverage-map.service.ts

/**
 * Coverage Map Service
 * 
 * 提供行程覆盖地图数据，用于前端渲染覆盖状态地图
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CoverageMapData,
  PoiCoverage,
  SegmentCoverage,
  CoverageGap,
  CoverageSummary,
  Coordinates,
  MapBounds,
  PoiCoverageStatus,
  SegmentCoverageStatus,
  EvidenceType,
  SegmentHazard,
  ReadinessScoreResponse,
  ReadinessScoreBreakdown,
  ReadinessScoreFinding,
  ReadinessScoreRisk,
  RepairOption,
  RepairOptionsResponse,
  ReadinessGuardianNegotiationSummary,
} from '../types/coverage-map.types';
import { ReadinessService } from './readiness.service';
import {
  buildCoveragePhaseMeta,
  filterSegmentHazardsForTripPhase,
  getTripReadinessPhase,
} from '../utils/trip-readiness-relevance.util';
import { isRoadClassHazard, buildRoadClassRepairOptions, resolveRoadClassFindingForRepair } from '../../trip-constraint-solver/utils/road-class-repair-options.util';
import {
  resolveSegmentDistanceThresholds,
  longDistanceHighMessage,
  longDistanceWarnMessage,
  GLOBAL_SEGMENT_DISTANCE_THRESHOLDS,
} from '../../trip-constraint-solver/utils/segment-distance-threshold.util';
import { normalizeIssueId } from '../../trip-constraint-solver/utils/trip-revision.util';
import { collectTripPlaceNameHints } from '../utils/collect-trip-place-hints.util';
import {
  deriveTodayReadinessStatus,
  filterCoverageMapForDay,
  findingAppliesToDay,
  resolveTripDayNumber,
  riskAppliesToDay,
} from '../utils/today-readiness-filter.util';
import type { TodayReadinessSnapshot } from '../types/today-readiness.types';
import { DateTime } from 'luxon';
import {
  extractGuardianNegotiationSnapshot,
  mapSummaryToRepairOptionsGuardianNegotiation,
  pickGuardianSummaryForBlocker,
} from '../utils/readiness-guardian-negotiation.util';
import { buildDeparturePreparationScore } from '../utils/departure-preparation-score.util';
import { collectDeparturePrepItems } from '../../trip-constraint-solver/utils/departure-prep-projection.util';
import { buildCoverageDisclosureFromCoverageMap } from '../../../travel-cognition';
import {
  buildReadinessCausalPreanalysis,
  buildCausalPreanalysisForTopBlocker,
  buildReadinessCascadeUiHints,
  extractCausalPreAnalysisSnapshot,
} from '../utils/readiness-causal-preanalysis.util';
import { extractTripPhysicalValidationSnapshot } from '../../../domain/ontology/bridge/physical-violation-snapshot.util';
import { ReadinessCausalPreanalysisService } from './readiness-causal-preanalysis.service';
import { ReadinessGuardianNegotiationService } from './readiness-guardian-negotiation.service';
import { TripPrerequisiteService } from '../../prerequisites/services/trip-prerequisite.service';
import { mergePrerequisitePrepItemsIntoReadinessTree } from '../../prerequisites/utils/prerequisite-projection.util';
import { RouteGeometryService } from '../../../transport/services/route-geometry.service';
import { encodePolyline } from '../../../transport/utils/encoded-polyline.util';
import { resolvePlaceCoordinates } from '../../../places/utils/place-coordinates.util';
import {
  ReadinessCheckResult,
  ReadinessFinding,
  ReadinessFindingItem,
  ReadinessTripFindingScope,
} from '../types/readiness-findings.types';

interface PlaceWithCoordinates {
  id: number;
  nameEN: string | null;
  nameCN: string | null;
  category: string;
  metadata: any;
  location?: any;
}

export interface GetCoverageMapOptions {
  /** false 时跳过 identifyGaps / deduplicatedWarnings（journey-map fields=minimal） */
  includeGaps?: boolean;
  /** false 时 segment polyline 使用直线（跳过路线 API） */
  resolveRouteGeometry?: boolean;
}

export interface GetReadinessScoreOptions {
  /** 已计算的 coverage，避免 journey-map / feasibility BFF 重复 getCoverageMap */
  coverageData?: CoverageMapData;
}

@Injectable()
export class CoverageMapService {
  private readonly logger = new Logger(CoverageMapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: ReadinessService,
    @Optional() private readonly causalPreanalysisService?: ReadinessCausalPreanalysisService,
    @Optional() private readonly guardianNegotiationService?: ReadinessGuardianNegotiationService,
    @Optional() private readonly tripPrerequisites?: TripPrerequisiteService,
    @Optional() private readonly routeGeometry?: RouteGeometryService,
  ) {}

  /**
   * 获取行程覆盖地图数据
   */
  async getCoverageMap(
    tripId: string,
    options?: GetCoverageMapOptions,
  ): Promise<CoverageMapData> {
    const includeGaps = options?.includeGaps !== false;
    const resolveRouteGeometry = options?.resolveRouteGeometry !== false;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: { include: { City: true } } },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 收集所有 placeId 用于批量查询坐标
    const placeIds: number[] = [];
    for (const day of trip.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) {
          placeIds.push(item.placeId);
        }
      }
    }

    // 使用原始 SQL 查询 PostGIS location 字段获取坐标
    const placeCoordinatesMap = new Map<number, Coordinates>();
    if (placeIds.length > 0) {
      const placeCoordsResult = await this.prisma.$queryRaw<Array<{
        id: number;
        lat: number;
        lng: number;
      }>>`
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
      `;
      for (const row of placeCoordsResult) {
        placeCoordinatesMap.set(row.id, { lat: row.lat, lng: row.lng });
      }
    }

    const placeNames = collectTripPlaceNameHints(trip.TripDay);
    let readinessResult;
    try {
      readinessResult = await this.readinessService.checkFromDestination(
        trip.destination,
        {
          traveler: {},
          trip: {
            startDate: trip.startDate.toISOString().split('T')[0],
            endDate: trip.endDate.toISOString().split('T')[0],
          },
          itinerary: { countries: [trip.destination] },
        },
        { placeNames },
      );
    } catch (error) {
      this.logger.warn(`获取准备度数据失败: ${(error as Error).message}`);
      readinessResult = { findings: [], summary: {} };
    }

    const pois: PoiCoverage[] = [];
    const coordinates: Coordinates[] = [];
    let poiIndex = 0;
    const tripStartDate = trip.startDate.toISOString().split('T')[0];

    for (let dayIndex = 0; dayIndex < trip.TripDay.length; dayIndex++) {
      const day = trip.TripDay[dayIndex];
      let fallbackOrderInDay = 0;

      for (const item of day.ItineraryItem) {
        if (item.Place) {
          const postgisCoords = item.placeId ? placeCoordinatesMap.get(item.placeId) : undefined;
          const coords = resolvePlaceCoordinates(item.Place, postgisCoords);
          if (coords) {
            coordinates.push(coords);
            poiIndex++;
            fallbackOrderInDay += 1;
            const orderInDay =
              typeof item.order === 'number' && Number.isFinite(item.order)
                ? item.order
                : fallbackOrderInDay;
            const poiCoverage = this.evaluatePoiCoverage(
              `poi-${poiIndex}`,
              item.id,
              dayIndex + 1,
              orderInDay,
              item.Place,
              coords,
              readinessResult,
              tripStartDate,
              item.startTime?.toISOString(),
              item.endTime?.toISOString(),
            );
            pois.push(poiCoverage);
          } else {
            this.logger.debug(
              `coverage POI 链跳过无坐标项: trip=${tripId} day=${dayIndex + 1} item=${item.id} place=${item.placeId ?? 'n/a'}`,
            );
          }
        }
      }
    }

    const isWinter = this.isWinterSeason(tripStartDate);
    const segmentDistanceThresholds = resolveSegmentDistanceThresholds({
      destination: trip.destination,
      metadata: trip.metadata,
    });
    const { segments, deferredHazardCount } = await this.generateSegments(
      pois,
      isWinter,
      trip.startDate,
      segmentDistanceThresholds,
      resolveRouteGeometry,
    );
    const gaps = includeGaps ? this.identifyGaps(pois, segments) : [];
    const bounds = this.calculateBounds(coordinates);
    const center = this.calculateCenter(coordinates);
    const zoom = this.calculateZoom(bounds);
    const summary = this.calculateSummary(pois, segments, gaps);

    const dedupeResult = includeGaps
      ? this.deduplicateAndSortWarnings(gaps, pois, segments)
      : { deduplicatedWarnings: undefined, warningsBySeverity: undefined };
    const { deduplicatedWarnings, warningsBySeverity } = dedupeResult;
    
    // 优化：计算证据状态摘要
    const evidenceStatusSummary = this.calculateEvidenceStatusSummary(pois);
    
    // 优化：获取数据新鲜度
    const dataFreshness = this.getDataFreshness(pois);

    const phaseMeta = buildCoveragePhaseMeta(trip.startDate, {
      endDate: trip.endDate,
      status: trip.status,
    });

    return {
      tripId,
      bounds,
      center,
      zoom,
      pois,
      segments,
      gaps,
      summary,
      deduplicatedWarnings,
      warningsBySeverity,
      evidenceStatusSummary,
      calculatedAt: this.resolveCoverageCalculatedAt(dataFreshness, trip.updatedAt),
      dataFreshness,
      readinessPhase: phaseMeta.readinessPhase,
      daysUntilStart: phaseMeta.daysUntilStart,
      phaseHint: phaseMeta.phaseHint.zh,
      deferredLiveGapCount: deferredHazardCount > 0 ? deferredHazardCount : undefined,
      segmentDistanceThresholds,
    };
  }

  private extractPlaceCoordinates(place: PlaceWithCoordinates): Coordinates | null {
    return resolvePlaceCoordinates(place);
  }

  private evaluatePoiCoverage(
    id: string,
    itemId: string | undefined,
    day: number,
    order: number,
    place: PlaceWithCoordinates,
    coordinates: Coordinates,
    readinessResult: any,
    tripStartDate?: string,
    startTime?: string,
    endTime?: string,
  ): PoiCoverage {
    const name = place.nameCN || place.nameEN || 'Unknown';
    const metadata = this.withReservationMetadata(place);
    const type = this.mapPlaceCategoryWithCanonical(place.category, metadata?.canonicalType);
    const { status, evidenceTypes, missingEvidence, evidenceCount } =
      this.evaluateCoverageFromReadiness(place, readinessResult, tripStartDate, metadata);

    return {
      id, itemId, day, order, name, type, startTime, endTime, coordinates, coverageStatus: status, evidenceCount,
      evidenceTypes: evidenceTypes.length > 0 ? evidenceTypes : undefined,
      missingEvidence: missingEvidence.length > 0 ? missingEvidence : undefined,
      metadata, // 保存 metadata 引用，用于获取证据时间戳和来源
    };
  }

  private evaluateCoverageFromReadiness(
    place: PlaceWithCoordinates,
    readinessResult: any,
    tripStartDate?: string,
    normalizedMetadata?: any,
  ): {
    status: PoiCoverageStatus;
    evidenceTypes: EvidenceType[];
    missingEvidence: EvidenceType[];
    evidenceCount: number;
  } {
    const evidenceTypes: EvidenceType[] = [];
    const missingEvidence: EvidenceType[] = [];
    const category = place.category?.toLowerCase() || '';
    const metadata = normalizedMetadata || this.withReservationMetadata(place);
    const canonicalType = metadata.canonicalType || '';
    const isPlanning = tripStartDate
      ? getTripReadinessPhase(new Date(`${tripStartDate}T12:00:00`)) === 'planning'
      : false;

    // 判断季节
    const isWinter = this.isWinterSeason(tripStartDate);

    // ========== 基于 canonicalType 的精细评估 ==========
    
    // 1. 营业时间评估
    const needsOpeningHours = this.needsOpeningHoursEvidence(canonicalType, category);
    if (this.hasOpeningHoursEvidence(metadata)) {
      evidenceTypes.push('opening_hours');
    } else if (needsOpeningHours) {
      missingEvidence.push('opening_hours');
    }

    // 2. 天气信息评估
    const needsWeather = this.needsWeatherEvidence(canonicalType, category, isWinter);
    if (metadata.weatherInfo || metadata.weather) {
      evidenceTypes.push('weather');
    } else if (needsWeather && !isPlanning) {
      missingEvidence.push('weather');
    }

    // 3. 预订确认评估
    const needsBooking =
      this.needsBookingEvidence(canonicalType, category) ||
      this.requiresReservationEvidence(metadata);
    if (this.hasBookingConfirmationEvidence(metadata)) {
      evidenceTypes.push('booking_confirmation');
    } else if (needsBooking) {
      missingEvidence.push('booking_confirmation');
    }

    // 4. 道路封闭风险评估（已获取 roadStatus 则视为有证据，不再标缺失）
    const hasRoadClosureRisk = readinessResult?.findings?.some((f: any) =>
      f.risks?.some((r: any) => r.type === 'road_closure' || r.type === 'logistics_remote')
    );
    const needsRoadInfo = this.needsRoadClosureEvidence(canonicalType, category, isWinter);
    if (metadata.roadStatus || metadata.roadStatusFetchedAt) {
      evidenceTypes.push('road_closure');
    } else if (!hasRoadClosureRisk && !needsRoadInfo) {
      evidenceTypes.push('road_closure');
    } else if ((needsRoadInfo || hasRoadClosureRisk) && !isPlanning) {
      missingEvidence.push('road_closure');
    }

    // 5. 许可证评估（特定类型需要）
    const needsPermit = this.needsPermitEvidence(canonicalType, category);
    if (metadata.permit || metadata.permitRequired === false) {
      evidenceTypes.push('permit');
    } else if (needsPermit) {
      missingEvidence.push('permit');
    }

    // ========== 计算覆盖状态 ==========
    let status: PoiCoverageStatus;
    const evidenceCount = evidenceTypes.length;
    const criticalMissing = missingEvidence.filter(e => 
      e === 'road_closure' || e === 'weather' || e === 'permit'
    ).length;

    if (missingEvidence.length === 0 && evidenceCount > 0) {
      status = 'covered';
    } else if (criticalMissing > 0) {
      status = evidenceCount > 0 ? 'partial' : 'uncovered';
    } else if (evidenceCount > 0) {
      status = 'partial';
    } else {
      status = 'uncovered';
    }

    return { status, evidenceTypes, missingEvidence, evidenceCount };
  }

  /**
   * 判断是否为冬季
   */
  private isWinterSeason(dateStr?: string): boolean {
    if (!dateStr) return false;
    const month = new Date(dateStr + 'T00:00:00Z').getUTCMonth() + 1;
    return month >= 11 || month <= 3; // 11月到3月为冬季
  }

  /**
   * 判断是否需要营业时间证据
   */
  private needsOpeningHoursEvidence(canonicalType: string, category: string): boolean {
    const typesNeedingHours = [
      'MUSEUM', 'SHOP', 'RESTAURANT', 'CAFE', 'SPA_POOL', 'HOT_SPRING',
      'VISITOR_CENTER', 'GAS_STATION', 'FUEL_STATION', 'SUPERMARKET',
    ];
    if (typesNeedingHours.some(t => canonicalType.includes(t))) return true;
    if (category.includes('attraction') || category.includes('shop') || category.includes('restaurant')) return true;
    return false;
  }

  private hasOpeningHoursEvidence(metadata: any): boolean {
    return Boolean(
      metadata.openingHours ||
      metadata.opening_hours ||
      metadata.openingHours_v1 ||
      metadata.basic?.openingHours ||
      metadata.basic?.openingHoursStructured ||
      metadata.visit_info?.opening_hours ||
      metadata.visit_info?.hours ||
      metadata.visit_info?.fees
    );
  }

  private openingHoursUpdatedAt(metadata: any): string | undefined {
    return (
      metadata.openingHoursFetchedAt ||
      metadata.openingHoursUpdatedAt ||
      metadata.openingHours_v1?.updatedAt ||
      metadata.openingHours?.updatedAt ||
      metadata.opening_hours?.updatedAt
    );
  }

  private openingHoursSource(metadata: any): string | undefined {
    return (
      metadata.openingHoursSource ||
      metadata.openingHours_v1?.source ||
      metadata.openingHours?.source ||
      metadata.opening_hours?.source
    );
  }

  /**
   * 判断是否需要天气证据
   */
  private needsWeatherEvidence(canonicalType: string, category: string, isWinter: boolean): boolean {
    const outdoorTypes = [
      'GLACIER', 'VOLCANO', 'WATERFALL', 'GEYSER', 'HOT_SPRING', 'BEACH',
      'TRAILHEAD', 'NATIONAL_PARK', 'NATURE', 'CAMPING', 'VIEWPOINT',
      'CANYON', 'LAVA_FIELD', 'CRATER', 'HIGHLAND',
    ];
    if (outdoorTypes.some(t => canonicalType.includes(t))) return true;
    if (category.includes('nature') || category.includes('outdoor') || category.includes('trail')) return true;
    // 冬季所有户外活动都需要天气信息
    if (isWinter && (category.includes('attraction') || canonicalType)) return true;
    return false;
  }

  /**
   * 判断是否需要预订证据
   */
  private needsBookingEvidence(canonicalType: string, _category: string): boolean {
    const typesNeedingBooking = [
      'TOUR', 'ACTIVITY', 'GLACIER_WALK', 'ICE_CAVE', 'WHALE_WATCHING',
      'NORTHERN_LIGHTS_TOUR', 'SNOWMOBILE', 'HORSE_RIDING',
    ];
    return typesNeedingBooking.some(t => canonicalType.includes(t));
  }

  private withReservationMetadata(place: PlaceWithCoordinates): any {
    const metadata = { ...(place.metadata || {}) };
    const existingReservation =
      metadata.reservation && typeof metadata.reservation === 'object'
        ? metadata.reservation
        : {};

    const inferredRequiresReservation = this.inferRequiresReservation(place, metadata);
    const requiresReservation =
      metadata.requiresReservation === true ||
      metadata.reservationRequired === true ||
      existingReservation.required === true ||
      inferredRequiresReservation;

    if (!requiresReservation) return metadata;

    metadata.requiresReservation = true;
    metadata.reservation = {
      ...existingReservation,
      required: existingReservation.required ?? true,
      leadTime:
        existingReservation.leadTime ??
        existingReservation.lead_time ??
        metadata.reservationLeadTime ??
        this.inferReservationLeadTime(place, metadata),
    };
    return metadata;
  }

  private inferRequiresReservation(place: PlaceWithCoordinates, metadata: any): boolean {
    const canonicalType = String(metadata.canonicalType || '').toUpperCase();
    if (this.needsBookingEvidence(canonicalType, place.category?.toLowerCase() || '')) {
      return true;
    }

    const haystack = [
      place.nameCN,
      place.nameEN,
      place.category,
      metadata.canonicalType,
      metadata.type,
      metadata.subtype,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const popularReservationTerms = [
      'blue lagoon',
      '蓝湖',
      'sky lagoon',
      'silfra',
      'ice cave',
      '冰洞',
      'glacier hike',
      'glacier walk',
      '冰川徒步',
      'whale watching',
      '观鲸',
      'snowmobile',
      'lava show',
      'myvatn nature baths',
      '米湖天然浴场',
    ];
    return popularReservationTerms.some((term) => haystack.includes(term));
  }

  private inferReservationLeadTime(place: PlaceWithCoordinates, metadata: any): string {
    const haystack = [
      place.nameCN,
      place.nameEN,
      place.category,
      metadata.canonicalType,
      metadata.type,
      metadata.subtype,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      haystack.includes('ice cave') ||
      haystack.includes('冰洞') ||
      haystack.includes('glacier') ||
      haystack.includes('冰川') ||
      haystack.includes('silfra') ||
      haystack.includes('whale watching') ||
      haystack.includes('观鲸')
    ) {
      return 'P7D';
    }
    if (
      haystack.includes('blue lagoon') ||
      haystack.includes('蓝湖') ||
      haystack.includes('sky lagoon') ||
      haystack.includes('myvatn nature baths') ||
      haystack.includes('米湖天然浴场')
    ) {
      return 'P3D';
    }
    return 'P1D';
  }

  private requiresReservationEvidence(metadata: any): boolean {
    const reservation =
      metadata?.reservation && typeof metadata.reservation === 'object'
        ? metadata.reservation
        : {};
    return Boolean(
      metadata?.requiresReservation === true ||
      metadata?.reservationRequired === true ||
      reservation.required === true ||
      reservation.leadTime ||
      reservation.lead_time
    );
  }

  private hasBookingConfirmationEvidence(metadata: any): boolean {
    const reservation =
      metadata?.reservation && typeof metadata.reservation === 'object'
        ? metadata.reservation
        : {};
    const booking =
      metadata?.booking && typeof metadata.booking === 'object'
        ? metadata.booking
        : {};
    return Boolean(
      metadata?.bookingConfirmation ||
      metadata?.bookingConfirmationId ||
      metadata?.booking_reference ||
      booking.confirmationNumber ||
      booking.confirmationId ||
      booking.status === 'confirmed' ||
      reservation.confirmed === true ||
      reservation.confirmationNumber ||
      reservation.confirmationId ||
      reservation.status === 'confirmed'
    );
  }

  /** 需预约的核心 POI（metadata 已 normalize requiresReservation） */
  private poiRequiresReservation(poi: PoiCoverage): boolean {
    return this.requiresReservationEvidence(poi.metadata ?? {});
  }

  /** 核心 POI 缺 booking_confirmation → 上游标 blocker（P1 证据分级） */
  private isCorePoiBookingBlocker(poi: PoiCoverage): boolean {
    return (
      this.poiRequiresReservation(poi) &&
      Boolean(poi.missingEvidence?.includes('booking_confirmation'))
    );
  }

  /** 仅缺天气证据 → 临行前可补，不升格 must_handle */
  private isWeatherOnlyMissingEvidence(poi: PoiCoverage): boolean {
    const missing = poi.missingEvidence ?? [];
    return missing.length > 0 && missing.every((e) => e === 'weather');
  }

  private resolvePoiGapSeverity(poi: PoiCoverage): 'high' | 'medium' | 'low' {
    if (this.isCorePoiBookingBlocker(poi)) return 'high';
    if (poi.coverageStatus === 'uncovered' && !this.isWeatherOnlyMissingEvidence(poi)) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * 判断是否需要道路封闭证据
   */
  private needsRoadClosureEvidence(canonicalType: string, _category: string, isWinter: boolean): boolean {
    const remoteTypes = [
      'HIGHLAND', 'F_ROAD', 'GLACIER', 'TRAILHEAD', 'CAMPING',
      'REMOTE', 'MOUNTAIN_PASS',
    ];
    if (remoteTypes.some(t => canonicalType.includes(t))) return true;
    // 冬季偏远地区都需要道路信息
    if (isWinter && canonicalType.includes('NATIONAL_PARK')) return true;
    return false;
  }

  /**
   * 判断是否需要许可证证据
   */
  private needsPermitEvidence(canonicalType: string, _category: string): boolean {
    const typesNeedingPermit = [
      'HIGHLAND', 'RESTRICTED_AREA', 'DRONE_ZONE', 'PROTECTED_AREA',
    ];
    return typesNeedingPermit.some(t => canonicalType.includes(t));
  }

  private resolveCoverageCalculatedAt(
    dataFreshness: {
      weather?: string;
      roadClosure?: string;
      openingHours?: string;
      inventory?: string;
    },
    tripUpdatedAt: Date,
  ): string {
    const candidates = [
      dataFreshness?.weather,
      dataFreshness?.roadClosure,
      dataFreshness?.openingHours,
      dataFreshness?.inventory,
      tripUpdatedAt.toISOString(),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
    return candidates.sort().reverse()[0]!;
  }

  private normalizeJourneyMapPoiType(raw: string): string {
    const POI_TYPE_MAP: Record<string, string> = {
      city: 'city',
      attraction: 'attraction',
      hotel: 'hotel',
      restaurant: 'restaurant',
      transport: 'transport',
      nature: 'attraction',
      accommodation: 'hotel',
      lodging: 'hotel',
      food: 'restaurant',
      culture: 'attraction',
      viewpoint: 'attraction',
      beach: 'attraction',
      hot_spring: 'attraction',
      camping: 'hotel',
      shopping: 'other',
      service: 'other',
    };
    const key = raw.trim().toLowerCase();
    return POI_TYPE_MAP[key] ?? 'other';
  }

  private mapPlaceCategoryWithCanonical(category: string, canonicalType?: string): string {
    let raw = 'attraction';

    // 优先使用 canonicalType 映射
    if (canonicalType) {
      const ct = canonicalType.toUpperCase();
      if (ct.includes('CITY') || ct.includes('TOWN') || ct.includes('VILLAGE')) raw = 'city';
      else if (ct.includes('HOTEL') || ct.includes('ACCOMMODATION') || ct.includes('HOSTEL') || ct.includes('GUESTHOUSE')) raw = 'accommodation';
      else if (ct.includes('RESTAURANT') || ct.includes('CAFE') || ct.includes('FOOD')) raw = 'restaurant';
      else if (ct.includes('GLACIER') || ct.includes('VOLCANO') || ct.includes('WATERFALL') || ct.includes('GEYSER')) raw = 'nature';
      else if (ct.includes('HOT_SPRING') || ct.includes('SPA') || ct.includes('POOL')) raw = 'hot_spring';
      else if (ct.includes('NATIONAL_PARK') || ct.includes('NATURE') || ct.includes('TRAILHEAD')) raw = 'nature';
      else if (ct.includes('MUSEUM') || ct.includes('CULTURE') || ct.includes('CHURCH')) raw = 'culture';
      else if (ct.includes('SHOP') || ct.includes('SUPERMARKET')) raw = 'shopping';
      else if (ct.includes('FUEL') || ct.includes('GAS_STATION')) raw = 'service';
      else if (ct.includes('VIEWPOINT') || ct.includes('SCENIC')) raw = 'viewpoint';
      else if (ct.includes('BEACH') || ct.includes('COASTAL')) raw = 'beach';
      else if (ct.includes('CAMPING')) raw = 'camping';
    } else {
      const categoryLower = (category || '').toLowerCase();
      if (categoryLower.includes('city') || categoryLower.includes('town')) raw = 'city';
      else if (categoryLower.includes('hotel') || categoryLower.includes('accommodation')) raw = 'accommodation';
      else if (categoryLower.includes('restaurant') || categoryLower.includes('food')) raw = 'restaurant';
      else if (categoryLower.includes('nature') || categoryLower.includes('outdoor')) raw = 'nature';
      else if (categoryLower.includes('museum') || categoryLower.includes('culture')) raw = 'culture';
      else if (categoryLower.includes('shop') || categoryLower.includes('shopping')) raw = 'shopping';
    }

    return this.normalizeJourneyMapPoiType(raw);
  }

  private async generateSegments(
    pois: PoiCoverage[],
    isWinter: boolean,
    tripStartDate: Date,
    segmentDistanceThresholds: ReturnType<typeof resolveSegmentDistanceThresholds>,
    resolveRouteGeometry: boolean,
  ): Promise<{ segments: SegmentCoverage[]; deferredHazardCount: number }> {
    const segments: SegmentCoverage[] = [];
    let deferredHazardCount = 0;

    const adjacentPairs = this.groupAdjacentPoiPairsByDay(pois);
    if (adjacentPairs.length === 0) return { segments, deferredHazardCount };

    const segmentJobs = adjacentPairs.map(([fromPoi, toPoi], sequenceIndex) =>
      this.buildSegmentCoverage({
        fromPoi,
        toPoi,
        sequenceIndex,
        isWinter,
        tripStartDate,
        segmentDistanceThresholds,
        resolveRouteGeometry,
      }).then(({ segment, deferredDelta }) => {
        deferredHazardCount += deferredDelta;
        return segment;
      }),
    );

    const built = await Promise.all(segmentJobs);
    segments.push(...built);
    return { segments, deferredHazardCount };
  }

  /** Same-day consecutive POI pairs in itinerary order (coverage map route lines). */
  private groupAdjacentPoiPairsByDay(pois: PoiCoverage[]): Array<[PoiCoverage, PoiCoverage]> {
    const poisByDay = new Map<number, PoiCoverage[]>();
    for (const poi of pois) {
      const list = poisByDay.get(poi.day) ?? [];
      list.push(poi);
      poisByDay.set(poi.day, list);
    }

    const pairs: Array<[PoiCoverage, PoiCoverage]> = [];
    for (const day of [...poisByDay.keys()].sort((a, b) => a - b)) {
      const dayPois = poisByDay.get(day)!.slice().sort((a, b) => a.order - b.order);
      for (let i = 0; i < dayPois.length - 1; i++) {
        pairs.push([dayPois[i]!, dayPois[i + 1]!]);
      }
    }
    return pairs;
  }

  private async buildSegmentCoverage(input: {
    fromPoi: PoiCoverage;
    toPoi: PoiCoverage;
    sequenceIndex: number;
    isWinter: boolean;
    tripStartDate: Date;
    segmentDistanceThresholds: ReturnType<typeof resolveSegmentDistanceThresholds>;
    resolveRouteGeometry: boolean;
  }): Promise<{ segment: SegmentCoverage; deferredDelta: number }> {
    const { fromPoi, toPoi, sequenceIndex, isWinter, tripStartDate, segmentDistanceThresholds, resolveRouteGeometry } =
      input;

    const straightDistance = this.calculateDistance(fromPoi.coordinates, toPoi.coordinates);
    let distance = straightDistance;
    let duration = Math.round((straightDistance / (isWinter ? 50 : 60)) * 60);

    const evaluated = this.evaluateSegmentRisk(
      fromPoi,
      toPoi,
      straightDistance,
      isWinter,
      segmentDistanceThresholds,
    );
    const beforeCount = evaluated.hazards.length;
    const hazards = filterSegmentHazardsForTripPhase(evaluated.hazards, tripStartDate);
    const deferredDelta = beforeCount - hazards.length;
    const status = this.deriveSegmentCoverageStatus(hazards);

    let polyline = encodePolyline([fromPoi.coordinates, toPoi.coordinates]);
    let geometrySource: SegmentCoverage['geometrySource'] = 'straight_line';

    const cachedPolyline = this.readCachedRoutePolyline(fromPoi.metadata, toPoi.metadata);
    if (resolveRouteGeometry && this.routeGeometry) {
      const geometry = await this.routeGeometry.resolveGeometry({
        from: fromPoi.coordinates,
        to: toPoi.coordinates,
        travelMode: 'DRIVING',
        cachedPolyline,
        useRouteApi: true,
      });
      polyline = geometry.polyline;
      geometrySource = geometry.geometrySource;
      if (geometry.distanceMeters != null && geometry.distanceMeters > 0) {
        distance = Math.round(geometry.distanceMeters / 1000);
      }
      if (geometry.durationMinutes != null && geometry.durationMinutes > 0) {
        duration = geometry.durationMinutes;
      }
    } else if (cachedPolyline) {
      polyline = cachedPolyline;
      geometrySource = 'cached_metadata';
    }

    const segment: SegmentCoverage = {
      id: `seg-${sequenceIndex + 1}`,
      fromPoiId: fromPoi.id,
      toPoiId: toPoi.id,
      day: fromPoi.day,
      sequenceIndex,
      distance: Math.round(distance),
      duration,
      routeType: 'driving',
      coverageStatus: status,
      polyline,
      geometrySource,
      hazards,
    };

    return { segment, deferredDelta };
  }

  private readCachedRoutePolyline(fromMetadata?: unknown, toMetadata?: unknown): string | undefined {
    for (const metadata of [toMetadata, fromMetadata]) {
      if (!metadata || typeof metadata !== 'object') continue;
      const raw = metadata as Record<string, unknown>;
      const candidate =
        raw.route_encoded_polyline ??
        raw.routeEncodedPolyline ??
        (raw.routing as { encodedPolyline?: string } | undefined)?.encodedPolyline;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private deriveSegmentCoverageStatus(hazards: SegmentHazard[]): SegmentCoverageStatus {
    if (!hazards.length) return 'covered';
    return 'warning';
  }

  private evaluateSegmentRisk(
    fromPoi: PoiCoverage,
    toPoi: PoiCoverage,
    distance: number,
    isWinter: boolean = false,
    thresholds: ReturnType<typeof resolveSegmentDistanceThresholds>,
  ): { status: SegmentCoverageStatus; hazards: SegmentHazard[] } {
    const hazards: SegmentHazard[] = [];
    let status: SegmentCoverageStatus = 'covered';

    // 长距离风险（阈值来自用户硬约束 / 国家默认 / 全局默认）
    if (distance > thresholds.maxSegmentDistanceKm) {
      hazards.push({
        type: 'long_distance',
        severity: 'high',
        message: longDistanceHighMessage(thresholds.maxSegmentDistanceKm),
      });
      status = 'warning';
    } else if (distance > thresholds.warnSegmentDistanceKm) {
      hazards.push({
        type: 'long_distance',
        severity: 'medium',
        message: longDistanceWarnMessage(thresholds.warnSegmentDistanceKm),
      });
      status = 'warning';
    }

    // 端点覆盖风险
    if (fromPoi.coverageStatus === 'uncovered' || toPoi.coverageStatus === 'uncovered') {
      hazards.push({ type: 'endpoint_uncovered', severity: 'medium', message: '端点缺少证据覆盖，请确认路线可行性' });
      status = 'warning';
    }

    // 道路封闭风险
    if (fromPoi.missingEvidence?.includes('road_closure') || toPoi.missingEvidence?.includes('road_closure')) {
      hazards.push({ type: 'road_closure', severity: 'high', message: '可能存在道路封闭风险，请出发前查询路况' });
      status = 'warning';
    }

    // 冬季特殊风险
    if (isWinter) {
      // 冬季长距离风险更高
      if (distance > thresholds.winterWarnSegmentDistanceKm && !hazards.some(h => h.type === 'long_distance')) {
        hazards.push({ type: 'winter_driving', severity: 'medium', message: '冬季行驶，日照时间短，建议早出发' });
        status = 'warning';
      }
      
      // 检查是否经过自然景点（可能有冬季道路风险）
      const natureTypes = ['nature', 'viewpoint', 'camping', 'hot_spring'];
      if (natureTypes.includes(fromPoi.type) || natureTypes.includes(toPoi.type)) {
        if (!hazards.some(h => h.type === 'road_closure')) {
          hazards.push({ type: 'winter_road_condition', severity: 'medium', message: '冬季前往自然景点，请注意道路状况' });
          status = 'warning';
        }
      }
    }

    // 跨天风险（如果起点和终点不在同一天）
    if (fromPoi.day !== toPoi.day) {
      hazards.push({ type: 'cross_day', severity: 'low', message: '跨天行程，请合理安排出发时间' });
    }

    return { status, hazards };
  }

  private identifyGaps(pois: PoiCoverage[], segments: SegmentCoverage[]): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    let gapIndex = 0;

    // 1. POI 级别的缺口
    for (const poi of pois) {
      if (poi.coverageStatus === 'uncovered' || poi.coverageStatus === 'partial') {
        gapIndex++;
        const evidenceStatus = this.getEvidenceStatus(poi);
        gaps.push({
          id: `gap-${gapIndex}`, 
          type: 'poi', 
          relatedId: poi.id, 
          coordinates: poi.coordinates,
          severity: this.resolvePoiGapSeverity(poi),
          message: `第${poi.day}天 · ${poi.name}：缺少证据覆盖`,
          missingEvidence: poi.missingEvidence,
          evidenceStatus,
          affectedDays: [poi.day],
          affectedPois: [poi.id],
        });
      }
    }

    // 2. 路段级别的缺口
    for (const segment of segments) {
      if (segment.coverageStatus === 'warning' || segment.coverageStatus === 'blocked') {
        gapIndex++;
        const fromPoi = pois.find(p => p.id === segment.fromPoiId);
        const toPoi = pois.find(p => p.id === segment.toPoiId);
        if (fromPoi && toPoi) {
          const midpoint: Coordinates = {
            lat: (fromPoi.coordinates.lat + toPoi.coordinates.lat) / 2,
            lng: (fromPoi.coordinates.lng + toPoi.coordinates.lng) / 2,
          };
          
          // 为每个危险类型创建一个 gap（用于后续去重）
          for (const hazard of segment.hazards) {
            const distanceKm = Math.round(segment.distance);
            const contextualMessage = `第${segment.day}天 · ${fromPoi.name} → ${toPoi.name}（约 ${distanceKm} km）· ${hazard.message}`;
            gaps.push({
              id: `gap-${gapIndex}-${hazard.type}`, 
              type: 'segment', 
              relatedId: segment.id, 
              coordinates: midpoint,
              severity: segment.coverageStatus === 'blocked' ? 'high' : hazard.severity,
              message: contextualMessage,
              hazards: [hazard.type],
              hazardType: hazard.type, // 用于去重
              affectedDays: [segment.day],
              affectedPois: [segment.fromPoiId, segment.toPoiId],
            });
          }
        }
      }
    }
    return gaps;
  }

  /**
   * 获取 POI 的证据状态
   */
  private getEvidenceStatus(poi: PoiCoverage): Array<{
    type: EvidenceType;
    status: 'fetched' | 'missing' | 'fetching' | 'failed';
    lastUpdated?: string;
    source?: string;
  }> {
    const status: Array<{
      type: EvidenceType;
      status: 'fetched' | 'missing' | 'fetching' | 'failed';
      lastUpdated?: string;
      source?: string;
    }> = [];

    const metadata = poi.metadata || {};
    const evidenceTypes: EvidenceType[] = ['weather', 'road_closure', 'opening_hours', 'booking_confirmation', 'permit'];
    
    for (const type of evidenceTypes) {
      let evidenceStatus: 'fetched' | 'missing' | 'fetching' | 'failed' = 'missing';
      let lastUpdated: string | undefined;
      let source: string | undefined;
      
      // 检查是否已获取
      if (poi.evidenceTypes?.includes(type)) {
        evidenceStatus = 'fetched';
        
        // 从 metadata 中获取时间戳和来源
        if (type === 'weather') {
          lastUpdated = metadata.weatherFetchedAt || metadata.weatherInfo?.lastUpdated || metadata.weather?.lastUpdated;
          source = metadata.weatherInfo?.source || metadata.weather?.source;
        } else if (type === 'road_closure') {
          lastUpdated = metadata.roadStatusFetchedAt || metadata.roadStatus?.lastUpdated;
          source = metadata.roadStatus?.source;
        } else if (type === 'opening_hours') {
          lastUpdated = this.openingHoursUpdatedAt(metadata);
          source = this.openingHoursSource(metadata);
        } else if (type === 'booking_confirmation') {
          lastUpdated =
            metadata.bookingConfirmationUpdatedAt ||
            metadata.bookingConfirmation?.updatedAt ||
            metadata.booking?.updatedAt ||
            metadata.reservation?.updatedAt;
          source =
            metadata.bookingConfirmationSource ||
            metadata.bookingConfirmation?.source ||
            metadata.booking?.source ||
            metadata.reservation?.source;
        }
      } else if (poi.missingEvidence?.includes(type)) {
        evidenceStatus = 'missing';
      } else {
        continue;
      }
      
      status.push({
        type,
        status: evidenceStatus,
        lastUpdated,
        source,
      });
    }

    return status;
  }

  private calculateDistance(from: Coordinates, to: Coordinates): number {
    const R = 6371;
    const dLat = this.toRad(to.lat - from.lat);
    const dLng = this.toRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private calculateBounds(coordinates: Coordinates[]): MapBounds {
    if (coordinates.length === 0) {
      return { northeast: { lat: 66.5, lng: -13.5 }, southwest: { lat: 63.4, lng: -24.5 } };
    }
    const lats = coordinates.map(c => c.lat);
    const lngs = coordinates.map(c => c.lng);
    return { northeast: { lat: Math.max(...lats), lng: Math.max(...lngs) }, southwest: { lat: Math.min(...lats), lng: Math.min(...lngs) } };
  }

  private calculateCenter(coordinates: Coordinates[]): Coordinates {
    if (coordinates.length === 0) return { lat: 64.9631, lng: -19.0208 };
    const sumLat = coordinates.reduce((sum, c) => sum + c.lat, 0);
    const sumLng = coordinates.reduce((sum, c) => sum + c.lng, 0);
    return { lat: sumLat / coordinates.length, lng: sumLng / coordinates.length };
  }

  private calculateZoom(bounds: MapBounds): number {
    const latDiff = bounds.northeast.lat - bounds.southwest.lat;
    const lngDiff = bounds.northeast.lng - bounds.southwest.lng;
    const maxDiff = Math.max(latDiff, lngDiff);
    if (maxDiff > 10) return 5;
    if (maxDiff > 5) return 6;
    if (maxDiff > 2) return 7;
    if (maxDiff > 1) return 8;
    if (maxDiff > 0.5) return 9;
    return 10;
  }

  private calculateSummary(pois: PoiCoverage[], segments: SegmentCoverage[], gaps: CoverageGap[]): CoverageSummary {
    const coveredPois = pois.filter(p => p.coverageStatus === 'covered').length;
    const partialPois = pois.filter(p => p.coverageStatus === 'partial').length;
    const uncoveredPois = pois.filter(p => p.coverageStatus === 'uncovered').length;
    const coveredSegments = segments.filter(s => s.coverageStatus === 'covered').length;
    const warningSegments = segments.filter(s => s.coverageStatus === 'warning').length;
    const blockedSegments = segments.filter(s => s.coverageStatus === 'blocked').length;

    const totalItems = pois.length + segments.length;
    const coveredScore = coveredPois + partialPois * 0.5 + coveredSegments + warningSegments * 0.5;
    const coverageRate = totalItems > 0 ? coveredScore / totalItems : 0;

    return {
      totalPois: pois.length, coveredPois, partialPois, uncoveredPois,
      totalSegments: segments.length, coveredSegments, warningSegments, blockedSegments,
      totalGaps: gaps.length, coverageRate: Math.round(coverageRate * 100) / 100,
    };
  }

  private encodePolyline(coordinates: Coordinates[]): string {
    let encoded = '';
    let prevLat = 0;
    let prevLng = 0;

    for (const coord of coordinates) {
      const lat = Math.round(coord.lat * 1e5);
      const lng = Math.round(coord.lng * 1e5);
      encoded += this.encodeSignedNumber(lat - prevLat);
      encoded += this.encodeSignedNumber(lng - prevLng);
      prevLat = lat;
      prevLng = lng;
    }
    return encoded;
  }

  private encodeSignedNumber(num: number): string {
    let sgn_num = num << 1;
    if (num < 0) sgn_num = ~sgn_num;
    return this.encodeNumber(sgn_num);
  }

  private encodeNumber(num: number): string {
    let encoded = '';
    while (num >= 0x20) {
      encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
      num >>= 5;
    }
    encoded += String.fromCharCode(num + 63);
    return encoded;
  }

  // ==================== 准备度分数计算 ====================

  /**
   * 获取行程准备度分数
   */
  async getReadinessScore(
    tripId: string,
    options?: GetReadinessScoreOptions,
  ): Promise<ReadinessScoreResponse> {
    // 获取行程基本信息
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: { include: { City: true } } },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取覆盖地图数据（复用已有逻辑或 BFF 预计算结果）
    const coverageData =
      options?.coverageData ?? (await this.getCoverageMap(tripId));

    // 获取准备度检查结果
    const placeNames = collectTripPlaceNameHints(trip.TripDay);
    let readinessResult: any;
    try {
      readinessResult = await this.readinessService.checkFromDestination(
        trip.destination,
        {
          traveler: {},
          trip: {
            startDate: trip.startDate.toISOString().split('T')[0],
            endDate: trip.endDate.toISOString().split('T')[0],
          },
          itinerary: { countries: [trip.destination] },
        },
        { placeNames },
      );
    } catch (error) {
      this.logger.warn(`获取准备度数据失败: ${(error as Error).message}`);
      readinessResult = { findings: [], summary: {} };
    }

    // 计算各维度分数
    const score = this.calculateScoreBreakdown(trip, coverageData, readinessResult);
    const phaseMeta = buildCoveragePhaseMeta(trip.startDate, {
      endDate: trip.endDate,
      status: trip.status,
    });

    // 提取发现项（PR-1：仅 Pack 出发准备域）
    let findings = this.extractDeparturePrepFindings(readinessResult as ReadinessCheckResult);

    // 过滤用户已标记为「不适用」的项
    const notApplicableMarks = await this.prisma.tripFindingMark.findMany({
      where: { tripId, markType: 'not_applicable' },
      select: { findingId: true },
    });
    if (notApplicableMarks.length > 0) {
      const excludedIds = new Set(notApplicableMarks.map((m) => m.findingId));
      findings = findings.filter((f) => !excludedIds.has(f.id));
    }

    // PR-1：POI Access / 方案缺口不再注入 readiness score（见 feasibility-report）

    // 提取风险项（Pack 目的地风险 only）
    const risks = this.extractPackRisks(readinessResult);

    // 生成摘要
    const blockers = findings.filter(f => f.type === 'blocker').length;
    // 🆕 统一字段命名：支持新命名（must/should）和旧命名（warning/suggestion）的兼容
    const must = findings.filter(f => f.type === 'must' || f.type === 'warning').length;
    const should = findings.filter(f => f.type === 'should' || f.type === 'suggestion').length;
    
    const summary = {
      totalFindings: findings.length,
      blockers,
      must,  // 🆕 统一字段命名
      should,  // 🆕 统一字段命名
      // 向后兼容：保留旧字段
      warnings: must,
      suggestions: should,
      highRisks: risks.filter(r => r.severity === 'high').length,
      mediumRisks: risks.filter(r => r.severity === 'medium').length,
      lowRisks: risks.filter(r => r.severity === 'low').length,
    };

    const guardianNegotiation = extractGuardianNegotiationSnapshot(trip.metadata);
    const persistedCausal = extractCausalPreAnalysisSnapshot(trip.metadata);

    const itineraryItems = trip.TripDay.flatMap((day) =>
      (day.ItineraryItem ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        metadata: (item.Place?.metadata as Record<string, unknown> | undefined) ?? undefined,
        dayDate: day.date?.toISOString().slice(0, 10),
        placeName: item.Place?.nameCN || item.Place?.nameEN || undefined,
        placeId: item.placeId ?? undefined,
      })),
    );

    const physicalSnapshot = extractTripPhysicalValidationSnapshot(trip.metadata);

    const freshCausal =
      blockers > 0 || (physicalSnapshot?.violations?.length ?? 0) > 0
        ? buildCausalPreanalysisForTopBlocker({
            tripId,
            findings,
            itineraryItems,
            physicalViolations: physicalSnapshot?.violations,
            physicalContext: physicalSnapshot?.context,
          })
        : null;
    const causalPreAnalysis =
      freshCausal ?? persistedCausal?.latest ?? undefined;

    if (freshCausal && this.causalPreanalysisService) {
      const topBlocker =
        findings.find((f) => f.type === 'blocker' && f.severity === 'high') ??
        findings.find((f) => f.type === 'blocker');
      void this.causalPreanalysisService.persistResult(
        tripId,
        freshCausal,
        topBlocker?.id,
      );
    }

    return {
      tripId,
      score,
      findings,
      risks,
      summary,
      calculatedAt: new Date().toISOString(),
      readinessPhase: phaseMeta.readinessPhase,
      daysUntilStart: phaseMeta.daysUntilStart,
      phaseHint: phaseMeta.phaseHint.zh,
      guardianNegotiation,
      coverageDisclosure: buildCoverageDisclosureFromCoverageMap(coverageData),
      causalPreAnalysis,
    };
  }

  /**
   * 行中「今日就绪」— 仅评估指定 day 的 POI / 路段 / 缺口，不含整趟行前 Pack 项。
   */
  async getTodayReadinessScore(
    tripId: string,
    dayNumber?: number,
  ): Promise<TodayReadinessSnapshot> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const phase = getTripReadinessPhase(trip.startDate, {
      endDate: trip.endDate,
      status: trip.status,
    });
    if (phase !== 'in_trip') {
      throw new NotFoundException('今日就绪仅在行中阶段（TRAVELING 或行程日期窗口内）可用');
    }

    const day = dayNumber ?? resolveTripDayNumber(trip.startDate, trip.endDate);
    const date =
      DateTime.fromJSDate(trip.startDate)
        .plus({ days: day - 1 })
        .toISODate() ?? trip.startDate.toISOString().slice(0, 10);

    const coverageFull = await this.getCoverageMap(tripId);
    const dayCoverage = filterCoverageMapForDay(coverageFull, day);

    const allFindings = this.extractTodayScopedFindings(dayCoverage);
    const findings = allFindings.filter((f) => findingAppliesToDay(f, day));
    const risks = this.extractTodayScopedRisks(dayCoverage).filter((r) =>
      riskAppliesToDay(r, dayCoverage),
    );

    const blockers = findings.filter((f) => f.type === 'blocker').length;
    const must = findings.filter((f) => f.type === 'must' || f.type === 'warning').length;
    const should = findings.filter((f) => f.type === 'should' || f.type === 'suggestion').length;
    const todayOverall = this.computeTodayExecutionScore(findings);
    const status = deriveTodayReadinessStatus(blockers, must, todayOverall);

    const severityRank = { high: 0, medium: 1, low: 2 };
    const topFindings = [...findings]
      .sort((a, b) => {
        const typeRank = (t: string) => (t === 'blocker' ? 0 : t === 'must' || t === 'warning' ? 1 : 2);
        const tr = typeRank(a.type) - typeRank(b.type);
        if (tr !== 0) return tr;
        return severityRank[a.severity] - severityRank[b.severity];
      })
      .slice(0, 5)
      .map(({ id, type, category, message, actionRequired, severity }) => ({
        id,
        type,
        category,
        message,
        actionRequired,
        severity,
      }));

    return {
      dayNumber: day,
      date,
      status,
      score: todayOverall,
      summary: { blockers, must, should },
      dimensions: {
        entryTransit: todayOverall,
        healthInsurance: todayOverall,
        gearPacking: todayOverall,
        bookingsCredentials: todayOverall,
        logisticsComms: todayOverall,
        emergency: todayOverall,
      },
      topFindings,
      readinessPhase: 'in_trip',
      calculatedAt: new Date().toISOString(),
      scopeNote: {
        zh: `仅含第 ${day} 天（${date}）活动与路段；整趟行前清单请查看准备度页。`,
        en: `Scoped to day ${day} (${date}) activities and segments; see Readiness for the full pre-departure checklist.`,
      },
    };
  }

  /**
   * 将覆盖地图中 **high severity** 缺口转为与 `/score` extractFindings 一致的阻塞项，合并进树形
   * `findings[].blockers`，避免仅靠扁平 `/score` 才能看到「应阻塞」项。
   *
   * 缺口项 id 使用 `coverage-gap:${gap.id}`，与 {@link extractFindings} 中对应条目一致。
   */
  async mergeHighSeverityCoverageGapBlockersIntoTripReadiness(
    _tripId: string,
    _destinationId: string,
    result: ReadinessCheckResult,
  ): Promise<ReadinessCheckResult> {
    // PR-1：覆盖缺口阻塞项已迁至 feasibility-report，不再合并进 Pack 树形 readiness
    return result;
  }

  /**
   * P2：从 TripPrerequisite SSOT 投影出发准备项，替代 POI Access bridge 双写。
   */
  async mergePoiAccessFindingsIntoTripReadiness(
    tripId: string,
    destinationId: string,
    result: ReadinessCheckResult,
  ): Promise<ReadinessCheckResult> {
    if (!this.tripPrerequisites) return result;

    let prepItems: Awaited<ReturnType<TripPrerequisiteService['projectDeparturePrepItems']>>;
    try {
      prepItems = await this.tripPrerequisites.projectDeparturePrepItems(tripId);
    } catch (e) {
      this.logger.warn(
        `mergePoiAccessFindingsIntoTripReadiness: prerequisite projection failed: ${(e as Error).message}`,
      );
      return result;
    }

    if (prepItems.length === 0) return result;

    return mergePrerequisitePrepItemsIntoReadinessTree({
      destinationId,
      result,
      prepItems,
    });
  }

  /**
   * 覆盖缺口 → ReadinessFindingItem（仅 high severity，与 score 扁平列表中 type=blocker 的缺口一致）
   */
  private highSeverityGapsToBlockerItems(coverageData: CoverageMapData): ReadinessFindingItem[] {
    const items: ReadinessFindingItem[] = [];
    for (const gap of coverageData.gaps) {
      if (gap.severity !== 'high') {
        continue;
      }
      items.push(this.coverageGapToBlockerItem(gap, coverageData));
    }
    return items;
  }

  /**
   * 将覆盖缺口解析为行程定位（用于 API tripScope / 前端跳转）
   */
  private gapToTripScope(
    gap: CoverageGap,
    coverageData: CoverageMapData,
  ): ReadinessTripFindingScope | undefined {
    const pois = coverageData.pois;
    if (gap.type === 'segment') {
      const fromId = gap.affectedPois?.[0];
      const toId = gap.affectedPois?.[1];
      const fromPoi = fromId ? pois.find((p) => p.id === fromId) : undefined;
      const toPoi = toId ? pois.find((p) => p.id === toId) : undefined;
      const segment = coverageData.segments.find((s) => s.id === gap.relatedId);
      if (fromPoi && toPoi) {
        return {
          kind: 'segment',
          day: gap.affectedDays?.[0] ?? segment?.day,
          segmentId: gap.relatedId,
          fromPoi: { id: fromPoi.id, name: fromPoi.name },
          toPoi: { id: toPoi.id, name: toPoi.name },
          distanceKm: segment?.distance,
        };
      }
    }
    if (gap.type === 'poi') {
      const poi = pois.find((p) => p.id === gap.relatedId);
      if (poi) {
        return {
          kind: 'poi',
          day: gap.affectedDays?.[0] ?? poi.day,
          fromPoi: { id: poi.id, name: poi.name },
        };
      }
    }
    return undefined;
  }

  private coverageGapToBlockerItem(gap: CoverageGap, coverageData: CoverageMapData): ReadinessFindingItem {
    const category = gap.type === 'poi' ? 'activities_bookings' : 'logistics';
    const tripScope = this.gapToTripScope(gap, coverageData);
    return {
      id: `coverage-gap:${gap.id}`,
      category,
      severity: 'high',
      level: 'blocker',
      message: gap.message,
      tasks: gap.missingEvidence?.length
        ? [{ title: `补充证据: ${gap.missingEvidence.join(', ')}` }]
        : undefined,
      evidence: [
        {
          sourceId: 'coverage-map',
          sectionId: gap.type === 'segment' ? gap.relatedId : undefined,
          quote: gap.message,
        },
      ],
      tripScope,
    };
  }

  /**
   * 出发准备完成度（Pack only — 不含方案 schedule/transport/buffers）
   */
  private calculateScoreBreakdown(
    _trip: unknown,
    _coverageData: CoverageMapData,
    readinessResult: ReadinessCheckResult | null | undefined,
  ): ReadinessScoreBreakdown {
    return buildDeparturePreparationScore(readinessResult ?? undefined);
  }

  /**
   * Pack 出发准备 findings → score API 形态
   */
  private extractDeparturePrepFindings(
    readinessResult: ReadinessCheckResult,
  ): ReadinessScoreFinding[] {
    return collectDeparturePrepItems(readinessResult).map((item) => ({
      id: item.id,
      type:
        item.level === 'blocker'
          ? 'blocker'
          : item.level === 'must'
            ? 'must'
            : 'should',
      category: item.category,
      message: item.message,
      severity:
        item.severity === 'high'
          ? 'high'
          : item.severity === 'medium'
            ? 'medium'
            : 'low',
      actionRequired: item.tasks
        ?.map((t) =>
          typeof t.title === 'string' ? t.title : (t.title as { zh?: string }).zh ?? '',
        )
        .filter(Boolean)
        .join('；'),
    }));
  }

  /**
   * Pack 风险（不含路段/覆盖缺口 — 已迁至 feasibility）
   */
  private extractPackRisks(readinessResult: unknown): ReadinessScoreRisk[] {
    const risks: ReadinessScoreRisk[] = [];
    let riskIndex = 0;
    for (const finding of (readinessResult as ReadinessCheckResult)?.findings || []) {
      for (const risk of finding.risks || []) {
        if (!risk.summary && !(risk as { message?: string }).message) continue;
        riskIndex++;
        risks.push({
          id: `pack-risk-${riskIndex}`,
          type: String(risk.type || 'unknown'),
          severity: risk.severity || 'medium',
          message: risk.summary || (risk as { message?: string }).message || `${risk.type} 风险`,
          mitigation: risk.mitigations || [],
        });
      }
    }
    return risks;
  }

  /**
   * 行中今日 — 当日 coverage 缺口/路段（方案可执行性 scoped，不进全局 /score）
   */
  private extractTodayScopedFindings(coverageData: CoverageMapData): ReadinessScoreFinding[] {
    const findings: ReadinessScoreFinding[] = [];
    for (const gap of coverageData.gaps) {
      const findingType = gap.severity === 'high' ? 'blocker' : 'must';
      const category =
        gap.type === 'poi'
          ? gap.missingEvidence?.includes('booking_confirmation')
            ? 'booking'
            : 'evidence'
          : 'transport';
      findings.push({
        id: `coverage-gap:${gap.id}`,
        type: findingType,
        category,
        message: gap.message,
        severity: gap.severity,
        affectedDays: gap.affectedDays?.length
          ? gap.affectedDays
          : gap.type === 'poi'
            ? [coverageData.pois.find((p) => p.id === gap.relatedId)?.day || 1]
            : undefined,
        tripScope: this.gapToTripScope(gap, coverageData),
      });
    }
    for (const segment of coverageData.segments) {
      const fromPoi = coverageData.pois.find((p) => p.id === segment.fromPoiId);
      const toPoi = coverageData.pois.find((p) => p.id === segment.toPoiId);
      if (!fromPoi || !toPoi) continue;
      for (const hazard of segment.hazards) {
        findings.push({
          id: `transport-${segment.id}-${hazard.type}`,
          type: hazard.severity === 'high' ? 'blocker' : hazard.severity === 'medium' ? 'must' : 'should',
          category: 'transport',
          message: `第${segment.day}天 · ${fromPoi.name} → ${toPoi.name} · ${hazard.message}`,
          severity: hazard.severity,
          affectedDays: [segment.day],
          tripScope: {
            kind: 'segment',
            day: segment.day,
            segmentId: segment.id,
            fromPoi: { id: fromPoi.id, name: fromPoi.name },
            toPoi: { id: toPoi.id, name: toPoi.name },
            distanceKm: segment.distance,
          },
        });
      }
    }
    return findings;
  }

  private extractTodayScopedRisks(coverageData: CoverageMapData): ReadinessScoreRisk[] {
    const risks: ReadinessScoreRisk[] = [];
    let riskIndex = 0;
    for (const segment of coverageData.segments) {
      for (const hazard of segment.hazards) {
        riskIndex++;
        risks.push({
          id: `today-risk-${riskIndex}`,
          type: hazard.type,
          severity: hazard.severity,
          message: hazard.message,
          affectedPois: [segment.fromPoiId, segment.toPoiId],
        });
      }
    }
    for (const gap of coverageData.gaps) {
      if (gap.severity !== 'high') continue;
      riskIndex++;
      risks.push({
        id: `today-risk-${riskIndex}`,
        type: gap.type === 'poi' ? 'evidence_gap' : 'transport_gap',
        severity: gap.severity,
        message: gap.message,
        affectedPois: gap.relatedId ? [gap.relatedId] : undefined,
      });
    }
    return risks;
  }

  private computeTodayExecutionScore(findings: ReadinessScoreFinding[]): number {
    let score = 100;
    for (const f of findings) {
      if (f.type === 'blocker') score -= 25;
      else if (f.type === 'must' || f.type === 'warning') score -= 10;
      else score -= 3;
    }
    return Math.max(0, Math.min(100, score));
  }

  // ==================== 修复选项接口 ====================

  /**
   * P4 — 为 feasibility repair-options 补全级联 / Guardian（readiness score 不再返回 cascadeUiHints）
   */
  async enrichRepairOptionsForFeasibility(
    tripId: string,
    blockerId: string,
    response: RepairOptionsResponse,
  ): Promise<RepairOptionsResponse> {
    if (response.cascadeUiHints?.length && response.guardianNegotiation) {
      return response;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!trip) return response;

    const scoreData = await this.getReadinessScore(tripId);
    const coverageData = await this.getCoverageMap(tripId);
    const blocker =
      scoreData.findings.find((f) => f.id === blockerId) ??
      resolveRoadClassFindingForRepair(blockerId, scoreData.findings, coverageData) ?? {
        id: blockerId,
        type: 'blocker' as const,
        category: 'access_capacity',
        message: response.blockerMessage ?? '',
        severity: 'high' as const,
      };

    const itineraryItems = trip.TripDay.flatMap((day) =>
      (day.ItineraryItem ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        metadata: (item.Place?.metadata as Record<string, unknown> | undefined) ?? undefined,
        dayDate: day.date?.toISOString().slice(0, 10),
        placeName: item.Place?.nameCN || item.Place?.nameEN || undefined,
        placeId: item.placeId ?? undefined,
      })),
    );

    const physicalSnapshot = extractTripPhysicalValidationSnapshot(trip.metadata);
    const causalPreAnalysis =
      response.causalPreAnalysis ??
      buildReadinessCausalPreanalysis({
        tripId,
        blocker,
        itineraryItems,
        physicalViolations: physicalSnapshot?.violations,
        physicalContext: physicalSnapshot?.context,
      });

    if (causalPreAnalysis && this.causalPreanalysisService && !response.causalPreAnalysis) {
      await this.causalPreanalysisService.persistResult(tripId, causalPreAnalysis, blockerId);
    }

    const guardianSummary =
      response.guardianNegotiation != null
        ? undefined
        : await this.resolveGuardianSummaryForRepairOptions(
            tripId,
            blockerId,
            trip.metadata,
            response.options,
          );

    return {
      ...response,
      dependencyImpact: response.dependencyImpact ?? causalPreAnalysis ?? undefined,
      causalPreAnalysis: response.causalPreAnalysis ?? causalPreAnalysis ?? undefined,
      cascadeUiHints:
        response.cascadeUiHints ??
        buildReadinessCascadeUiHints(causalPreAnalysis ?? undefined),
      guardianNegotiation:
        response.guardianNegotiation ??
        (guardianSummary
          ? mapSummaryToRepairOptionsGuardianNegotiation(guardianSummary)
          : undefined),
    };
  }

  /**
   * 获取阻塞项的修复选项
   */
  async getRepairOptions(tripId: string, blockerId: string): Promise<RepairOptionsResponse> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 获取准备度分数以找到对应的阻塞项
    const scoreData = await this.getReadinessScore(tripId);
    const coverageData = await this.getCoverageMap(tripId);
    const blocker =
      scoreData.findings.find((f) => f.id === blockerId) ??
      resolveRoadClassFindingForRepair(blockerId, scoreData.findings, coverageData);
    
    // 根据阻塞项类型生成修复选项
    const options = this.generateRepairOptions(blocker);

    const itineraryItems = trip.TripDay.flatMap((day) =>
      (day.ItineraryItem ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note,
        metadata: (item.Place?.metadata as Record<string, unknown> | undefined) ?? undefined,
        dayDate: day.date?.toISOString().slice(0, 10),
        placeName: item.Place?.nameCN || item.Place?.nameEN || undefined,
        placeId: item.placeId ?? undefined,
      })),
    );

    const physicalSnapshot = extractTripPhysicalValidationSnapshot(trip.metadata);

    const causalPreAnalysis = buildReadinessCausalPreanalysis({
      tripId,
      blocker,
      itineraryItems,
      physicalViolations: physicalSnapshot?.violations,
      physicalContext: physicalSnapshot?.context,
    });

    if (causalPreAnalysis && this.causalPreanalysisService) {
      await this.causalPreanalysisService.persistResult(tripId, causalPreAnalysis, blockerId);
    }

    const guardianSummary = await this.resolveGuardianSummaryForRepairOptions(
      tripId,
      blockerId,
      trip.metadata,
      options,
    );

    return {
      blockerId,
      blockerMessage: blocker?.message,
      options,
      dependencyImpact: causalPreAnalysis ?? undefined,
      causalPreAnalysis: causalPreAnalysis ?? undefined,
      cascadeUiHints: buildReadinessCascadeUiHints(causalPreAnalysis),
      guardianNegotiation: guardianSummary
        ? mapSummaryToRepairOptionsGuardianNegotiation(guardianSummary)
        : undefined,
    };
  }

  private async resolveGuardianSummaryForRepairOptions(
    tripId: string,
    blockerId: string,
    metadata: unknown,
    options: RepairOption[],
  ): Promise<ReadinessGuardianNegotiationSummary | undefined> {
    const persisted = extractGuardianNegotiationSnapshot(metadata);
    const cached = pickGuardianSummaryForBlocker(persisted, blockerId);
    if (cached) return cached;

    if (!this.guardianNegotiationService?.isEnabled()) {
      return undefined;
    }

    const primaryAction =
      options.find((option) => option.impact === 'high')?.actionType ?? options[0]?.actionType;

    try {
      return await this.guardianNegotiationService.negotiateForTrip(tripId, 'pre_repair', {
        blockerId,
        repairActionType: primaryAction,
      });
    } catch (error) {
      this.logger.warn(
        `repair-options 三人格预协商失败 trip=${tripId} blocker=${blockerId}: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  /**
   * 根据阻塞项生成修复选项
   */
  private generateRepairOptions(blocker: ReadinessScoreFinding | undefined): RepairOption[] {
    const options: RepairOption[] = [];
    let optionIndex = 0;

    if (!blocker) {
      // 如果找不到阻塞项，返回通用选项
      optionIndex++;
      options.push({
        id: `option-${optionIndex}`,
        title: '刷新准备度检查',
        description: '重新运行准备度检查以获取最新状态',
        impact: 'low',
        timeEstimate: '1分钟',
        actionType: 'refresh',
      });
      return options;
    }

    // 根据阻塞项类别生成选项
    switch (blocker.category) {
      case 'evidence':
        options.push(...this.generateEvidenceRepairOptions(blocker, optionIndex));
        break;
      case 'schedule':
        options.push(...this.generateScheduleRepairOptions(blocker, optionIndex));
        break;
      case 'transport':
        options.push(...this.generateTransportRepairOptions(blocker, optionIndex));
        break;
      case 'accommodation':
        options.push(...this.generateAccommodationRepairOptions(blocker, optionIndex));
        break;
      case 'safety':
        options.push(...this.generateSafetyRepairOptions(blocker, optionIndex));
        break;
      default:
        options.push(...this.generateDefaultRepairOptions(blocker, optionIndex));
    }

    return options;
  }

  /**
   * 生成证据缺失的修复选项
   */
  private generateEvidenceRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    const options: RepairOption[] = [];
    let idx = startIndex;

    // 解析缺失的证据类型
    const missingTypes = blocker.actionRequired?.replace('补充: ', '').split(', ') || [];

    if (missingTypes.includes('weather')) {
      idx++;
      options.push({
        id: `option-${idx}`,
        title: '查询天气预报',
        description: '获取该地点的天气信息，了解天气状况',
        impact: 'medium',
        timeEstimate: '2分钟',
        actionType: 'fetch_weather',
      });
    }

    if (missingTypes.includes('road_closure')) {
      idx++;
      options.push({
        id: `option-${idx}`,
        title: '查询道路状况',
        description: '检查前往该地点的道路是否开放',
        impact: 'high',
        timeEstimate: '5分钟',
        actionType: 'check_road',
      });
    }

    if (missingTypes.includes('opening_hours')) {
      idx++;
      options.push({
        id: `option-${idx}`,
        title: '确认营业时间',
        description: '查询该景点/地点的开放时间',
        impact: 'medium',
        timeEstimate: '3分钟',
        actionType: 'check_hours',
      });
    }

    // 通用选项
    idx++;
    options.push({
      id: `option-${idx}`,
      title: '手动标记已确认',
      description: '如果您已自行确认相关信息，可以手动标记',
      impact: 'low',
      timeEstimate: '1分钟',
      actionType: 'manual_confirm',
    });

    return options;
  }

  /**
   * 生成时间安排的修复选项
   */
  private generateScheduleRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    const options: RepairOption[] = [];
    let idx = startIndex;

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '调整行程顺序',
      description: '重新安排当天的景点顺序以优化时间',
      impact: 'medium',
      timeEstimate: '10分钟',
      actionType: 'reorder_pois',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '移动到其他天',
      description: '将部分景点移到行程较轻松的一天',
      impact: 'medium',
      timeEstimate: '5分钟',
      actionType: 'move_to_day',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '减少景点数量',
      description: '删除部分非必要景点以留出更多时间',
      impact: 'high',
      timeEstimate: '5分钟',
      actionType: 'remove_pois',
    });

    return options;
  }

  /**
   * 生成交通相关的修复选项
   */
  private generateTransportRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    if (blocker.issueKind === 'road_class') {
      return buildRoadClassRepairOptions('', {
        id: normalizeIssueId(blocker.id),
        priority: 'suggest_adjust',
        category: 'transport',
        title: blocker.message.split('·').pop()?.trim() ?? blocker.message,
        message: blocker.message,
        affectedDays: blocker.affectedDays ?? [],
        severity: blocker.severity,
        issueKind: 'road_class',
        fromItemId: blocker.fromItemId,
        toItemId: blocker.toItemId,
        anchors: blocker.anchors as Record<string, unknown> | undefined,
        uiHints: blocker.uiHints as Record<string, unknown> | undefined,
      }).options;
    }

    const options: RepairOption[] = [];
    let idx = startIndex;

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '预订交通',
      description: '提前预订租车或其他交通方式',
      cost: 100,
      impact: 'high',
      timeEstimate: '15分钟',
      actionType: 'book_transport',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '查看替代路线',
      description: '寻找其他可行的交通路线',
      impact: 'medium',
      timeEstimate: '10分钟',
      actionType: 'find_alternative_route',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '联系当地向导',
      description: '寻找当地向导或拼车服务',
      cost: 50,
      impact: 'medium',
      timeEstimate: '20分钟',
      actionType: 'contact_guide',
    });

    return options;
  }

  /**
   * 生成住宿相关的修复选项
   */
  private generateAccommodationRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    const options: RepairOption[] = [];
    let idx = startIndex;

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '更换酒店',
      description: '预订另一家有空房的酒店',
      cost: 200,
      impact: 'high',
      timeEstimate: '30分钟',
      actionType: 'change_hotel',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '联系酒店确认',
      description: '直接联系酒店确认预订状态',
      impact: 'medium',
      timeEstimate: '15分钟',
      actionType: 'confirm_booking',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '查看附近住宿',
      description: '搜索附近其他住宿选项',
      impact: 'medium',
      timeEstimate: '20分钟',
      actionType: 'search_nearby',
    });

    return options;
  }

  /**
   * 生成安全相关的修复选项
   */
  private generateSafetyRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    const options: RepairOption[] = [];
    let idx = startIndex;

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '查看安全提示',
      description: '了解该地区的安全注意事项',
      impact: 'medium',
      timeEstimate: '5分钟',
      actionType: 'view_safety_tips',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '购买旅行保险',
      description: '为行程购买适当的旅行保险',
      cost: 100,
      impact: 'high',
      timeEstimate: '15分钟',
      actionType: 'buy_insurance',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '更换目的地',
      description: '考虑选择更安全的替代目的地',
      impact: 'high',
      timeEstimate: '30分钟',
      actionType: 'change_destination',
    });

    return options;
  }

  /**
   * 生成默认修复选项
   */
  private generateDefaultRepairOptions(blocker: ReadinessScoreFinding, startIndex: number): RepairOption[] {
    const options: RepairOption[] = [];
    let idx = startIndex;

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '查看详情',
      description: '了解更多关于此问题的信息',
      impact: 'low',
      timeEstimate: '2分钟',
      actionType: 'view_details',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '手动标记已解决',
      description: '如果问题已解决，可以手动标记',
      impact: 'low',
      timeEstimate: '1分钟',
      actionType: 'mark_resolved',
    });

    idx++;
    options.push({
      id: `option-${idx}`,
      title: '忽略此问题',
      description: '暂时忽略此问题，稍后处理',
      impact: 'low',
      timeEstimate: '1分钟',
      actionType: 'ignore',
    });

    return options;
  }

  /**
   * 去重和排序警告
   */
  private deduplicateAndSortWarnings(
    gaps: CoverageGap[],
    _pois: PoiCoverage[],
    _segments: SegmentCoverage[]
  ): {
    deduplicatedWarnings: CoverageGap[];
    warningsBySeverity: {
      high: CoverageGap[];
      medium: CoverageGap[];
      low: CoverageGap[];
    };
  } {
    // 按类型和消息去重
    const warningMap = new Map<string, CoverageGap>();
    
    for (const gap of gaps) {
      // 生成唯一键：类型 + 危险类型 + 消息
      const key = `${gap.type}-${gap.hazardType || 'general'}-${gap.message}`;
      
      if (!warningMap.has(key)) {
        warningMap.set(key, { ...gap });
      } else {
        // 合并受影响的天数和 POI
        const existing = warningMap.get(key)!;
        const affectedDays = new Set([...(existing.affectedDays || []), ...(gap.affectedDays || [])]);
        const affectedPois = new Set([...(existing.affectedPois || []), ...(gap.affectedPois || [])]);
        
        // 如果新警告的严重程度更高，更新严重程度
        if (this.compareSeverity(gap.severity, existing.severity) > 0) {
          existing.severity = gap.severity;
        }
        
        existing.affectedDays = Array.from(affectedDays).sort((a, b) => a - b);
        existing.affectedPois = Array.from(affectedPois);
      }
    }
    
    const deduplicatedWarnings = Array.from(warningMap.values());
    
    // 按严重程度排序：high > medium > low
    deduplicatedWarnings.sort((a, b) => {
      const severityCompare = this.compareSeverity(b.severity, a.severity);
      if (severityCompare !== 0) return severityCompare;
      // 如果严重程度相同，按受影响天数排序
      return (a.affectedDays?.length || 0) - (b.affectedDays?.length || 0);
    });
    
    // 按严重程度分组
    const warningsBySeverity = {
      high: deduplicatedWarnings.filter(w => w.severity === 'high'),
      medium: deduplicatedWarnings.filter(w => w.severity === 'medium'),
      low: deduplicatedWarnings.filter(w => w.severity === 'low'),
    };
    
    return { deduplicatedWarnings, warningsBySeverity };
  }

  /**
   * 比较严重程度
   * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
   */
  private compareSeverity(a: 'high' | 'medium' | 'low', b: 'high' | 'medium' | 'low'): number {
    const severityMap = { high: 3, medium: 2, low: 1 };
    return severityMap[a] - severityMap[b];
  }

  /**
   * 计算证据状态摘要
   */
  private calculateEvidenceStatusSummary(pois: PoiCoverage[]): {
    total: number;
    fetched: number;
    missing: number;
    fetching: number;
    failed: number;
  } {
    let total = 0;
    let fetched = 0;
    let missing = 0;
    let fetching = 0;
    let failed = 0;
    
    for (const poi of pois) {
      const statuses = this.getEvidenceStatus(poi);
      for (const status of statuses) {
        total++;
        if (status.status === 'fetched') fetched++;
        else if (status.status === 'missing') missing++;
        else if (status.status === 'fetching') fetching++;
        else if (status.status === 'failed') failed++;
      }
    }
    
    return { total, fetched, missing, fetching, failed };
  }

  /**
   * 获取数据新鲜度
   */
  private getDataFreshness(pois: PoiCoverage[]): {
    weather?: string;
    roadClosure?: string;
    openingHours?: string;
    inventory?: string;
  } {
    const freshness: {
      weather?: string;
      roadClosure?: string;
      openingHours?: string;
      inventory?: string;
    } = {};
    
    const weatherDates: string[] = [];
    const roadClosureDates: string[] = [];
    const openingHoursDates: string[] = [];
    const inventoryDates: string[] = [];
    
    for (const poi of pois) {
      const statuses = this.getEvidenceStatus(poi);
      const poiType = poi.type?.toUpperCase() ?? '';
      const isAccommodation =
        poiType.includes('HOTEL') ||
        poiType.includes('ACCOMMODATION') ||
        poiType.includes('HOSTEL') ||
        poiType.includes('GUESTHOUSE');
      for (const status of statuses) {
        if (status.type === 'weather' && status.status === 'fetched' && status.lastUpdated) {
          weatherDates.push(status.lastUpdated);
        } else if (status.type === 'road_closure' && status.status === 'fetched' && status.lastUpdated) {
          roadClosureDates.push(status.lastUpdated);
        } else if (status.type === 'opening_hours' && status.status === 'fetched' && status.lastUpdated) {
          openingHoursDates.push(status.lastUpdated);
        } else if (
          status.type === 'booking_confirmation' &&
          status.status === 'fetched' &&
          status.lastUpdated &&
          isAccommodation
        ) {
          inventoryDates.push(status.lastUpdated);
        }
      }
    }
    
    // 获取最新的时间戳
    if (weatherDates.length > 0) {
      freshness.weather = weatherDates.sort().reverse()[0];
    }
    if (roadClosureDates.length > 0) {
      freshness.roadClosure = roadClosureDates.sort().reverse()[0];
    }
    if (openingHoursDates.length > 0) {
      freshness.openingHours = openingHoursDates.sort().reverse()[0];
    }
    if (inventoryDates.length > 0) {
      freshness.inventory = inventoryDates.sort().reverse()[0];
    }
    
    return freshness;
  }
}
