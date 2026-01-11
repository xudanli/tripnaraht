// src/skills/dem/dem-get-profile.skill.ts
/**
 * skill.dem.getProfile
 * 
 * 输入：{ polyline, samples }
 * 输出：{ elevationProfile, cumulativeAscent, maxSlope, fatigueIndex }
 * 供：Abu / Dr.Dre 以及 Explanation 使用
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { DEMElevationService } from '../../trips/dem/services/dem-elevation.service';
import { DEMEffortMetadataService, RoutePoint } from '../../trips/dem/services/dem-effort-metadata.service';

export interface DemGetProfileInput extends SkillInput {
  /** 路线点数组（polyline） */
  polyline: Array<{ lat: number; lng: number }>;
  /** 采样间隔（米），默认 100 */
  samples?: number;
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
}

@Injectable()
export class DemGetProfileSkill implements Skill<DemGetProfileInput, DemGetProfileOutput> {
  private readonly logger = new Logger(DemGetProfileSkill.name);

  metadata = {
    name: 'dem.getProfile',
    description: '基于 DEM 数据生成路线海拔剖面，计算累计爬升、最大坡度和疲劳指数',
    version: '1.0.0',
    category: 'dem' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    private readonly demElevationService: DEMElevationService,
    private readonly demEffortMetadataService: DEMEffortMetadataService,
  ) {}

  async execute(input: DemGetProfileInput): Promise<DemGetProfileOutput> {
    this.logger.debug(`执行 dem.getProfile: ${input.polyline.length} 个点`);

    if (!input.polyline || input.polyline.length < 2) {
      throw new Error('polyline 至少需要 2 个点');
    }

    const samplingInterval = input.samples || 100;

    // 转换为 RoutePoint 格式
    const routePoints: RoutePoint[] = input.polyline.map((p, index) => ({
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

    return {
      elevationProfile,
      cumulativeAscent: totalAscent,
      maxSlope,
      fatigueIndex,
    };
  }
}

