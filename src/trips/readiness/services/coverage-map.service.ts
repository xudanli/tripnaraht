// src/trips/readiness/services/coverage-map.service.ts

/**
 * Coverage Map Service
 * 
 * 提供行程覆盖地图数据，用于前端渲染覆盖状态地图
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from '../types/coverage-map.types';
import { ReadinessService } from './readiness.service';

interface PlaceWithCoordinates {
  id: number;
  nameEN: string | null;
  nameCN: string | null;
  category: string;
  metadata: any;
  location?: any;
}

interface TripDayWithItems {
  id: string;
  date: Date;
  tripId: string;
  ItineraryItem: Array<{
    id: string;
    type: string;
    placeId: number | null;
    startTime: Date | null;
    endTime: Date | null;
    Place: PlaceWithCoordinates | null;
  }>;
}

@Injectable()
export class CoverageMapService {
  private readonly logger = new Logger(CoverageMapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: ReadinessService,
  ) {}

  /**
   * 获取行程覆盖地图数据
   */
  async getCoverageMap(tripId: string): Promise<CoverageMapData> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
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
      let orderInDay = 0;

      for (const item of day.ItineraryItem) {
        if (item.Place) {
          // 优先使用 PostGIS 坐标，其次使用 metadata 中的坐标
          let coords = item.placeId ? placeCoordinatesMap.get(item.placeId) : null;
          if (!coords) {
            coords = this.extractPlaceCoordinates(item.Place);
          }
          if (coords) {
            coordinates.push(coords);
            poiIndex++;
            const poiCoverage = this.evaluatePoiCoverage(
              `poi-${poiIndex}`,
              dayIndex + 1,
              ++orderInDay,
              item.Place,
              coords,
              readinessResult,
              tripStartDate,
            );
            pois.push(poiCoverage);
          }
        }
      }
    }

    const isWinter = this.isWinterSeason(tripStartDate);
    const segments = this.generateSegments(pois, isWinter);
    const gaps = this.identifyGaps(pois, segments);
    const bounds = this.calculateBounds(coordinates);
    const center = this.calculateCenter(coordinates);
    const zoom = this.calculateZoom(bounds);
    const summary = this.calculateSummary(pois, segments, gaps);

    // 优化：去重和排序警告
    const { deduplicatedWarnings, warningsBySeverity } = this.deduplicateAndSortWarnings(gaps, pois, segments);
    
    // 优化：计算证据状态摘要
    const evidenceStatusSummary = this.calculateEvidenceStatusSummary(pois);
    
    // 优化：获取数据新鲜度
    const dataFreshness = this.getDataFreshness(pois);

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
      calculatedAt: new Date().toISOString(),
      dataFreshness,
    };
  }

  private extractPlaceCoordinates(place: PlaceWithCoordinates): Coordinates | null {
    const metadata = place.metadata || {};
    if (metadata.lat && metadata.lng) {
      return { lat: metadata.lat, lng: metadata.lng };
    }
    if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
      return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
    }
    const location = place.location;
    if (location) {
      if (typeof location === 'string') {
        const match = location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
          return { lat, lng };
        }
      }
      if (typeof location === 'object') {
        if (location.coordinates && Array.isArray(location.coordinates)) {
          return { lng: location.coordinates[0], lat: location.coordinates[1] };
        }
        if (location.lat && location.lng) {
          return { lat: location.lat, lng: location.lng };
        }
      }
    }
    return null;
  }

  private evaluatePoiCoverage(
    id: string,
    day: number,
    order: number,
    place: PlaceWithCoordinates,
    coordinates: Coordinates,
    readinessResult: any,
    tripStartDate?: string,
  ): PoiCoverage {
    const name = place.nameCN || place.nameEN || 'Unknown';
    const type = this.mapPlaceCategoryWithCanonical(place.category, place.metadata?.canonicalType);
    const { status, evidenceTypes, missingEvidence, evidenceCount } =
      this.evaluateCoverageFromReadiness(place, readinessResult, tripStartDate);

    return {
      id, day, order, name, type, coordinates, coverageStatus: status, evidenceCount,
      evidenceTypes: evidenceTypes.length > 0 ? evidenceTypes : undefined,
      missingEvidence: missingEvidence.length > 0 ? missingEvidence : undefined,
      metadata: place.metadata, // 保存 metadata 引用，用于获取证据时间戳和来源
    };
  }

  private evaluateCoverageFromReadiness(
    place: PlaceWithCoordinates,
    readinessResult: any,
    tripStartDate?: string,
  ): {
    status: PoiCoverageStatus;
    evidenceTypes: EvidenceType[];
    missingEvidence: EvidenceType[];
    evidenceCount: number;
  } {
    const evidenceTypes: EvidenceType[] = [];
    const missingEvidence: EvidenceType[] = [];
    const category = place.category?.toLowerCase() || '';
    const metadata = place.metadata || {};
    const canonicalType = metadata.canonicalType || '';

    // 判断季节
    const isWinter = this.isWinterSeason(tripStartDate);

    // ========== 基于 canonicalType 的精细评估 ==========
    
    // 1. 营业时间评估
    const needsOpeningHours = this.needsOpeningHoursEvidence(canonicalType, category);
    if (metadata.openingHours || metadata.opening_hours || metadata.visit_info?.fees) {
      evidenceTypes.push('opening_hours');
    } else if (needsOpeningHours) {
      missingEvidence.push('opening_hours');
    }

    // 2. 天气信息评估
    const needsWeather = this.needsWeatherEvidence(canonicalType, category, isWinter);
    if (metadata.weatherInfo || metadata.weather) {
      evidenceTypes.push('weather');
    } else if (needsWeather) {
      missingEvidence.push('weather');
    }

    // 3. 预订确认评估
    const needsBooking = this.needsBookingEvidence(canonicalType, category);
    if (metadata.bookingConfirmation || metadata.reservation || metadata.activities?.some((a: any) => a.cost_usd)) {
      evidenceTypes.push('booking_confirmation');
    } else if (needsBooking) {
      // 仅标记为可选，不作为缺失
    }

    // 4. 道路封闭风险评估
    const hasRoadClosureRisk = readinessResult?.findings?.some((f: any) =>
      f.risks?.some((r: any) => r.type === 'road_closure' || r.type === 'logistics_remote')
    );
    const needsRoadInfo = this.needsRoadClosureEvidence(canonicalType, category, isWinter);
    if (!hasRoadClosureRisk && !needsRoadInfo) {
      evidenceTypes.push('road_closure');
    } else if (needsRoadInfo || hasRoadClosureRisk) {
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
  private needsBookingEvidence(canonicalType: string, category: string): boolean {
    const typesNeedingBooking = [
      'TOUR', 'ACTIVITY', 'GLACIER_WALK', 'ICE_CAVE', 'WHALE_WATCHING',
      'NORTHERN_LIGHTS_TOUR', 'SNOWMOBILE', 'HORSE_RIDING',
    ];
    return typesNeedingBooking.some(t => canonicalType.includes(t));
  }

  /**
   * 判断是否需要道路封闭证据
   */
  private needsRoadClosureEvidence(canonicalType: string, category: string, isWinter: boolean): boolean {
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
  private needsPermitEvidence(canonicalType: string, category: string): boolean {
    const typesNeedingPermit = [
      'HIGHLAND', 'RESTRICTED_AREA', 'DRONE_ZONE', 'PROTECTED_AREA',
    ];
    return typesNeedingPermit.some(t => canonicalType.includes(t));
  }

  private mapPlaceCategoryWithCanonical(category: string, canonicalType?: string): string {
    // 优先使用 canonicalType 映射
    if (canonicalType) {
      const ct = canonicalType.toUpperCase();
      if (ct.includes('CITY') || ct.includes('TOWN') || ct.includes('VILLAGE')) return 'city';
      if (ct.includes('HOTEL') || ct.includes('ACCOMMODATION') || ct.includes('HOSTEL') || ct.includes('GUESTHOUSE')) return 'accommodation';
      if (ct.includes('RESTAURANT') || ct.includes('CAFE') || ct.includes('FOOD')) return 'restaurant';
      if (ct.includes('GLACIER') || ct.includes('VOLCANO') || ct.includes('WATERFALL') || ct.includes('GEYSER')) return 'nature';
      if (ct.includes('HOT_SPRING') || ct.includes('SPA') || ct.includes('POOL')) return 'hot_spring';
      if (ct.includes('NATIONAL_PARK') || ct.includes('NATURE') || ct.includes('TRAILHEAD')) return 'nature';
      if (ct.includes('MUSEUM') || ct.includes('CULTURE') || ct.includes('CHURCH')) return 'culture';
      if (ct.includes('SHOP') || ct.includes('SUPERMARKET')) return 'shopping';
      if (ct.includes('FUEL') || ct.includes('GAS_STATION')) return 'service';
      if (ct.includes('VIEWPOINT') || ct.includes('SCENIC')) return 'viewpoint';
      if (ct.includes('BEACH') || ct.includes('COASTAL')) return 'beach';
      if (ct.includes('CAMPING')) return 'camping';
    }

    // 降级到 category 映射
    const categoryLower = (category || '').toLowerCase();
    if (categoryLower.includes('city') || categoryLower.includes('town')) return 'city';
    if (categoryLower.includes('hotel') || categoryLower.includes('accommodation')) return 'accommodation';
    if (categoryLower.includes('restaurant') || categoryLower.includes('food')) return 'restaurant';
    if (categoryLower.includes('nature') || categoryLower.includes('outdoor')) return 'nature';
    if (categoryLower.includes('museum') || categoryLower.includes('culture')) return 'culture';
    if (categoryLower.includes('shop') || categoryLower.includes('shopping')) return 'shopping';
    return 'attraction';
  }

  private generateSegments(pois: PoiCoverage[], isWinter: boolean = false): SegmentCoverage[] {
    const segments: SegmentCoverage[] = [];
    if (pois.length < 2) return segments;

    for (let i = 0; i < pois.length - 1; i++) {
      const fromPoi = pois[i];
      const toPoi = pois[i + 1];
      const distance = this.calculateDistance(fromPoi.coordinates, toPoi.coordinates);
      // 估算行驶时间：冬季速度较慢
      const avgSpeed = isWinter ? 50 : 60; // km/h
      const duration = Math.round((distance / avgSpeed) * 60);
      const { status, hazards } = this.evaluateSegmentRisk(fromPoi, toPoi, distance, isWinter);
      const polyline = this.encodePolyline([fromPoi.coordinates, toPoi.coordinates]);

      segments.push({
        id: `seg-${i + 1}`, fromPoiId: fromPoi.id, toPoiId: toPoi.id, day: fromPoi.day,
        distance: Math.round(distance), duration, routeType: 'driving',
        coverageStatus: status, polyline, hazards,
      });
    }
    return segments;
  }

  private evaluateSegmentRisk(
    fromPoi: PoiCoverage,
    toPoi: PoiCoverage,
    distance: number,
    isWinter: boolean = false,
  ): { status: SegmentCoverageStatus; hazards: SegmentHazard[] } {
    const hazards: SegmentHazard[] = [];
    let status: SegmentCoverageStatus = 'covered';

    // 长距离风险
    if (distance > 300) {
      hazards.push({ type: 'long_distance', severity: 'high', message: '超长距离行驶(>300km)，强烈建议分段或中途住宿' });
      status = 'warning';
    } else if (distance > 200) {
      hazards.push({ type: 'long_distance', severity: 'medium', message: '长距离行驶(>200km)，建议中途休息' });
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
      if (distance > 150 && !hazards.some(h => h.type === 'long_distance')) {
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
          severity: poi.coverageStatus === 'uncovered' ? 'high' : 'medium',
          message: `${poi.name}缺少证据覆盖`, 
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
            gaps.push({
              id: `gap-${gapIndex}-${hazard.type}`, 
              type: 'segment', 
              relatedId: segment.id, 
              coordinates: midpoint,
              severity: segment.coverageStatus === 'blocked' ? 'high' : hazard.severity,
              message: hazard.message,
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
          lastUpdated = metadata.openingHoursFetchedAt;
        }
      } else if (poi.missingEvidence?.includes(type)) {
        evidenceStatus = 'missing';
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
  async getReadinessScore(tripId: string): Promise<ReadinessScoreResponse> {
    // 获取行程基本信息
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: true },
              orderBy: { startTime: 'asc' },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取覆盖地图数据（复用已有逻辑）
    const coverageData = await this.getCoverageMap(tripId);

    // 获取准备度检查结果
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
      );
    } catch (error) {
      this.logger.warn(`获取准备度数据失败: ${(error as Error).message}`);
      readinessResult = { findings: [], summary: {} };
    }

    // 计算各维度分数
    const score = this.calculateScoreBreakdown(trip, coverageData, readinessResult);

    // 提取发现项
    const findings = this.extractFindings(trip, coverageData, readinessResult);

    // 提取风险项
    const risks = this.extractRisks(coverageData, readinessResult);

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

    return {
      tripId,
      score,
      findings,
      risks,
      summary,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * 计算分数详情
   */
  private calculateScoreBreakdown(
    trip: any,
    coverageData: CoverageMapData,
    readinessResult: any,
  ): ReadinessScoreBreakdown {
    // 1. 证据覆盖率 (0-100)
    const evidenceCoverage = this.calculateEvidenceCoverageScore(coverageData);

    // 2. 时间可行性 (0-100)
    const scheduleFeasibility = this.calculateScheduleFeasibilityScore(trip, coverageData);

    // 3. 交通确定性 (0-100)
    const transportCertainty = this.calculateTransportCertaintyScore(trip, coverageData);

    // 4. 安全风险分数 (0-100, 越高越安全)
    const safetyRisk = this.calculateSafetyRiskScore(coverageData, readinessResult);

    // 5. 缓冲时间分数 (0-100)
    const buffers = this.calculateBuffersScore(trip, coverageData);

    // 总体分数（加权平均）
    const overall = Math.round(
      evidenceCoverage * 0.25 +
      scheduleFeasibility * 0.25 +
      transportCertainty * 0.20 +
      safetyRisk * 0.15 +
      buffers * 0.15
    );

    return {
      overall,
      evidenceCoverage,
      scheduleFeasibility,
      transportCertainty,
      safetyRisk,
      buffers,
    };
  }

  /**
   * 计算证据覆盖率分数
   */
  private calculateEvidenceCoverageScore(coverageData: CoverageMapData): number {
    const { pois, summary } = coverageData;
    if (pois.length === 0) return 100; // 无 POI 视为完全覆盖

    // 基于覆盖率计算
    const baseScore = summary.coverageRate * 100;

    // 扣分：未覆盖的 POI
    const uncoveredPenalty = summary.uncoveredPois * 10;

    // 扣分：缺失关键证据
    let criticalMissingPenalty = 0;
    for (const poi of pois) {
      if (poi.missingEvidence?.includes('road_closure')) criticalMissingPenalty += 5;
      if (poi.missingEvidence?.includes('weather')) criticalMissingPenalty += 3;
    }

    return Math.max(0, Math.min(100, Math.round(baseScore - uncoveredPenalty - criticalMissingPenalty)));
  }

  /**
   * 计算时间可行性分数
   */
  private calculateScheduleFeasibilityScore(trip: any, coverageData: CoverageMapData): number {
    let score = 100;

    // 检查每天的 POI 数量
    const poisPerDay = new Map<number, number>();
    for (const poi of coverageData.pois) {
      poisPerDay.set(poi.day, (poisPerDay.get(poi.day) || 0) + 1);
    }

    // 扣分：每天 POI 过多（>5 个扣分）
    for (const [day, count] of poisPerDay) {
      if (count > 7) score -= 15;
      else if (count > 5) score -= 8;
    }

    // 扣分：路段时间过长
    for (const segment of coverageData.segments) {
      if (segment.duration > 300) score -= 10; // >5小时
      else if (segment.duration > 180) score -= 5; // >3小时
    }

    // 扣分：跨天路段
    const crossDaySegments = coverageData.segments.filter(s => {
      const fromPoi = coverageData.pois.find(p => p.id === s.fromPoiId);
      const toPoi = coverageData.pois.find(p => p.id === s.toPoiId);
      return fromPoi && toPoi && fromPoi.day !== toPoi.day;
    });
    score -= crossDaySegments.length * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算交通确定性分数
   */
  private calculateTransportCertaintyScore(trip: any, coverageData: CoverageMapData): number {
    let score = 100;

    // 基于路段覆盖状态
    for (const segment of coverageData.segments) {
      if (segment.coverageStatus === 'blocked') score -= 20;
      else if (segment.coverageStatus === 'warning') score -= 10;
    }

    // 基于路段风险
    for (const segment of coverageData.segments) {
      for (const hazard of segment.hazards) {
        if (hazard.severity === 'high') score -= 8;
        else if (hazard.severity === 'medium') score -= 4;
      }
    }

    // 没有路段数据时给予基础分
    if (coverageData.segments.length === 0 && coverageData.pois.length > 1) {
      score = 70; // 有多个 POI 但无路段数据，给予基础分
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算安全风险分数（越高越安全）
   */
  private calculateSafetyRiskScore(coverageData: CoverageMapData, readinessResult: any): number {
    let score = 100;

    // 基于覆盖缺口
    for (const gap of coverageData.gaps) {
      if (gap.severity === 'high') score -= 15;
      else if (gap.severity === 'medium') score -= 8;
      else score -= 3;
    }

    // 基于准备度风险
    const risks = readinessResult?.findings?.flatMap((f: any) => f.risks || []) || [];
    for (const risk of risks) {
      if (risk.severity === 'high') score -= 12;
      else if (risk.severity === 'medium') score -= 6;
      else score -= 2;
    }

    // 基于路段风险
    for (const segment of coverageData.segments) {
      if (segment.hazards.some(h => h.type === 'road_closure')) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算缓冲时间分数
   */
  private calculateBuffersScore(trip: any, coverageData: CoverageMapData): number {
    let score = 85; // 默认给予较高基础分

    // 计算行程天数
    const totalDays = trip.TripDay?.length || 1;
    const poisPerDay = coverageData.pois.length / totalDays;

    // POI 密度过高扣分
    if (poisPerDay > 6) score -= 25;
    else if (poisPerDay > 4) score -= 15;
    else if (poisPerDay > 3) score -= 5;

    // 长距离行驶扣分（消耗缓冲时间）
    const longSegments = coverageData.segments.filter(s => s.distance > 150);
    score -= longSegments.length * 10;

    // 总行驶时间过长扣分
    const totalDrivingTime = coverageData.segments.reduce((sum, s) => sum + s.duration, 0);
    const avgDrivingPerDay = totalDrivingTime / totalDays;
    if (avgDrivingPerDay > 240) score -= 20; // >4小时/天
    else if (avgDrivingPerDay > 180) score -= 10; // >3小时/天

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 提取发现项
   */
  private extractFindings(
    trip: any,
    coverageData: CoverageMapData,
    readinessResult: any,
  ): ReadinessScoreFinding[] {
    const findings: ReadinessScoreFinding[] = [];
    let findingIndex = 0;

    // 从覆盖缺口提取
    for (const gap of coverageData.gaps) {
      findingIndex++;
      // 🆕 统一类型命名：high severity → blocker, medium/low → must
      const findingType = gap.severity === 'high' ? 'blocker' : 'must';
      findings.push({
        id: `finding-${findingIndex}`,
        type: findingType,
        category: gap.type === 'poi' ? 'evidence' : 'transport',
        message: gap.message,
        severity: gap.severity,
        affectedDays: gap.type === 'poi' 
          ? [coverageData.pois.find(p => p.id === gap.relatedId)?.day || 1]
          : undefined,
        actionRequired: gap.missingEvidence 
          ? `补充: ${gap.missingEvidence.join(', ')}` 
          : undefined,
      });
    }

    // 从准备度结果提取
    for (const finding of readinessResult?.findings || []) {
      for (const blocker of finding.blockers || []) {
        findingIndex++;
        findings.push({
          id: `finding-${findingIndex}`,
          type: 'blocker',
          category: blocker.category || 'readiness',
          message: blocker.message,
          severity: 'high',
          actionRequired: blocker.tasks?.map((t: any) => t.action).join(', '),
        });
      }

      for (const must of finding.must || []) {
        findingIndex++;
        findings.push({
          id: `finding-${findingIndex}`,
          type: 'must',  // 🆕 统一类型命名：warning → must
          category: must.category || 'readiness',
          message: must.message,
          severity: 'medium',
          actionRequired: must.tasks?.map((t: any) => t.action).join(', '),
        });
      }

      // 🆕 处理 should 项
      for (const should of finding.should || []) {
        findingIndex++;
        findings.push({
          id: `finding-${findingIndex}`,
          type: 'should',  // 🆕 统一类型命名：suggestion → should
          category: should.category || 'readiness',
          message: should.message,
          severity: 'low',
          actionRequired: should.tasks?.map((t: any) => t.action).join(', '),
        });
      }
    }

    // 从路段风险提取
    for (const segment of coverageData.segments) {
      for (const hazard of segment.hazards) {
        if (hazard.severity === 'high') {
          findingIndex++;
          findings.push({
            id: `finding-${findingIndex}`,
            type: 'must',  // 🆕 统一类型命名：warning → must（高风险路段）
            category: 'transport',
            message: hazard.message,
            severity: hazard.severity,
            affectedDays: [segment.day],
          });
        }
      }
    }

    return findings;
  }

  /**
   * 提取风险项
   */
  private extractRisks(
    coverageData: CoverageMapData,
    readinessResult: any,
  ): ReadinessScoreRisk[] {
    const risks: ReadinessScoreRisk[] = [];
    let riskIndex = 0;

    // 从准备度结果提取
    for (const finding of readinessResult?.findings || []) {
      for (const risk of finding.risks || []) {
        // 只添加有内容的风险
        if (risk.summary || risk.message) {
          riskIndex++;
          risks.push({
            id: `risk-${riskIndex}`,
            type: risk.type || 'unknown',
            severity: risk.severity || 'medium',
            message: risk.summary || risk.message || `${risk.type} 风险`,
            mitigation: risk.mitigations || [],
          });
        }
      }
    }

    // 从路段风险提取
    for (const segment of coverageData.segments) {
      for (const hazard of segment.hazards) {
        riskIndex++;
        const affectedPois = [segment.fromPoiId, segment.toPoiId];
        risks.push({
          id: `risk-${riskIndex}`,
          type: hazard.type,
          severity: hazard.severity,
          message: hazard.message,
          affectedPois,
        });
      }
    }

    // 从覆盖缺口提取高风险项
    for (const gap of coverageData.gaps) {
      if (gap.severity === 'high') {
        riskIndex++;
        risks.push({
          id: `risk-${riskIndex}`,
          type: gap.type === 'poi' ? 'evidence_gap' : 'transport_gap',
          severity: gap.severity,
          message: gap.message,
          affectedPois: gap.relatedId ? [gap.relatedId] : undefined,
        });
      }
    }

    return risks;
  }

  // ==================== 修复选项接口 ====================

  /**
   * 获取阻塞项的修复选项
   */
  async getRepairOptions(tripId: string, blockerId: string): Promise<RepairOptionsResponse> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 获取准备度分数以找到对应的阻塞项
    const scoreData = await this.getReadinessScore(tripId);
    const blocker = scoreData.findings.find(f => f.id === blockerId);
    
    // 根据阻塞项类型生成修复选项
    const options = this.generateRepairOptions(blocker);

    return {
      blockerId,
      blockerMessage: blocker?.message,
      options,
    };
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
    pois: PoiCoverage[],
    segments: SegmentCoverage[]
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
  } {
    const freshness: {
      weather?: string;
      roadClosure?: string;
      openingHours?: string;
    } = {};
    
    const weatherDates: string[] = [];
    const roadClosureDates: string[] = [];
    const openingHoursDates: string[] = [];
    
    for (const poi of pois) {
      const statuses = this.getEvidenceStatus(poi);
      for (const status of statuses) {
        if (status.type === 'weather' && status.status === 'fetched' && status.lastUpdated) {
          weatherDates.push(status.lastUpdated);
        } else if (status.type === 'road_closure' && status.status === 'fetched' && status.lastUpdated) {
          roadClosureDates.push(status.lastUpdated);
        } else if (status.type === 'opening_hours' && status.status === 'fetched' && status.lastUpdated) {
          openingHoursDates.push(status.lastUpdated);
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
    
    return freshness;
  }
}
