// src/trips/decision/services/spatial-issue-detector.service.ts
/**
 * Spatial Issue Detector Service
 * 
 * Neptune 的空间问题检测服务
 * 
 * 自动发现以下问题：
 * - ENTRY_UNREACHABLE 入口不可达
 * - POI_UNAVAILABLE 景点/节点不可用
 * - SEGMENT_BLOCKED 某个路段被封
 * - FERRY_CANCELLED 渡轮中断
 * - HAZARD_ZONE 危险区域
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { SpatialIssue } from '../interfaces/spatial-issue.interface';
import { Road } from '../interfaces/road.interface';
import { PoiStatusData } from '../interfaces/poi-status.interface';
import { Ferry } from '../interfaces/ferry.interface';
import { HazardZone } from '../interfaces/hazard.interface';

/**
 * Road Repository Interface
 */
export interface RoadRepository {
  findBySegmentId(segmentId: string): Promise<Road | null>;
  findByPoiId(poiId: string): Promise<Road | null>;
}

/**
 * POI Repository Interface
 */
export interface PoiRepository {
  findManyByIds(poiIds: string[]): Promise<PoiStatusData[]>;
  findById(poiId: string): Promise<PoiStatusData | null>;
}

/**
 * Ferry Repository Interface
 */
export interface FerryRepository {
  findById(ferryId: string): Promise<Ferry | null>;
}

/**
 * Hazard Service Interface
 */
export interface HazardService {
  checkSegment(segmentId: string): Promise<HazardZone | null>;
}

@Injectable()
export class SpatialIssueDetectorService {
  private readonly logger = new Logger(SpatialIssueDetectorService.name);

  constructor(
    @Optional() private readonly roadRepo?: RoadRepository,
    @Optional() private readonly poiRepo?: PoiRepository,
    @Optional() private readonly ferryRepo?: FerryRepository,
    @Optional() private readonly hazardService?: HazardService,
  ) {}

  /**
   * 检测所有空间问题
   */
  async detect(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    this.logger.debug(`开始检测空间问题: ${plan.tripId}`);

    const issues: SpatialIssue[] = [];

    issues.push(
      ...(await this.detectEntryIssues(world, plan)),
      ...(await this.detectPoiIssues(world, plan)),
      ...(await this.detectSegmentIssues(world, plan)),
      ...(await this.detectFerryIssues(world, plan)),
      ...(await this.detectHazardIssues(world, plan)),
    );

    this.logger.debug(`检测到 ${issues.length} 个空间问题`);
    return issues;
  }

  /**
   * 1️⃣ 检测入口问题（ENTRY_UNREACHABLE）
   */
  private async detectEntryIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    if (!this.roadRepo) {
      return issues;
    }

    const firstDaySegments = plan.segments.filter(s => s.dayIndex === 1);
    if (!firstDaySegments.length) {
      return issues;
    }

    // 简化：第一个 segment 的起点视为入口
    const entrySegment = firstDaySegments[0];
    const entryRoad = await this.roadRepo.findBySegmentId(entrySegment.segmentId);

    if (!entryRoad) {
      return issues;
    }

    // 检查道路状态
    if (entryRoad.status === 'CLOSED') {
      issues.push({
        issueId: `ENTRY_CLOSED_${entryRoad.id}_${Date.now()}`,
        type: 'ENTRY_UNREACHABLE',
        severity: 'HARD',
        segmentId: entrySegment.segmentId,
        reason: '入口道路处于封闭状态',
        originalLocation: entrySegment.metadata?.location,
        metadata: { roadId: entryRoad.id, status: entryRoad.status },
      });
    }

    // 检查季节性道路
    if (entryRoad.status === 'SEASONAL') {
      const m = world.physical.month;
      const openFrom = entryRoad.seasonOpenFrom;
      const openTo = entryRoad.seasonOpenTo;

      if (openFrom !== undefined && openTo !== undefined) {
        const isOpen =
          openFrom <= openTo
            ? m >= openFrom && m <= openTo
            : m >= openFrom || m <= openTo; // 跨年

        if (!isOpen) {
          issues.push({
            issueId: `ENTRY_OUT_OF_SEASON_${entryRoad.id}_${Date.now()}`,
            type: 'ENTRY_UNREACHABLE',
            severity: 'HARD',
            segmentId: entrySegment.segmentId,
            reason: `入口道路为季节性道路，${m} 月不开放（开放时间：${openFrom}-${openTo} 月）`,
            originalLocation: entrySegment.metadata?.location,
            metadata: {
              roadId: entryRoad.id,
              status: entryRoad.status,
              openFrom,
              openTo,
              currentMonth: m,
            },
          });
        }
      }
    }

    return issues;
  }

  /**
   * 2️⃣ 检测 POI 问题（POI_UNAVAILABLE）
   */
  private async detectPoiIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    if (!this.poiRepo) {
      return issues;
    }

    // 收集所有 POI ID
    const poiIds = plan.segments
      .map(s => s.metadata?.poiId)
      .filter((id): id is string => !!id && typeof id === 'string');

    if (!poiIds.length) {
      return issues;
    }

    const pois = await this.poiRepo.findManyByIds(poiIds);

    for (const poi of pois) {
      const segment = plan.segments.find(s => s.metadata?.poiId === poi.id);

      if (poi.status === 'CLOSED') {
        issues.push({
          issueId: `POI_CLOSED_${poi.id}_${Date.now()}`,
          type: 'POI_UNAVAILABLE',
          severity: 'HARD',
          segmentId: segment?.segmentId,
          poiId: poi.id,
          reason: `该点当前关闭：${poi.closingReason ?? '未知原因'}`,
          originalLocation: segment?.metadata?.location,
          metadata: {
            closingReason: poi.closingReason,
            status: poi.status,
          },
        });
      } else if (poi.validTo && poi.validTo < new Date()) {
        issues.push({
          issueId: `POI_EXPIRED_${poi.id}_${Date.now()}`,
          type: 'POI_UNAVAILABLE',
          severity: 'SOFT',
          segmentId: segment?.segmentId,
          poiId: poi.id,
          reason: '该点有效期已过，状态可能不可靠',
          originalLocation: segment?.metadata?.location,
          metadata: {
            validTo: poi.validTo.toISOString(),
            status: poi.status,
          },
        });
      }
    }

    return issues;
  }

  /**
   * 3️⃣ 检测路段问题（SEGMENT_BLOCKED）
   */
  private async detectSegmentIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    if (!this.roadRepo) {
      return issues;
    }

    // 跳过第一天（入口已在 detectEntryIssues 中处理）
    const nonEntrySegments = plan.segments.filter(s => s.dayIndex > 1);

    for (const seg of nonEntrySegments) {
      const road = await this.roadRepo.findBySegmentId(seg.segmentId);
      if (!road) {
        continue;
      }

      if (road.status === 'CLOSED') {
        issues.push({
          issueId: `SEGMENT_CLOSED_${seg.segmentId}_${Date.now()}`,
          type: 'SEGMENT_BLOCKED',
          severity: 'HARD',
          segmentId: seg.segmentId,
          reason: '行程中的某段道路处于封闭状态',
          originalLocation: seg.metadata?.location,
          metadata: {
            roadId: road.id,
            dayIndex: seg.dayIndex,
            status: road.status,
          },
        });
      } else if (road.status === 'RESTRICTED' && road.hazardTag !== 'NONE') {
        issues.push({
          issueId: `SEGMENT_RESTRICTED_${seg.segmentId}_${Date.now()}`,
          type: 'SEGMENT_BLOCKED',
          severity: 'SOFT',
          segmentId: seg.segmentId,
          reason: `该路段受限：${road.hazardTag}`,
          originalLocation: seg.metadata?.location,
          metadata: {
            roadId: road.id,
            dayIndex: seg.dayIndex,
            status: road.status,
            hazardTag: road.hazardTag,
          },
        });
      }
    }

    return issues;
  }

  /**
   * 4️⃣ 检测渡轮问题（FERRY_CANCELLED）
   */
  private async detectFerryIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    if (!this.ferryRepo) {
      return issues;
    }

    const ferrySegs = plan.segments.filter(
      s => s.metadata?.mode === 'FERRY' || s.metadata?.ferryId
    );

    for (const seg of ferrySegs) {
      const ferryId = seg.metadata?.ferryId;
      if (!ferryId || typeof ferryId !== 'string') {
        continue;
      }

      const ferry = await this.ferryRepo.findById(ferryId);
      if (!ferry) {
        continue;
      }

      if (ferry.status === 'CANCELLED') {
        issues.push({
          issueId: `FERRY_CANCELLED_${ferry.id}_${Date.now()}`,
          type: 'FERRY_CANCELLED',
          severity: 'HARD',
          segmentId: seg.segmentId,
          reason: '该渡轮已停运或当日取消',
          originalLocation: seg.metadata?.location,
          metadata: {
            ferryId: ferry.id,
            dayIndex: seg.dayIndex,
            status: ferry.status,
          },
        });
      } else if (ferry.status === 'SEASONAL') {
        const m = world.physical.month;
        const openFrom = ferry.seasonOpenFrom;
        const openTo = ferry.seasonOpenTo;

        if (openFrom !== undefined && openTo !== undefined) {
          const isOpen =
            openFrom <= openTo
              ? m >= openFrom && m <= openTo
              : m >= openFrom || m <= openTo; // 跨年

          if (!isOpen) {
            issues.push({
              issueId: `FERRY_OUT_OF_SEASON_${ferry.id}_${Date.now()}`,
              type: 'FERRY_CANCELLED',
              severity: 'HARD',
              segmentId: seg.segmentId,
              reason: `该渡轮为季节性运营，${m} 月不开放（开放时间：${openFrom}-${openTo} 月）`,
              originalLocation: seg.metadata?.location,
              metadata: {
                ferryId: ferry.id,
                dayIndex: seg.dayIndex,
                status: ferry.status,
                openFrom,
                openTo,
                currentMonth: m,
              },
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * 5️⃣ 检测危险区域问题（HAZARD_ZONE）
   */
  private async detectHazardIssues(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<SpatialIssue[]> {
    const issues: SpatialIssue[] = [];

    if (!this.hazardService) {
      return issues;
    }

    for (const seg of plan.segments) {
      const hazard = await this.hazardService.checkSegment(seg.segmentId);
      if (!hazard) {
        continue;
      }

      if (hazard.level === 'HIGH') {
        issues.push({
          issueId: `HAZARD_HIGH_${seg.segmentId}_${Date.now()}`,
          type: 'HAZARD_ZONE',
          severity: 'HARD',
          segmentId: seg.segmentId,
          reason: `该路段穿越高风险区域：${hazard.hazardType}${hazard.description ? ` (${hazard.description})` : ''}`,
          originalLocation: seg.metadata?.location,
          metadata: {
            hazardType: hazard.hazardType,
            level: hazard.level,
            description: hazard.description,
            dayIndex: seg.dayIndex,
          },
        });
      } else if (hazard.level === 'MEDIUM') {
        issues.push({
          issueId: `HAZARD_MEDIUM_${seg.segmentId}_${Date.now()}`,
          type: 'HAZARD_ZONE',
          severity: 'SOFT',
          segmentId: seg.segmentId,
          reason: `该路段穿越中等风险区域：${hazard.hazardType}${hazard.description ? ` (${hazard.description})` : ''}`,
          originalLocation: seg.metadata?.location,
          metadata: {
            hazardType: hazard.hazardType,
            level: hazard.level,
            description: hazard.description,
            dayIndex: seg.dayIndex,
          },
        });
      }
    }

    return issues;
  }
}

