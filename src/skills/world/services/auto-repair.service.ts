/**
 * 自动修复服务
 *
 * TerrainAudit（缺失 ascentM 时按需 DEM / shadow polyline）见 `StateConsistencyGuardService`，
 * 已在 Kernel OPTIMIZE（CGUS / MC）路径执行；本服务在 `repairPlan` 入口若注入该 Guard 且
 * `plan` 为 `RoutePlanDraft` 形态，会先跑同一审计再应用修复规则。
 *
 * 负责检测和修复因实时状态变化而受影响的行程，包括：
 * - 检测受影响行程
 * - 自动修复计划（基于实时状态变化）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import { StateConsistencyGuardService } from '../../../trips/dem/services/state-consistency-guard.service';
import { RealtimeRoadStatusService } from './realtime-road-status.service';
import { RealtimeWeatherService } from './realtime-weather.service';
/**
 * 实时状态变化
 */
export interface RealtimeChange {
  type: 'ROAD_STATUS_CHANGE' | 'WEATHER_ALERT' | 'POI_STATUS_CHANGE';
  roadId?: string;
  poiId?: string;
  oldStatus?: string;
  newStatus: string;
  impact: string;
}

/**
 * 修复结果
 */
export interface RepairResult {
  success: boolean;
  repairedPlan?: any; // TripPlan
  changes: RealtimeChange[];
  warnings?: string[];
}

@Injectable()
export class AutoRepairService {
  private readonly logger = new Logger(AutoRepairService.name);

  constructor(
    private prisma: PrismaService,
    private realtimeRoadStatusService: RealtimeRoadStatusService,
    private realtimeWeatherService: RealtimeWeatherService,
    @Optional() private readonly terrainAudit?: StateConsistencyGuardService,
  ) {}

  /**
   * 检测受影响行程
   */
  async detectAffectedTrips(
    changes: RealtimeChange[],
  ): Promise<string[]> {
    this.logger.log(`[AutoRepair] 检测受影响行程: changes=${changes.length}`);

    const affectedTripIds: string[] = [];

    for (const change of changes) {
      if (change.type === 'ROAD_STATUS_CHANGE' && change.roadId) {
        // 查询使用该道路的行程
        // TODO: 实现实际的查询逻辑（需要从TripPlan中提取roadId）
        // const trips = await this.findTripsUsingRoad(change.roadId);
        // affectedTripIds.push(...trips.map(t => t.id));
      }
    }

    return Array.from(new Set(affectedTripIds)); // 去重
  }

  /**
   * 修复计划（基于实时状态变化）
   */
  async repairPlan(
    plan: any, // TripPlan
    changes: RealtimeChange[],
  ): Promise<RepairResult> {
    this.logger.log(`[AutoRepair] 修复计划: changes=${changes.length}`);

    let basePlan = plan;
    if (this.terrainAudit && this.isRoutePlanDraft(basePlan)) {
      const { plan: audited, patched } = await this.terrainAudit.runTerrainAudit(basePlan);
      if (patched) {
        this.logger.log('[AutoRepair] TerrainAudit applied (DEM ascent / slope before repair rules)');
      }
      basePlan = audited;
    }

    const repairedPlan = { ...basePlan };
    const warnings: string[] = [];

    for (const change of changes) {
      switch (change.type) {
        case 'ROAD_STATUS_CHANGE':
          if (change.newStatus === 'CLOSED') {
            // 道路封闭：需要替换路线
            warnings.push(`道路 ${change.roadId} 已封闭，需要替换路线`);
            // TODO: 实现路线替换逻辑
          } else if (change.newStatus === 'CONDITIONAL') {
            // 道路有条件限制：添加警告
            warnings.push(`道路 ${change.roadId} 有条件限制: ${change.impact}`);
          }
          break;

        case 'WEATHER_ALERT':
          // 天气预警：可能需要调整POI或增加缓冲时间
          warnings.push(`天气预警: ${change.impact}`);
          // TODO: 实现天气预警处理逻辑
          break;

        case 'POI_STATUS_CHANGE':
          if (change.newStatus === 'CLOSED') {
            // POI关闭：需要替换POI
            warnings.push(`POI ${change.poiId} 已关闭，需要替换`);
            // TODO: 实现POI替换逻辑
          }
          break;
      }
    }

    return {
      success: warnings.length === 0,
      repairedPlan: warnings.length === 0 ? repairedPlan : undefined,
      changes,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 检测实时状态变化（从计划中提取）
   */
  async detectRealtimeChanges(_plan: any): Promise<RealtimeChange[]> {
    const changes: RealtimeChange[] = [];

    // 检查计划中涉及的道路
    // TODO: 从plan中提取roadId列表
    // const roadIds = this.extractRoadIdsFromPlan(plan);
    // for (const roadId of roadIds) {
    //   const realtimeStatus = await this.realtimeRoadStatusService.getRoadStatus(roadId);
    //   const staticStatus = await this.getStaticRoadStatus(roadId);
    //   if (realtimeStatus?.currentStatus !== staticStatus.status) {
    //     changes.push({
    //       type: 'ROAD_STATUS_CHANGE',
    //       roadId,
    //       oldStatus: staticStatus.status,
    //       newStatus: realtimeStatus.currentStatus,
    //       impact: this.calculateImpact(plan, roadId),
    //     });
    //   }
    // }

    return changes;
  }

  private isRoutePlanDraft(p: unknown): p is RoutePlanDraft {
    if (!p || typeof p !== 'object') return false;
    const o = p as Record<string, unknown>;
    return typeof o.tripId === 'string' && typeof o.routeDirectionId === 'string' && Array.isArray(o.segments);
  }
}
