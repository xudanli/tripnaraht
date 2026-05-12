// src/skills/dem/dem-get-profile.skill.ts
/**
 * skill.dem.get_profile（Registry 规范名）
 *
 * Agentic 路径：编排 / RESEARCH 可能传 `destination` / `origin`；工作台与 geo 技能传 `polyline`。
 * Internal Path（PlanningWorkbench / WorldBuild 等）仍直接调 DEMEffortMetadataService，不经本 Skill。
 *
 * 输入归一化见 `dem-get-profile-input.adapter.ts`。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DEMElevationService } from '../../trips/dem/services/dem-elevation.service';
import { DEMEffortMetadataService, RoutePoint } from '../../trips/dem/services/dem-effort-metadata.service';
import {
  normalizeDemGetProfileInput,
  inferDemElevationDataQuality,
  type DemGetProfileLooseInput,
  type DemElevationDataQuality,
} from './dem-get-profile-input.adapter';

export interface DemGetProfileInput extends SkillInput {
  /** 路线点（≥2 点）；与 destination / origin 二选一或组合，由适配层收敛 */
  polyline?: Array<{ lat: number; lng: number }>;
  /** 采样间隔（米），默认 100 */
  samples?: number;
  /** RESEARCH 链路：目的地（坐标对象或含 "lat,lng" 的字符串） */
  destination?: string | { lat: number; lng: number };
  /** 可选起点，与 destination 均为坐标时可连成 2 点剖面 */
  origin?: string | { lat: number; lng: number };
}

export interface DemGetProfileOutput extends SkillOutput {
  /** 海拔剖面点数组 */
  elevationProfile: Array<{
    distance: number;
    lat: number;
    lng: number;
    elevation: number;
    slope: number;
    cumulativeAscent: number;
  }>;
  /** 累计爬升（米） */
  cumulativeAscent: number;
  /** 最大坡度（百分比） */
  maxSlope: number;
  /** 疲劳指数（归一化，0-100） */
  fatigueIndex: number;
  /**
   * 海拔/坡度数据可信度启发式（非物理真值）：`low` 时下游不应把「零爬升」当正常冰岛山路结论。
   * @see inferDemElevationDataQuality
   */
  data_quality: DemElevationDataQuality;
}

@Injectable()
export class DemGetProfileSkill implements Skill<DemGetProfileInput, DemGetProfileOutput> {
  private readonly logger = new Logger(DemGetProfileSkill.name);

  metadata = {
    name: 'dem.get_profile',
    description:
      '基于 DEM 生成路线海拔剖面、累计爬升、最大坡度、疲劳指数。参数：polyline（≥2 点）或带经纬度的 destination / origin+destination。',
    version: '1.0.0',
    category: 'dem' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: [],
    },
  };

  constructor(
    private readonly demElevationService: DEMElevationService,
    private readonly demEffortMetadataService: DEMEffortMetadataService,
  ) {}

  async execute(input: DemGetProfileInput | DemGetProfileLooseInput): Promise<DemGetProfileOutput> {
    const { polyline, samples } = normalizeDemGetProfileInput(input as DemGetProfileLooseInput);
    this.logger.debug(`执行 dem.get_profile: ${polyline.length} 个点`);

    const samplingInterval = samples ?? 100;

    // 转换为 RoutePoint 格式
    const routePoints: RoutePoint[] = polyline.map((p, index) => ({
      lat: p.lat,
      lng: p.lng,
      sequence: index,
    }));

    // 计算体力消耗元数据（包含海拔剖面）
    // MCP/无DB/依赖缺失场景下，DEMEffortMetadataService 可能不可用；此时降级为简化计算
    const canUseEffort =
      this.demEffortMetadataService &&
      typeof (this.demEffortMetadataService as any).calculateEffortMetadata === 'function';

    const effortMetadata = canUseEffort
      ? await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
          activityType: 'walking',
          samplingInterval,
          includeElevationProfile: true,
        })
      : {
          elevationProfile: [],
          totalDistance: 0,
          totalAscent: 0,
        };

    // 提取海拔剖面并计算累计爬升
    let cumulativeAscent = 0;
    const elevationProfile = effortMetadata.elevationProfile?.map((point, index) => {
      // 计算累计爬升（只计算上升部分）
      if (index > 0 && effortMetadata.elevationProfile) {
        const prevElevation = effortMetadata.elevationProfile[index - 1].elevation;
        const elevationDiff = point.elevation - prevElevation;
        if (elevationDiff > 0) {
          cumulativeAscent += elevationDiff;
        }
      }
      
      return {
        distance: point.distance,
        lat: routePoints[Math.min(index, routePoints.length - 1)].lat,
        lng: routePoints[Math.min(index, routePoints.length - 1)].lng,
        elevation: point.elevation,
        slope: point.slope,
        cumulativeAscent,
      };
    }) || [];

    // 计算最大坡度
    const maxSlope = Math.max(...elevationProfile.map(p => Math.abs(p.slope)), 0);

    // 计算疲劳指数（基于累计爬升和距离的简化公式）
    const totalDistance = effortMetadata.totalDistance || 0;
    const totalAscent = effortMetadata.totalAscent || 0;
    const fatigueIndex = Math.min(100, (totalAscent / 1000) * 10 + (totalDistance / 1000) * 2);

    const data_quality = inferDemElevationDataQuality({
      usedEffortService: canUseEffort,
      elevationProfile: elevationProfile.map((p) => ({ elevation: p.elevation, slope: p.slope })),
      totalDistanceM: totalDistance,
      totalAscentM: totalAscent,
      maxSlopePct: maxSlope,
    });

    return {
      elevationProfile,
      cumulativeAscent: totalAscent,
      maxSlope,
      fatigueIndex,
      data_quality,
    };
  }
}

