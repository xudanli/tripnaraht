import { Injectable, Logger, Optional } from '@nestjs/common';
import { GeoAgent, GeoPoint, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { DEMElevationService } from '../../../trips/dem/services/dem-elevation.service';
import { PrismaService } from '../../../prisma/prisma.service';
// 护城河扩展：实时世界状态更新
import { RealtimeRoadStatusService } from '../../../skills/world/services/realtime-road-status.service';

@Injectable()
export class GeoAgentService implements GeoAgent {
  private readonly logger = new Logger(GeoAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly demService?: DEMElevationService,
    // 护城河扩展：实时道路状态服务
    @Optional() private readonly realtimeRoadStatusService?: RealtimeRoadStatusService,
  ) {
    this.logger.log('[GeoAgent] Initialized');
  }

  async analyzeTerrain(route: GeoPoint[]): Promise<{
    elevation_profile: Array<{ distance_km: number; elevation_m: number }>;
    total_ascent_m: number;
    total_descent_m: number;
    max_elevation_m: number;
    min_elevation_m: number;
    max_slope_deg: number;
    terrain_type: 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE';
    difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const elevationProfile: Array<{ distance_km: number; elevation_m: number }> = [];
    let cumulativeDistance = 0;
    const elevations: number[] = [];

    for (let i = 0; i < route.length; i++) {
      const point = route[i];
      let elevation: number | null = null;
      if (this.demService) {
        try {
          elevation = await this.demService.getElevation(point.lat, point.lng);
        } catch {
          this.logger.warn('[GeoAgent] Failed to get elevation');
        }
      }
      if (i > 0) cumulativeDistance += this.calculateDistance(route[i - 1], point);
      if (elevation !== null) {
        elevations.push(elevation);
        elevationProfile.push({ distance_km: Math.round(cumulativeDistance * 100) / 100, elevation_m: elevation });
      }
    }

    let totalAscent = 0, totalDescent = 0, maxSlope = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) totalAscent += diff;
      else totalDescent += Math.abs(diff);
      const hDist = this.calculateDistance(route[i - 1], route[i]) * 1000;
      if (hDist > 0) maxSlope = Math.max(maxSlope, Math.atan(Math.abs(diff) / hDist) * (180 / Math.PI));
    }

    const maxElev = elevations.length > 0 ? Math.max(...elevations) : 0;
    const minElev = elevations.length > 0 ? Math.min(...elevations) : 0;

    evidence.push({
      evidence_id: `geo_terrain_${Date.now()}`,
      source: 'GeoAgent.analyzeTerrain',
      timestamp: new Date().toISOString(),
      data: { points_analyzed: route.length, elevations_retrieved: elevations.length },
    });

    const coverage = route.length > 0 ? elevations.length / route.length : 0;
    return {
      elevation_profile: elevationProfile,
      total_ascent_m: Math.round(totalAscent),
      total_descent_m: Math.round(totalDescent),
      max_elevation_m: Math.round(maxElev),
      min_elevation_m: Math.round(minElev),
      max_slope_deg: Math.round(maxSlope * 10) / 10,
      terrain_type: this.getTerrainType(totalAscent, maxElev, cumulativeDistance),
      difficulty: this.getDifficulty(totalAscent, maxSlope, cumulativeDistance),
      evidence,
      data_quality: this.createDataQuality({
        sourceType: this.demService ? 'REALTIME_API' : 'ESTIMATED',
        confidence: coverage > 0.8 ? 0.9 : coverage > 0.5 ? 0.7 : 0.5,
        coverage,
        fallbackInfo: !this.demService ? {
          original_source: 'DEMElevationService',
          fallback_reason: 'DEM service not available',
          quality_impact: 'MODERATE',
        } : undefined,
      }),
    };
  }

  async checkRouteFeasibility(
    origin: GeoPoint,
    destination: GeoPoint,
    transportMode: 'DRIVE' | 'WALK' | 'CYCLE' | 'TRANSIT',
  ): Promise<{
    is_reachable: boolean;
    blocking_factors?: string[];
    estimated_duration_min: number;
    estimated_distance_km: number;
    difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
    confidence: number;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const blockingFactors: string[] = [];
    const directDist = this.calculateDistance(origin, destination);
    const multiplier = transportMode === 'DRIVE' ? 1.3 : transportMode === 'WALK' ? 1.4 : transportMode === 'CYCLE' ? 1.35 : 1.5;
    const estDist = directDist * multiplier;
    const speed = transportMode === 'DRIVE' ? 60 : transportMode === 'WALK' ? 4 : transportMode === 'CYCLE' ? 15 : 30;
    const estDuration = (estDist / speed) * 60;
    const terrain = await this.analyzeTerrain([origin, destination]);
    let reachable = true;
    let confidence = 0.7;

    if (terrain.max_slope_deg > 30 && transportMode === 'DRIVE') {
      blockingFactors.push('Slope too steep');
      reachable = false;
    }
    if (terrain.total_ascent_m > 2000 && transportMode === 'WALK') {
      blockingFactors.push('Ascent too high');
      confidence -= 0.2;
    }
    if (estDist > 500 && transportMode === 'WALK') {
      blockingFactors.push('Distance too long');
      reachable = false;
    }
    if (this.demService && terrain.elevation_profile.length > 0) confidence += 0.2;

    // 护城河扩展：查询实时道路状态（仅对DRIVE模式）
    if (transportMode === 'DRIVE' && this.realtimeRoadStatusService) {
      try {
        // TODO: 从路线中提取roadId（需要路线数据）
        // 这里简化处理，实际应该从RouteDirection或路线数据中提取roadId
        // const roadId = await this.extractRoadIdFromRoute(origin, destination);
        // if (roadId) {
        //   const realtimeStatus = await this.realtimeRoadStatusService.getRoadStatus(roadId);
        //   if (realtimeStatus && realtimeStatus.currentStatus === 'CLOSED') {
        //     blockingFactors.push(`Road ${roadId} is currently closed`);
        //     reachable = false;
        //   } else if (realtimeStatus && realtimeStatus.currentStatus === 'CONDITIONAL') {
        //     blockingFactors.push(`Road ${roadId} has conditional restrictions`);
        //     confidence -= 0.1;
        //   }
        // }
      } catch (error: any) {
        this.logger.warn(
          `[GeoAgent] 获取实时道路状态失败: ${error?.message}`,
        );
        // 不抛出错误，降级到静态数据
      }
    }

    evidence.push({
      evidence_id: `geo_feasibility_${Date.now()}`,
      source: 'GeoAgent.checkRouteFeasibility',
      timestamp: new Date().toISOString(),
      data: { origin, destination, transport_mode: transportMode },
    });

    return {
      is_reachable: reachable,
      blocking_factors: blockingFactors.length > 0 ? blockingFactors : undefined,
      estimated_duration_min: Math.round(estDuration),
      estimated_distance_km: Math.round(estDist * 10) / 10,
      difficulty: terrain.difficulty,
      confidence: Math.min(1, Math.max(0, confidence)),
      evidence,
      data_quality: this.createDataQuality({
        sourceType: this.demService ? 'REALTIME_API' : 'ESTIMATED',
        confidence: confidence,
        coverage: terrain.data_quality.coverage,
      }),
    };
  }

  async findNearbyPOIs(
    center: GeoPoint,
    radius_km: number,
    categories?: string[],
  ): Promise<{
    pois: Array<{ poi_id: string; name: string; category: string; location: GeoPoint; distance_km: number }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }> {
    const evidence: EvidenceRef[] = [];
    const pois: Array<{ poi_id: string; name: string; category: string; location: GeoPoint; distance_km: number }> = [];
    try {
      const radiusM = radius_km * 1000;
      const catFilter = categories?.length ? 'AND category = ANY($4::text[])' : '';
      const query = `SELECT id::text as poi_id, name, category, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 as distance_km FROM places WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3) ${catFilter} ORDER BY distance_km LIMIT 50`;
      const params: any[] = [center.lat, center.lng, radiusM];
      if (categories?.length) params.push(categories);
      const results = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);
      for (const r of results) {
        pois.push({ poi_id: r.poi_id, name: r.name, category: r.category, location: { lat: r.lat, lng: r.lng }, distance_km: Math.round(r.distance_km * 100) / 100 });
      }
      evidence.push({ evidence_id: `geo_poi_${Date.now()}`, source: 'GeoAgent.findNearbyPOIs', timestamp: new Date().toISOString(), data: { center, radius_km, results_count: pois.length } });
    } catch (e: any) {
      evidence.push({ evidence_id: `geo_poi_err_${Date.now()}`, source: 'GeoAgent.findNearbyPOIs', timestamp: new Date().toISOString(), data: { error: e?.message } });
    }
    return {
      pois,
      evidence,
      data_quality: this.createDataQuality({
        sourceType: pois.length > 0 ? 'CACHED' : 'ESTIMATED',
        confidence: pois.length > 0 ? 0.95 : 0.3,
        coverage: pois.length > 0 ? 1.0 : 0.0,
      }),
    };
  }

  private calculateDistance(p1: GeoPoint, p2: GeoPoint): number {
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private getTerrainType(ascent: number, maxElev: number, dist: number): 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE' {
    const ascentPerKm = dist > 0 ? ascent / dist : 0;
    if (maxElev > 3000 || ascentPerKm > 100) return 'ALPINE';
    if (maxElev > 1500 || ascentPerKm > 50) return 'MOUNTAINOUS';
    if (ascentPerKm > 20) return 'HILLY';
    return 'FLAT';
  }

  private getDifficulty(ascent: number, slope: number, dist: number): 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT' {
    const ascentPerKm = dist > 0 ? ascent / dist : 0;
    if (slope > 25 || ascentPerKm > 100 || ascent > 2000) return 'EXPERT';
    if (slope > 15 || ascentPerKm > 50 || ascent > 1000) return 'HARD';
    if (slope > 8 || ascentPerKm > 25 || ascent > 500) return 'MODERATE';
    return 'EASY';
  }

  /**
   * 生成数据质量标注
   */
  private createDataQuality(options: {
    sourceType: DataQuality['source_type'];
    confidence: number;
    coverage: number;
    fallbackInfo?: DataQuality['fallback_info'];
  }): DataQuality {
    const now = new Date().toISOString();
    return {
      source_type: options.sourceType,
      freshness_seconds: 0,
      confidence: options.confidence,
      coverage: options.coverage,
      retrieved_at: now,
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      fallback_info: options.fallbackInfo,
    };
  }
}
