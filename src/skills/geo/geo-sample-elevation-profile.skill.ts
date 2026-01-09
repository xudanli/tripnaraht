// src/skills/geo/geo-sample-elevation-profile.skill.ts
/**
 * tripnara.geo.sampleElevationProfile
 * 
 * P0: Geo/Spatial MCP - 标准化 DEM 高程采样
 * 
 * 功能：把 dem.getProfile 标准化，统一 PostGIS 栅格访问的安全出口
 * 安全控制：限制采样点数量、采样间隔、记录查询日志
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { DemGetProfileSkill } from '../dem/dem-get-profile.skill';

export interface GeoSampleElevationProfileInput extends BaseSkillInput {
  /** 路线点数组（polyline） */
  polyline: Array<{
    /** 纬度 */
    lat: number;
    /** 经度 */
    lng: number;
  }>;
  
  /** 采样间隔（米），默认 100，最大 1000 */
  samplingInterval?: number;
  
  /** 最大采样点数量（默认 1000，最大 5000） */
  maxSamples?: number;
}

export interface GeoSampleElevationProfileOutput extends SkillOutput {
  /** 海拔剖面点数组 */
  elevationProfile: Array<{
    /** 距离起点距离（米） */
    distance: number;
    /** 纬度 */
    lat: number;
    /** 经度 */
    lng: number;
    /** 海拔（米） */
    elevation: number;
    /** 坡度（百分比） */
    slope: number;
    /** 累计爬升（米） */
    cumulativeAscent: number;
  }>;
  
  /** 累计爬升（米） */
  cumulativeAscent: number;
  
  /** 最大坡度（百分比） */
  maxSlope: number;
  
  /** 疲劳指数（归一化，0-100） */
  fatigueIndex: number;
  
  /** 查询摘要 */
  summary: {
    /** 总采样点数 */
    totalSamples: number;
    /** 使用的采样间隔（米） */
    samplingInterval: number;
    /** 路线总长度（米） */
    totalDistance: number;
    /** 查询耗时（毫秒） */
    queryTime: number;
  };
}

@Injectable()
export class GeoSampleElevationProfileSkill
  implements Skill<GeoSampleElevationProfileInput, GeoSampleElevationProfileOutput>
{
  private readonly logger = new Logger(GeoSampleElevationProfileSkill.name);

  /** 最大采样间隔（1000米） */
  private readonly MAX_SAMPLING_INTERVAL = 1000;
  
  /** 最大采样点数量 */
  private readonly MAX_SAMPLES = 5000;
  
  /** 默认采样间隔 */
  private readonly DEFAULT_SAMPLING_INTERVAL = 100;

  metadata = {
    name: 'geo.sampleElevationProfile',
    description: '标准化 DEM 高程采样：基于 PostGIS 栅格生成路线海拔剖面，计算累计爬升、最大坡度和疲劳指数',
    version: '1.0.0',
    category: 'dem' as const,
  };

  constructor(
    @Optional() private readonly demGetProfileSkill?: DemGetProfileSkill,
  ) {
    if (!this.demGetProfileSkill) {
      this.logger.warn('DemGetProfileSkill 未注入，geo.sampleElevationProfile 功能将不可用');
    }
  }

  async execute(
    input: GeoSampleElevationProfileInput,
  ): Promise<GeoSampleElevationProfileOutput> {
    const startTime = Date.now();
    this.logger.debug(
      `执行 geo.sampleElevationProfile: polyline=${input.polyline.length} 个点`,
    );

    try {
      // 1. 参数验证和安全控制
      if (!input.polyline || input.polyline.length < 2) {
        throw new Error('polyline 至少需要 2 个点');
      }

      // 验证坐标范围
      for (const point of input.polyline) {
        if (
          !point.lat ||
          !point.lng ||
          point.lat < -90 ||
          point.lat > 90 ||
          point.lng < -180 ||
          point.lng > 180
        ) {
          throw new Error(`无效的坐标: (${point.lat}, ${point.lng})`);
        }
      }

      // 限制采样间隔
      const validatedSamplingInterval = Math.min(
        input.samplingInterval || this.DEFAULT_SAMPLING_INTERVAL,
        this.MAX_SAMPLING_INTERVAL,
      );
      if (input.samplingInterval && input.samplingInterval > this.MAX_SAMPLING_INTERVAL) {
        this.logger.warn(
          `采样间隔 ${input.samplingInterval}m 超过最大值 ${this.MAX_SAMPLING_INTERVAL}m，已限制为 ${validatedSamplingInterval}m`,
        );
      }

      // 限制采样点数量（基于路线长度估算）
      const estimatedSamples = Math.ceil(
        this.estimateRouteLength(input.polyline) / validatedSamplingInterval,
      );
      const maxSamples = Math.min(input.maxSamples || this.MAX_SAMPLES, this.MAX_SAMPLES);
      
      if (estimatedSamples > maxSamples) {
        this.logger.warn(
          `估算采样点数 ${estimatedSamples} 超过最大值 ${maxSamples}，路线可能被截断`,
        );
      }

      if (!this.demGetProfileSkill) {
        throw new Error('DemGetProfileSkill 未注入，无法执行高程采样');
      }

      // 2. 调用 dem.getProfile Skill
      const demResult = await this.demGetProfileSkill.execute({
        polyline: input.polyline,
        samples: validatedSamplingInterval,
      });

      // 3. 限制返回的采样点数量
      const limitedProfile = demResult.elevationProfile.slice(0, maxSamples);

      // 4. 计算路线总长度
      const totalDistance =
        limitedProfile.length > 0
          ? limitedProfile[limitedProfile.length - 1].distance
          : 0;

      // 5. 记录查询日志（用于审计）
      const queryTime = Date.now() - startTime;
      this.logger.debug(
        `geo.sampleElevationProfile 查询完成: ${limitedProfile.length} 个采样点，耗时 ${queryTime}ms`,
      );

      return {
        elevationProfile: limitedProfile,
        cumulativeAscent: demResult.cumulativeAscent,
        maxSlope: demResult.maxSlope,
        fatigueIndex: demResult.fatigueIndex,
        summary: {
          totalSamples: limitedProfile.length,
          samplingInterval: validatedSamplingInterval,
          totalDistance,
          queryTime,
        },
      };
    } catch (error: any) {
      this.logger.error(`geo.sampleElevationProfile 查询失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 估算路线长度（使用 Haversine 公式）
   */
  private estimateRouteLength(polyline: Array<{ lat: number; lng: number }>): number {
    if (polyline.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    for (let i = 1; i < polyline.length; i++) {
      const prev = polyline[i - 1];
      const curr = polyline[i];
      totalDistance += this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    }

    return totalDistance;
  }

  /**
   * Haversine 公式计算两点间距离（米）
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
