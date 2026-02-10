// src/skills/world/services/world-model-evidence.service.ts
/**
 * 世界模型证据服务
 * 
 * 提供世界模型证据的查询和格式化服务
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorldBuildContextSkill } from '../world-build-context.skill';
import {
  WorldModelEvidenceRequestDto,
  WorldModelEvidenceResponseDto,
  DemEvidenceDto,
  RoadStateDto,
  WeatherWindowDto,
  RoutePhilosophyDto,
  FailureProfileDto,
  UserCapabilityMatchDto,
} from '../dto/world-model-evidence.dto';
import { WorldModelContext } from '../../../trips/decision/shared/world-model.types';

@Injectable()
export class WorldModelEvidenceService {
  private readonly logger = new Logger(WorldModelEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldBuildContextSkill: WorldBuildContextSkill,
  ) {}

  /**
   * 获取世界模型证据
   */
  async getEvidence(request: WorldModelEvidenceRequestDto): Promise<WorldModelEvidenceResponseDto> {
    this.logger.debug(`获取世界模型证据: tripId=${request.tripId}, countryCode=${request.countryCode}`);

    // 1. 构建世界模型上下文
    const worldModelContext = await this.buildWorldModelContext(request);

    // 2. 提取路线方向信息
    const routeDirection = worldModelContext.routeDirection;
    // RouteDirectionData没有uuid，从metadata或id获取
    const routeDirectionId = (routeDirection as any)?.uuid || routeDirection?.id?.toString();
    const routeDirectionName = routeDirection?.nameCN || routeDirection?.name;

    // 3. 构建响应
    const response: WorldModelEvidenceResponseDto = {
      tripId: request.tripId,
      countryCode: worldModelContext.physical?.countryCode || request.countryCode || 'IS',
      routeDirectionId,
      routeDirectionName,
      buildTimestamp: new Date().toISOString(),
    };

    // 4. 根据include参数添加证据
    const include = request.include || 'all';

    if (include === 'all' || include === 'dem') {
      response.demEvidence = this.extractDemEvidence(worldModelContext);
    }

    if (include === 'all' || include === 'road') {
      response.roadStates = this.extractRoadStates(worldModelContext);
    }

    if (include === 'all' || include === 'weather') {
      response.weatherWindow = this.extractWeatherWindow(worldModelContext, request.month);
    }

    if (include === 'all' || include === 'philosophy') {
      response.philosophy = this.extractPhilosophy(worldModelContext);
    }

    if (include === 'all' || include === 'failure') {
      response.failureProfile = this.extractFailureProfile(worldModelContext);
    }

    // 5. 添加用户能力匹配（如果可用）
    if (worldModelContext.human && routeDirection) {
      response.userCapabilityMatch = this.extractUserCapabilityMatch(worldModelContext);
    }

    return response;
  }

  /**
   * 构建世界模型上下文
   */
  private async buildWorldModelContext(
    request: WorldModelEvidenceRequestDto,
  ): Promise<WorldModelContext> {
    const input: any = {};

    if (request.tripId) {
      input.tripId = request.tripId;
    } else if (request.countryCode) {
      input.countryCode = request.countryCode;
    } else {
      throw new BadRequestException('必须提供tripId或countryCode');
    }

    if (request.routeDirectionId) {
      input.routeDirectionId = request.routeDirectionId;
    }

    if (request.month) {
      input.month = request.month;
    }

    const result = await this.worldBuildContextSkill.execute(input);
    return result.world;
  }

  /**
   * 提取DEM证据
   */
  private extractDemEvidence(world: WorldModelContext): DemEvidenceDto | undefined {
    const demEvidence = world.physical?.demEvidence;
    if (!demEvidence || demEvidence.length === 0) {
      return undefined;
    }

    // 计算总距离和累计爬升
    let totalDistanceKm = 0;
    let cumulativeAscentM = 0;
    let maxSlopePct = 0;
    let threeDayRollingAscentM = 0;

    for (const evidence of demEvidence) {
      // 距离在metadata.distanceM中（米），转换为km
      if (evidence.metadata?.distanceM) {
        totalDistanceKm += evidence.metadata.distanceM / 1000;
      }
      // 使用正确的属性名
      if (evidence.cumulativeAscent) {
        cumulativeAscentM = Math.max(cumulativeAscentM, evidence.cumulativeAscent);
      }
      if (evidence.maxSlopePct) {
        maxSlopePct = Math.max(maxSlopePct, evidence.maxSlopePct);
      }
      // 使用rollingAscent3Days而不是threeDayRollingAscentM
      if (evidence.rollingAscent3Days) {
        threeDayRollingAscentM = Math.max(threeDayRollingAscentM, evidence.rollingAscent3Days);
      }
    }

    // 计算疲劳指数（基于累计爬升和距离）
    const fatigueIndex = Math.min(100, Math.round((cumulativeAscentM / 1000) * 30 + (totalDistanceKm / 100) * 10));

    return {
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      cumulativeAscentM: Math.round(cumulativeAscentM),
      maxSlopePct: Math.round(maxSlopePct),
      fatigueIndex,
      threeDayRollingAscentM: Math.round(threeDayRollingAscentM),
      pointCount: demEvidence.length,
    };
  }

  /**
   * 提取道路状态
   */
  private extractRoadStates(world: WorldModelContext): RoadStateDto[] {
    const roadStates = world.physical?.roadStates || [];
    return roadStates.map((road) => {
      // 状态映射：OPEN -> open, CLOSED -> closed, 其他 -> conditional
      let status: 'open' | 'closed' | 'conditional' = 'conditional';
      if (road.status === 'OPEN') {
        status = 'open';
      } else if (road.status === 'CLOSED') {
        status = 'closed';
      }

      // 构建开放时间字符串
      let openPeriod: string | undefined;
      if (road.seasonOpenFrom && road.seasonOpenTo) {
        openPeriod = `${road.seasonOpenFrom}月-${road.seasonOpenTo}月`;
      }

      // 车辆要求
      const vehicleRequirement = road.requires4x4 ? '四驱SUV' : undefined;

      return {
        name: road.roadId || 'Unknown',
        status,
        openPeriod,
        vehicleRequirement,
      };
    });
  }

  /**
   * 提取天气窗口
   */
  private extractWeatherWindow(
    world: WorldModelContext,
    selectedMonth?: number,
  ): WeatherWindowDto | undefined {
    const climateSeasonality = world.physical?.climateSeasonality;
    if (!climateSeasonality) {
      return undefined;
    }

    const bestMonths: number[] = [];
    const avoidMonths: number[] = [];
    let accessibilityScore = climateSeasonality.accessibilityScore || 0.5;

    // ClimateSeasonality没有bestMonths/avoidMonths，需要从RouteDirection获取
    const routeDirection = world.routeDirection;
    const seasonality = routeDirection?.seasonality as any;
    if (seasonality) {
      if (seasonality.best_seasons) {
        bestMonths.push(...seasonality.best_seasons);
      } else if (seasonality.bestMonths) {
        bestMonths.push(...seasonality.bestMonths);
      }
      if (seasonality.avoid_seasons) {
        avoidMonths.push(...seasonality.avoid_seasons);
      } else if (seasonality.avoidMonths) {
        avoidMonths.push(...seasonality.avoidMonths);
      }
    }

    // 如果提供了selectedMonth，使用climateSeasonality的数据
    if (selectedMonth !== undefined && climateSeasonality.month === selectedMonth) {
      accessibilityScore = climateSeasonality.accessibilityScore || 0.5;
    } else if (selectedMonth !== undefined) {
      // 如果没有匹配的月份数据，基于bestMonths和avoidMonths推断
      if (bestMonths.includes(selectedMonth)) {
        accessibilityScore = 0.9;
      } else if (avoidMonths.includes(selectedMonth)) {
        accessibilityScore = 0.2;
      } else {
        accessibilityScore = 0.5;
      }
    }

    // 提取天气详情
    const weatherDetails: WeatherWindowDto['weatherDetails'] = {};
    if (climateSeasonality.typicalWeather) {
      weatherDetails.temperature = climateSeasonality.typicalWeather.temperatureCelsius;
      weatherDetails.windSpeed = climateSeasonality.typicalWeather.windSpeedMps;
      weatherDetails.snowRisk = climateSeasonality.riskFactors?.includes('snow') ? 'HIGH' : 'LOW';
      weatherDetails.visibility = climateSeasonality.typicalWeather.visibilityMeters > 5000 ? 'HIGH' : 'LOW';
    }

    return {
      bestMonths: bestMonths.length > 0 ? bestMonths : [6, 7, 8], // 默认值
      avoidMonths: avoidMonths.length > 0 ? avoidMonths : [12, 1, 2, 3], // 默认值
      accessibilityScore: Math.round(accessibilityScore * 100) / 100,
      selectedMonth,
      weatherDetails: Object.keys(weatherDetails).length > 0 ? weatherDetails : undefined,
    };
  }

  /**
   * 提取路线哲学
   */
  private extractPhilosophy(world: WorldModelContext): RoutePhilosophyDto | undefined {
    const routeDirection = world.routeDirection;
    if (!routeDirection) {
      return undefined;
    }

    const metadata = routeDirection.metadata as any;
    const philosophy = metadata?.philosophy;
    if (!philosophy) {
      return undefined;
    }

    // 计算核心体验覆盖情况（这里简化处理，实际应该检查行程中的POI）
    const mustVisitTags = philosophy.mustVisitTags || [];
    const coverageStatus: Record<string, boolean> = {};
    for (const tag of mustVisitTags) {
      coverageStatus[tag] = true; // 简化：假设已覆盖，实际应该检查行程
    }

    return {
      coreStatement: philosophy.coreStatement || '',
      mustVisitTags: mustVisitTags,
      nonNegotiableRules: philosophy.nonNegotiableRules || [],
      flexibleParts: philosophy.flexibleParts || [],
      coverageStatus,
    };
  }

  /**
   * 提取失败画像
   */
  private extractFailureProfile(world: WorldModelContext): FailureProfileDto | undefined {
    const routeDirection = world.routeDirection;
    if (!routeDirection) {
      return undefined;
    }

    const metadata = routeDirection.metadata as any;
    const failureProfile = metadata?.extensions?.failureProfile;
    if (!failureProfile) {
      return undefined;
    }

    const failureScenarios = failureProfile.failureScenarios || [];
    const scenarios = failureScenarios.map((scenario: any) => ({
      day: scenario.day || 0,
      reason: scenario.reason || '',
      mitigation: scenario.mitigation || '',
    }));

    return {
      commonFailureDays: failureProfile.commonFailureDays || [],
      typicalFailureReasons: failureProfile.typicalFailureReason || [],
      rescueDifficulty: failureProfile.rescueDifficulty || 'MEDIUM',
      failureScenarios: scenarios,
    };
  }

  /**
   * 提取用户能力匹配
   */
  private extractUserCapabilityMatch(world: WorldModelContext): UserCapabilityMatchDto | undefined {
    const human = world.human;
    const routeDirection = world.routeDirection;
    if (!human || !routeDirection) {
      return undefined;
    }

    const metadata = routeDirection.metadata as any;
    const antiPersona = metadata?.antiPersona || [];
    const constraints = routeDirection.constraints as any;

    // 风险承受度匹配
    const userRiskTolerance = human.riskTolerance || 'MEDIUM';
    const routeRiskLevel = routeDirection.riskProfile?.level || 'medium';
    // 转换为小写进行比较
    const userRiskLower = userRiskTolerance.toLowerCase();
    const riskMatch = !antiPersona.some((p: string) => {
      if (userRiskLower === 'low' && p.includes('低风险')) return true;
      if (userRiskLower === 'high' && p.includes('高风险')) return false; // 高风险用户通常可以匹配高风险路线
      return false;
    });

    // 车辆要求匹配（简化处理）
    const vehicleRequirement = constraints?.vehicleRequirement || 'any';
    const userHasVehicle = true; // 简化：假设用户有车辆，实际应该从用户画像获取

    // 体能匹配
    const routeMaxAscent = constraints?.maxDailyAscentM || 500;
    const userMaxAscent = human.maxDailyAscentM || 500;
    const fitnessMatch = userMaxAscent >= routeMaxAscent * 0.8; // 允许20%的容差

    return {
      riskTolerance: {
        route: routeRiskLevel,
        user: userRiskTolerance.toLowerCase(), // 转换为小写以匹配DTO
        match: riskMatch,
      },
      vehicleRequirement: {
        required: vehicleRequirement,
        userHas: userHasVehicle,
        match: userHasVehicle, // 简化处理
      },
      fitness: {
        routeMaxAscent,
        userMaxAscent,
        match: fitnessMatch,
      },
    };
  }
}
