// src/skills/world/avalanche-risk-assessment.skill.ts

/**
 * Avalanche Risk Assessment Skill
 *
 * 用途：
 * - 评估路线上的雪崩风险
 * - 结合地理危险区域、天气条件和地形数据
 * - 为 Gate 提供 ALLOW/ADJUST_REQUIRED/BLOCK 建议
 *
 * 数据来源：
 * - hazard_zones 表 (AVALANCHE 类型)
 * - 天气数据 (温度、风速、降雪)
 * - 地形数据 (坡度、高度)
 *
 * 风险评估规则：
 * - HIGH 风险区 + 恶劣天气 → BLOCK
 * - MEDIUM 风险区 + 恶劣天气 → ADJUST_REQUIRED
 * - HIGH 风险区 + 好天气 → NEED_USER_CONFIRM
 * - LOW 风险区 → ALLOW
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IcelandWeatherRealtimeService } from './services/iceland-weather-realtime.service';

export interface AvalancheRiskInput {
  request_id: string;
  route: Array<{ lat: number; lng: number; name?: string }>;
  countryCode: string;
  month: number; // 1-12
  dateRange?: {
    start: Date;
    end: Date;
  };
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  bufferRadius?: number; // meters, default 2000m for avalanche zones
}

export interface AvalancheHazardZone {
  zoneId: string;
  type: 'AVALANCHE';
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  location?: {
    lat: number;
    lng: number;
  };
  seasonality?: {
    highRiskMonths: number[];
    lowRiskMonths: number[];
  };
  description?: string;
  distanceFromRoute?: number; // meters
}

export interface AvalancheRiskOutput {
  overallRisk: 'safe' | 'low' | 'medium' | 'high' | 'extreme';
  gateRecommendation: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';

  hazardZones: AvalancheHazardZone[];

  riskAssessment: {
    hasHighRisk: boolean;
    hasMediumRisk: boolean;
    totalHazards: number;
    highRiskCount: number;
    mediumRiskCount: number;
    affectedSegments: number;
  };

  weatherFactors?: {
    recentSnowfall: boolean; // 近期降雪 (增加风险)
    temperatureWarming: boolean; // 温度回升 (增加风险)
    highWinds: boolean; // 强风 (增加风险)
    weatherRiskLevel: 'safe' | 'moderate' | 'high' | 'extreme';
  };

  adjustments: string[]; // 建议的调整措施
  blockers: string[]; // 阻塞原因
  warnings: string[]; // 警告信息

  evidence_refs: Array<{
    evidence_id: string;
    source: string;
    confidence: number;
    last_verified_at: string;
    data?: any;
  }>;

  summary: string;
}

@Injectable()
export class AvalancheRiskAssessmentSkill {
  private readonly logger = new Logger(AvalancheRiskAssessmentSkill.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly weatherService: IcelandWeatherRealtimeService,
  ) {}

  async execute(input: AvalancheRiskInput): Promise<AvalancheRiskOutput> {
    const startTime = Date.now();

    this.logger.log(
      `[${input.request_id}] Assessing avalanche risk for route with ${input.route.length} points in ${input.countryCode} (month: ${input.month})`
    );

    try {
      // 1. 查询雪崩危险区
      const hazardZones = await this.queryAvalancheZones(input);

      // 2. 评估天气因素（如果有日期范围）
      const weatherFactors = input.dateRange
        ? await this.assessWeatherFactors(input)
        : undefined;

      // 3. 综合风险评估
      const riskAssessment = this.calculateRiskAssessment(hazardZones);

      // 4. 确定整体风险等级
      const overallRisk = this.determineOverallRisk(
        riskAssessment,
        weatherFactors,
        input.riskTolerance || 'MEDIUM'
      );

      // 5. 生成 Gate 建议
      const gateRecommendation = this.generateGateRecommendation(
        overallRisk,
        riskAssessment,
        weatherFactors
      );

      // 6. 生成调整建议和警告
      const { adjustments, blockers, warnings } = this.generateAdjustments(
        overallRisk,
        riskAssessment,
        weatherFactors,
        hazardZones
      );

      // 7. 构建证据引用
      const evidence_refs = this.buildEvidenceRefs(
        input.request_id,
        hazardZones,
        weatherFactors
      );

      // 8. 生成摘要
      const summary = this.generateSummary(
        overallRisk,
        gateRecommendation,
        riskAssessment,
        weatherFactors
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[${input.request_id}] Avalanche risk assessment completed in ${duration}ms. Overall risk: ${overallRisk}, Gate: ${gateRecommendation}`
      );

      return {
        overallRisk,
        gateRecommendation,
        hazardZones,
        riskAssessment,
        weatherFactors,
        adjustments,
        blockers,
        warnings,
        evidence_refs,
        summary,
      };
    } catch (error) {
      this.logger.error(
        `[${input.request_id}] Avalanche risk assessment failed`,
        error instanceof Error ? error.message : error
      );

      // 降级策略: 返回 NEED_USER_CONFIRM + 警告
      return this.buildDegradedResponse(input.request_id, error);
    }
  }

  /**
   * 查询雪崩危险区域
   */
  private async queryAvalancheZones(
    input: AvalancheRiskInput
  ): Promise<AvalancheHazardZone[]> {
    const bufferRadius = input.bufferRadius || 2000; // 2km default for avalanche zones

    const zones = await this.prisma.$queryRawUnsafe<any[]>(
      `
      WITH route_points AS (
        SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS geom
        UNION ALL
        SELECT ST_SetSRID(ST_MakePoint(unnest($3::float[]), unnest($4::float[])), 4326)::geography
      )
      SELECT
        hz."zoneId",
        hz.type,
        hz.level,
        hz.seasonality,
        hz.description,
        ST_Y(ST_Centroid(hz.geom::geometry)) as lat,
        ST_X(ST_Centroid(hz.geom::geometry)) as lng,
        MIN(ST_Distance(hz.geom, rp.geom)) as distance
      FROM "HazardZone" hz
      CROSS JOIN route_points rp
      WHERE hz."countryCode" = $5
        AND hz.type = 'AVALANCHE'
        AND ST_DWithin(hz.geom, rp.geom, $6)
      GROUP BY hz."zoneId", hz.type, hz.level, hz.seasonality, hz.description, hz.geom
      ORDER BY MIN(ST_Distance(hz.geom, rp.geom)) ASC
      LIMIT 50
      `,
      input.route[0].lng,
      input.route[0].lat,
      input.route.slice(1).map((p) => p.lng),
      input.route.slice(1).map((p) => p.lat),
      input.countryCode,
      bufferRadius
    );

    return zones.map((zone) => ({
      zoneId: zone.zoneId,
      type: 'AVALANCHE' as const,
      level: zone.level as 'HIGH' | 'MEDIUM' | 'LOW',
      location: {
        lat: parseFloat(zone.lat),
        lng: parseFloat(zone.lng),
      },
      seasonality: zone.seasonality as { highRiskMonths: number[]; lowRiskMonths: number[] },
      description: zone.description,
      distanceFromRoute: Math.round(parseFloat(zone.distance)),
    }));
  }

  /**
   * 评估天气因素
   */
  private async assessWeatherFactors(
    input: AvalancheRiskInput
  ): Promise<AvalancheRiskOutput['weatherFactors']> {
    try {
      // 获取关键点的天气预报
      const keyPoints = this.selectKeyPoints(input.route);

      const weatherData = await Promise.all(
        keyPoints.map((point) =>
          this.weatherService.getWeatherByLocation(point.lat, point.lng)
        )
      );

      // Filter out null values and extract weather conditions
      const validWeather = weatherData.filter((w): w is NonNullable<typeof w> => w !== null);

      if (validWeather.length === 0) {
        // No weather data available, return safe defaults
        return {
          recentSnowfall: false,
          temperatureWarming: false,
          highWinds: false,
          weatherRiskLevel: 'safe',
        };
      }

      // 分析天气条件
      const temperatures = validWeather.map((w) => w.temperature ?? 0);
      const windSpeeds = validWeather.map((w) => w.windSpeed ?? 0);
      const precipitation = validWeather.map((w) => w.precipitation ?? 0);

      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
      const maxWind = Math.max(...windSpeeds);
      const totalPrecip = precipitation.reduce((a, b) => a + b, 0);

      // 雪崩相关的天气风险因素
      const recentSnowfall = totalPrecip > 10 && avgTemp < 5; // 近期降雪
      const temperatureWarming = avgTemp > 0 && avgTemp < 10; // 温度回升（融化）
      const highWinds = maxWind > 15; // 强风

      // 综合天气风险等级
      let weatherRiskLevel: 'safe' | 'moderate' | 'high' | 'extreme' = 'safe';

      if ((recentSnowfall && temperatureWarming) || (recentSnowfall && highWinds)) {
        weatherRiskLevel = 'extreme'; // 降雪+融化 或 降雪+强风 = 极高风险
      } else if (recentSnowfall || (temperatureWarming && highWinds)) {
        weatherRiskLevel = 'high';
      } else if (temperatureWarming || highWinds) {
        weatherRiskLevel = 'moderate';
      }

      return {
        recentSnowfall,
        temperatureWarming,
        highWinds,
        weatherRiskLevel,
      };
    } catch (error) {
      this.logger.warn(
        `[${input.request_id}] Weather factor assessment failed, using safe defaults`,
        error instanceof Error ? error.message : error
      );
      return {
        recentSnowfall: false,
        temperatureWarming: false,
        highWinds: false,
        weatherRiskLevel: 'safe',
      };
    }
  }

  /**
   * 选择关键点 (起点、终点、中间点)
   */
  private selectKeyPoints(route: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
    if (route.length <= 3) {
      return route;
    }

    const keyPoints = [
      route[0], // 起点
      route[Math.floor(route.length / 2)], // 中点
      route[route.length - 1], // 终点
    ];

    return keyPoints;
  }

  /**
   * 计算风险评估统计
   */
  private calculateRiskAssessment(zones: AvalancheHazardZone[]): AvalancheRiskOutput['riskAssessment'] {
    const highRiskCount = zones.filter((z) => z.level === 'HIGH').length;
    const mediumRiskCount = zones.filter((z) => z.level === 'MEDIUM').length;

    return {
      hasHighRisk: highRiskCount > 0,
      hasMediumRisk: mediumRiskCount > 0,
      totalHazards: zones.length,
      highRiskCount,
      mediumRiskCount,
      affectedSegments: zones.length, // 简化：每个危险区影响一个路段
    };
  }

  /**
   * 确定整体风险等级
   */
  private determineOverallRisk(
    riskAssessment: AvalancheRiskOutput['riskAssessment'],
    weatherFactors: AvalancheRiskOutput['weatherFactors'] | undefined,
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH'
  ): 'safe' | 'low' | 'medium' | 'high' | 'extreme' {
    // 地理风险基线
    let baseRisk: 'safe' | 'low' | 'medium' | 'high' | 'extreme' = 'safe';

    if (riskAssessment.hasHighRisk) {
      baseRisk = 'high';
    } else if (riskAssessment.hasMediumRisk) {
      baseRisk = 'medium';
    } else if (riskAssessment.totalHazards > 0) {
      baseRisk = 'low';
    }

    // 天气因素调整
    if (weatherFactors) {
      if (weatherFactors.weatherRiskLevel === 'extreme') {
        // 极端天气 + 任何地理风险 = extreme
        if (baseRisk !== 'safe') {
          return 'extreme';
        }
        baseRisk = 'high';
      } else if (weatherFactors.weatherRiskLevel === 'high') {
        // 高天气风险 + 地理风险 → 提升一级
        if (baseRisk === 'high') return 'extreme';
        if (baseRisk === 'medium') return 'high';
        if (baseRisk === 'low') return 'medium';
      } else if (weatherFactors.weatherRiskLevel === 'moderate') {
        // 中度天气风险 + 高地理风险 → 提升
        if (baseRisk === 'high') return 'extreme';
        if (baseRisk === 'medium') return 'high';
      }
    }

    // 风险容忍度调整
    if (riskTolerance === 'LOW' && baseRisk === 'medium') {
      return 'high'; // 低容忍度下，medium 视为 high
    }
    if (riskTolerance === 'HIGH' && baseRisk === 'medium') {
      return 'low'; // 高容忍度下，medium 视为 low
    }

    return baseRisk;
  }

  /**
   * 生成 Gate 建议
   */
  private generateGateRecommendation(
    overallRisk: string,
    riskAssessment: AvalancheRiskOutput['riskAssessment'],
    weatherFactors: AvalancheRiskOutput['weatherFactors'] | undefined
  ): 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM' {
    // 极高风险 → BLOCK
    if (overallRisk === 'extreme') {
      return 'BLOCK';
    }

    // 高风险 + 恶劣天气 → BLOCK
    if (overallRisk === 'high' && weatherFactors?.weatherRiskLevel === 'extreme') {
      return 'BLOCK';
    }

    // 高风险 → ADJUST_REQUIRED
    if (overallRisk === 'high') {
      return 'ADJUST_REQUIRED';
    }

    // 中等风险 + 高天气风险 → ADJUST_REQUIRED
    if (overallRisk === 'medium' && weatherFactors?.weatherRiskLevel === 'high') {
      return 'ADJUST_REQUIRED';
    }

    // 中等风险 → NEED_USER_CONFIRM
    if (overallRisk === 'medium') {
      return 'NEED_USER_CONFIRM';
    }

    // 低风险或安全 → ALLOW
    return 'ALLOW';
  }

  /**
   * 生成调整建议、阻塞原因和警告
   */
  private generateAdjustments(
    overallRisk: string,
    riskAssessment: AvalancheRiskOutput['riskAssessment'],
    weatherFactors: AvalancheRiskOutput['weatherFactors'] | undefined,
    hazardZones: AvalancheHazardZone[]
  ): {
    adjustments: string[];
    blockers: string[];
    warnings: string[];
  } {
    const adjustments: string[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 阻塞原因
    if (overallRisk === 'extreme') {
      blockers.push('Extreme avalanche risk detected - route is too dangerous');

      if (weatherFactors?.recentSnowfall && weatherFactors?.temperatureWarming) {
        blockers.push('Recent snowfall combined with warming temperatures creates critical avalanche conditions');
      }

      if (riskAssessment.highRiskCount > 0) {
        blockers.push(`Route passes through ${riskAssessment.highRiskCount} high-risk avalanche zone(s)`);
      }
    }

    // 调整建议
    if (overallRisk === 'high' || overallRisk === 'extreme') {
      adjustments.push('CHANGE_DATES: Postpone trip until avalanche risk decreases');
      adjustments.push('CHANGE_ROUTE: Select alternative route avoiding avalanche zones');

      if (weatherFactors?.recentSnowfall) {
        adjustments.push('Wait at least 48-72 hours after snowfall for snow to stabilize');
      }

      if (hazardZones.length > 0) {
        const highRiskZones = hazardZones.filter((z) => z.level === 'HIGH');
        if (highRiskZones.length > 0) {
          adjustments.push(`Avoid high-risk zones: ${highRiskZones.map((z) => z.description || z.zoneId).join(', ')}`);
        }
      }
    }

    if (overallRisk === 'medium') {
      adjustments.push('Consider hiring local guide familiar with avalanche safety');
      adjustments.push('Carry avalanche safety equipment (beacon, probe, shovel)');
      adjustments.push('Check latest avalanche bulletin before departure');
    }

    // 警告信息
    if (riskAssessment.hasMediumRisk) {
      warnings.push(`Route passes through ${riskAssessment.mediumRiskCount} medium-risk avalanche zone(s)`);
    }

    if (weatherFactors?.highWinds) {
      warnings.push('High winds detected - can trigger wind-slab avalanches');
    }

    if (weatherFactors?.temperatureWarming) {
      warnings.push('Warming temperatures increase wet-snow avalanche risk');
    }

    return { adjustments, blockers, warnings };
  }

  /**
   * 构建证据引用
   */
  private buildEvidenceRefs(
    request_id: string,
    hazardZones: AvalancheHazardZone[],
    weatherFactors: AvalancheRiskOutput['weatherFactors'] | undefined
  ): AvalancheRiskOutput['evidence_refs'] {
    const evidence_refs: AvalancheRiskOutput['evidence_refs'] = [];

    // 危险区域证据
    if (hazardZones.length > 0) {
      evidence_refs.push({
        evidence_id: `${request_id}-avalanche-zones`,
        source: 'hazard_zones_database',
        confidence: 0.9,
        last_verified_at: new Date().toISOString(),
        data: {
          total_zones: hazardZones.length,
          high_risk_count: hazardZones.filter((z) => z.level === 'HIGH').length,
          zone_ids: hazardZones.map((z) => z.zoneId),
        },
      });
    }

    // 天气证据
    if (weatherFactors) {
      evidence_refs.push({
        evidence_id: `${request_id}-avalanche-weather`,
        source: 'iceland_weather_realtime',
        confidence: 0.8,
        last_verified_at: new Date().toISOString(),
        data: {
          weather_risk_level: weatherFactors.weatherRiskLevel,
          recent_snowfall: weatherFactors.recentSnowfall,
          temperature_warming: weatherFactors.temperatureWarming,
          high_winds: weatherFactors.highWinds,
        },
      });
    }

    return evidence_refs;
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    overallRisk: string,
    gateRecommendation: string,
    riskAssessment: AvalancheRiskOutput['riskAssessment'],
    weatherFactors: AvalancheRiskOutput['weatherFactors'] | undefined
  ): string {
    const parts: string[] = [];

    parts.push(`Overall avalanche risk: ${overallRisk.toUpperCase()}`);
    parts.push(`Gate recommendation: ${gateRecommendation}`);

    if (riskAssessment.totalHazards > 0) {
      parts.push(
        `Found ${riskAssessment.totalHazards} avalanche zone(s) near route ` +
        `(${riskAssessment.highRiskCount} high-risk, ${riskAssessment.mediumRiskCount} medium-risk)`
      );
    } else {
      parts.push('No avalanche zones detected near route');
    }

    if (weatherFactors) {
      const weatherConditions: string[] = [];
      if (weatherFactors.recentSnowfall) weatherConditions.push('recent snowfall');
      if (weatherFactors.temperatureWarming) weatherConditions.push('warming temperatures');
      if (weatherFactors.highWinds) weatherConditions.push('high winds');

      if (weatherConditions.length > 0) {
        parts.push(`Weather factors: ${weatherConditions.join(', ')}`);
      }
    }

    return parts.join('. ');
  }

  /**
   * 构建降级响应（当数据获取失败时）
   */
  private buildDegradedResponse(request_id: string, error: any): AvalancheRiskOutput {
    this.logger.warn(`[${request_id}] Building degraded avalanche risk response due to error`);

    return {
      overallRisk: 'medium', // 保守估计
      gateRecommendation: 'NEED_USER_CONFIRM', // 需要用户确认
      hazardZones: [],
      riskAssessment: {
        hasHighRisk: false,
        hasMediumRisk: false,
        totalHazards: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        affectedSegments: 0,
      },
      adjustments: [
        'Unable to verify avalanche risk - check local avalanche bulletin before departure',
        'Consider hiring local guide familiar with current conditions',
      ],
      blockers: [],
      warnings: [
        'Avalanche risk assessment service unavailable',
        'Proceed with caution and verify current conditions independently',
      ],
      evidence_refs: [
        {
          evidence_id: `${request_id}-avalanche-degraded`,
          source: 'avalanche_risk_skill_fallback',
          confidence: 0.3,
          last_verified_at: new Date().toISOString(),
          data: {
            degraded: true,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
      ],
      summary: 'Avalanche risk assessment unavailable - manual verification required. Recommend checking local avalanche bulletin and hiring experienced guide.',
    };
  }
}
