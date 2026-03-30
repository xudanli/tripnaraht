// src/skills/world/services/world-model-evidence.service.ts
/**
 * 世界模型证据服务
 * 
 * 提供世界模型证据的查询和格式化服务
 * 
 * 2026-02-11 更新：
 * - 统一哲学提取路径，兼容多种数据来源
 * - 统一失败画像提取路径
 * - 添加类型安全，减少 as any 使用
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
import { WorldModelContext, RouteDirectionWithPhilosophy } from '../../../trips/decision/shared/world-model.types';
import { RoutePhilosophy } from '../../../trips/decision/models/route-philosophy.model';
import { 
  FailureProfile, 
  RouteDirectionData, 
  Seasonality, 
  RouteConstraints,
  RiskProfile,
} from '../../../route-directions/interfaces/route-direction.interface';
import { WorldBuildContextInput } from '../world-build-context.skill';

/**
 * 扩展的路线方向接口（包含可能的 uuid 字段）
 */
interface RouteDirectionWithUuid extends RouteDirectionWithPhilosophy {
  uuid?: string;
}

/**
 * 扩展的 RiskProfile 接口（包含 level 字段）
 */
interface ExtendedRiskProfile extends RiskProfile {
  level?: string;
}

/**
 * 扩展的 RouteConstraints 接口（包含 vehicleRequirement 字段）
 */
interface ExtendedRouteConstraints extends RouteConstraints {
  vehicleRequirement?: string;
}

/**
 * 扩展的 Seasonality 接口（兼容 snake_case 和 camelCase）
 */
interface ExtendedSeasonality extends Seasonality {
  best_seasons?: number[];
  avoid_seasons?: number[];
}

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
    const routeDirection = worldModelContext.routeDirection as RouteDirectionWithUuid;
    // 从 uuid、metadata.uuid 或 id 获取路线方向 ID
    const routeDirectionId = this.extractRouteDirectionId(routeDirection);
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
      // 获取行程 POI 标签用于核心体验覆盖验证
      const tripPoiTags = request.tripId 
        ? await this.getTripPoiTags(request.tripId) 
        : [];
      response.philosophy = this.extractPhilosophy(worldModelContext, tripPoiTags);
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
   * 获取行程中所有 POI 的标签
   * 
   * 用于核心体验覆盖验证
   */
  private async getTripPoiTags(tripId: string): Promise<string[]> {
    try {
      // 获取行程的所有 ItineraryItem 及其关联的 Place
      const items = await this.prisma.itineraryItem.findMany({
        where: {
          TripDay: {
            tripId,
          },
        },
        include: {
          Place: {
            select: {
              category: true,
              metadata: true,
              nameCN: true,
            },
          },
        },
      });

      const tags = new Set<string>();

      for (const item of items) {
        if (item.Place) {
          // 从 category 提取标签
          if (item.Place.category) {
            tags.add(item.Place.category);
            // 映射常见 category 到体验标签
            const categoryTags = this.mapCategoryToExperienceTags(item.Place.category);
            categoryTags.forEach(tag => tags.add(tag));
          }

          // 从 metadata 提取标签
          const metadata = item.Place.metadata as Record<string, any> | null;
          if (metadata?.tags && Array.isArray(metadata.tags)) {
            metadata.tags.forEach((tag: string) => tags.add(tag));
          }
          if (metadata?.experienceTags && Array.isArray(metadata.experienceTags)) {
            metadata.experienceTags.forEach((tag: string) => tags.add(tag));
          }

          // 从名称中提取关键词（作为补充）
          const nameTags = this.extractTagsFromName(item.Place.nameCN);
          nameTags.forEach(tag => tags.add(tag));
        }
      }

      return Array.from(tags);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`获取行程 POI 标签失败: ${errorMessage}`);
      return [];
    }
  }

  /**
   * 将 PlaceCategory 映射到体验标签
   */
  private mapCategoryToExperienceTags(category: string): string[] {
    const categoryMap: Record<string, string[]> = {
      // 冰岛相关
      HOT_SPRING: ['温泉', '地热'],
      WATERFALL: ['瀑布', '自然'],
      GLACIER: ['冰川', '高地荒原'],
      VOLCANO: ['火山', '地质'],
      GEYSER: ['间歇泉', '地热'],
      NATIONAL_PARK: ['国家公园', '自然', '高地荒原'],
      HIGHLAND: ['高地荒原', '高地'],
      F_ROAD: ['F路', '越野'],
      // 尼泊尔相关
      TREKKING: ['徒步', '高海拔适应'],
      MOUNTAIN: ['山峰', '高海拔'],
      MONASTERY: ['寺院', '夏尔巴文化'],
      BASECAMP: ['大本营', '珠峰大本营'],
      TEA_HOUSE: ['茶屋', '夏尔巴文化'],
      // 通用
      VIEWPOINT: ['观景点', '自然'],
      ACCOMMODATION: ['住宿'],
      RESTAURANT: ['餐饮'],
      ATTRACTION: ['景点'],
    };

    return categoryMap[category] || [];
  }

  /**
   * 从地点名称中提取体验标签
   */
  private extractTagsFromName(nameCN: string): string[] {
    if (!nameCN) return [];

    const tags: string[] = [];
    const keywords: Record<string, string[]> = {
      '温泉': ['温泉', '地热'],
      '火山': ['火山', '地质'],
      '冰川': ['冰川', '高地荒原'],
      '瀑布': ['瀑布', '自然'],
      '高地': ['高地荒原', '高地'],
      '营地': ['营地', '住宿'],
      '小屋': ['山屋', '住宿'],
      'hut': ['山屋', '住宿'],
      '大本营': ['珠峰大本营', '高海拔'],
      'EBC': ['珠峰大本营', '高海拔'],
      '夏尔巴': ['夏尔巴文化'],
      '寺': ['寺院', '文化'],
    };

    for (const [keyword, relatedTags] of Object.entries(keywords)) {
      if (nameCN.toLowerCase().includes(keyword.toLowerCase())) {
        relatedTags.forEach(tag => tags.push(tag));
      }
    }

    return tags;
  }

  /**
   * 提取路线方向 ID
   * 
   * 按优先级从多个来源提取：uuid、metadata.uuid、id
   */
  private extractRouteDirectionId(routeDirection: RouteDirectionWithUuid | undefined): string | undefined {
    if (!routeDirection) return undefined;
    
    // 优先使用 uuid 字段
    if (routeDirection.uuid) {
      return routeDirection.uuid;
    }
    
    // 从 metadata 中获取
    if (routeDirection.metadata?.uuid) {
      return String(routeDirection.metadata.uuid);
    }
    
    // 最后使用 id
    if (routeDirection.id !== undefined) {
      return String(routeDirection.id);
    }
    
    return undefined;
  }

  /**
   * 构建世界模型上下文
   */
  private async buildWorldModelContext(
    request: WorldModelEvidenceRequestDto,
  ): Promise<WorldModelContext> {
    const input: Partial<WorldBuildContextInput> = {};

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
      input.season = request.month;
    }

    const result = await this.worldBuildContextSkill.execute(input as WorldBuildContextInput);
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
    const seasonality = routeDirection?.seasonality as ExtendedSeasonality | undefined;
    if (seasonality) {
      // 兼容 snake_case 和 camelCase 命名
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
   * 
   * 支持多种数据来源（按优先级）：
   * 1. routeDirection.philosophy（顶层字段，RoutePhilosophy 对象）
   * 2. routeDirection.metadata.philosophy（metadata 中的对象）
   * 3. routeDirection.narrative.philosophy（字符串形式，向后兼容）
   * 
   * @param world 世界模型上下文
   * @param tripPoiTags 行程中 POI 的标签（用于核心体验覆盖验证）
   */
  private extractPhilosophy(
    world: WorldModelContext,
    tripPoiTags: string[] = [],
  ): RoutePhilosophyDto | undefined {
    const routeDirection = world.routeDirection;
    if (!routeDirection) {
      return undefined;
    }

    // 尝试从多个来源提取哲学模型
    const philosophy = this.resolvePhilosophy(routeDirection);
    if (!philosophy) {
      return undefined;
    }

    // 计算核心体验覆盖情况
    const mustVisitTags = philosophy.mustVisitTags || [];
    const coverageStatus: Record<string, boolean> = {};
    
    if (tripPoiTags.length > 0) {
      // 真实验证：检查行程 POI 是否覆盖了必须体验标签
      for (const tag of mustVisitTags) {
        coverageStatus[tag] = this.checkTagCoverage(tag, tripPoiTags);
      }
      this.logger.debug(
        `核心体验覆盖验证: mustVisitTags=${JSON.stringify(mustVisitTags)}, ` +
        `tripPoiTags=${JSON.stringify(tripPoiTags)}, ` +
        `coverageStatus=${JSON.stringify(coverageStatus)}`
      );
    } else {
      // 无行程数据时，标记为未知（null 或默认 true 以便后续验证）
      for (const tag of mustVisitTags) {
        coverageStatus[tag] = true; // 默认值，表示未验证
      }
    }

    return {
      coreStatement: philosophy.coreStatement || '',
      mustVisitTags: mustVisitTags,
      nonNegotiableRules: philosophy.nonNegotiableRules || [],
      flexibleParts: philosophy.flexibleParts || [],
      coverageStatus,
      durationFlexibility: philosophy.durationFlexibility,
    };
  }

  /**
   * 检查标签是否被覆盖
   * 
   * 使用模糊匹配：如果 POI 标签包含目标标签的关键词，则认为覆盖
   */
  private checkTagCoverage(targetTag: string, poiTags: string[]): boolean {
    const normalizedTarget = targetTag.toLowerCase();
    
    // 精确匹配
    if (poiTags.some(tag => tag.toLowerCase() === normalizedTarget)) {
      return true;
    }

    // 模糊匹配：检查是否有 POI 标签包含目标标签
    if (poiTags.some(tag => tag.toLowerCase().includes(normalizedTarget))) {
      return true;
    }

    // 反向模糊匹配：检查目标标签是否包含某个 POI 标签
    if (poiTags.some(tag => normalizedTarget.includes(tag.toLowerCase()))) {
      return true;
    }

    return false;
  }

  /**
   * 从多个来源解析路线哲学
   * 
   * @param routeDirection 路线方向数据
   * @returns RoutePhilosophy 对象或 undefined
   */
  private resolvePhilosophy(routeDirection: RouteDirectionWithPhilosophy): RoutePhilosophy | undefined {
    // 来源 1: 顶层 philosophy 字段（RoutePhilosophy 对象）
    if (routeDirection.philosophy) {
      if (typeof routeDirection.philosophy === 'object') {
        return routeDirection.philosophy as RoutePhilosophy;
      }
      // 如果是字符串，转换为基础对象
      if (typeof routeDirection.philosophy === 'string') {
        return {
          coreStatement: routeDirection.philosophy,
          nonNegotiableRules: [],
          flexibleParts: [],
        };
      }
    }

    // 来源 2: metadata.philosophy
    const metadata = routeDirection.metadata;
    if (metadata?.philosophy) {
      if (typeof metadata.philosophy === 'object') {
        return metadata.philosophy as RoutePhilosophy;
      }
      if (typeof metadata.philosophy === 'string') {
        return {
          coreStatement: metadata.philosophy,
          nonNegotiableRules: [],
          flexibleParts: [],
        };
      }
    }

    // 来源 3: narrative.philosophy（向后兼容）
    const narrative = (routeDirection as RouteDirectionData).narrative;
    if (narrative?.philosophy) {
      return {
        coreStatement: narrative.philosophy,
        nonNegotiableRules: [],
        flexibleParts: [],
      };
    }

    return undefined;
  }

  /**
   * 提取失败画像
   * 
   * 支持多种数据来源（按优先级）：
   * 1. routeDirection.failureProfile（顶层字段）
   * 2. routeDirection.metadata.extensions.failureProfile
   * 3. routeDirection.metadata.failureProfile
   */
  private extractFailureProfile(world: WorldModelContext): FailureProfileDto | undefined {
    const routeDirection = world.routeDirection;
    if (!routeDirection) {
      return undefined;
    }

    // 尝试从多个来源提取失败画像
    const failureProfile = this.resolveFailureProfile(routeDirection);
    if (!failureProfile) {
      return undefined;
    }

    // 处理失败场景
    const failureScenarios = failureProfile.failureScenarios || [];
    const scenarios = failureScenarios.map((scenario) => ({
      day: scenario.day || 0,
      reason: scenario.reason || '',
      mitigation: scenario.mitigation || '',
      typicalUserProfile: scenario.typicalUserProfile,
    }));

    return {
      commonFailureDays: failureProfile.commonFailureDays || [],
      typicalFailureReasons: failureProfile.typicalFailureReason || [],
      rescueDifficulty: failureProfile.rescueDifficulty || 'MEDIUM',
      failureScenarios: scenarios,
    };
  }

  /**
   * 从多个来源解析失败画像
   * 
   * @param routeDirection 路线方向数据
   * @returns FailureProfile 对象或 undefined
   */
  private resolveFailureProfile(routeDirection: RouteDirectionWithPhilosophy): FailureProfile | undefined {
    // 来源 1: 顶层 failureProfile 字段
    const rdData = routeDirection as RouteDirectionData;
    if (rdData.failureProfile) {
      return rdData.failureProfile;
    }

    // 来源 2: metadata.extensions.failureProfile
    const metadata = routeDirection.metadata;
    if (metadata?.extensions?.failureProfile) {
      return metadata.extensions.failureProfile as FailureProfile;
    }

    // 来源 3: metadata.failureProfile
    if (metadata?.failureProfile) {
      return metadata.failureProfile as FailureProfile;
    }

    return undefined;
  }

  /**
   * 提取用户能力匹配
   */
  private extractUserCapabilityMatch(world: WorldModelContext): UserCapabilityMatchDto | undefined {
    const human = world.human;
    const routeDirection = world.routeDirection as RouteDirectionData;
    if (!human || !routeDirection) {
      return undefined;
    }

    // 从 metadata 或顶层字段获取 antiPersona
    const metadata = routeDirection.metadata as Record<string, unknown> | undefined;
    const antiPersona: string[] = routeDirection.antiPersona || 
      (metadata?.antiPersona as string[] | undefined) || [];
    
    // 获取约束条件
    const constraints = routeDirection.constraints as ExtendedRouteConstraints | undefined;
    
    // 获取风险画像
    const riskProfile = routeDirection.riskProfile as ExtendedRiskProfile | undefined;

    // 风险承受度匹配
    const userRiskTolerance = human.riskTolerance || 'MEDIUM';
    const routeRiskLevel = riskProfile?.level || 'medium';
    // 转换为小写进行比较
    const userRiskLower = userRiskTolerance.toLowerCase();
    const riskMatch = !antiPersona.some((p: string) => {
      if (userRiskLower === 'low' && p.includes('低风险')) return true;
      if (userRiskLower === 'high' && p.includes('高风险')) return false; // 高风险用户通常可以匹配高风险路线
      return false;
    });

    // 车辆要求匹配
    const vehicleRequirement = constraints?.vehicleRequirement || 
      (metadata?.vehicleRequired as string | undefined) || 'any';
    const userHasVehicle = true; // 简化：假设用户有车辆，实际应该从用户画像获取

    // 体能匹配
    // 优先从 soft 约束获取，然后从顶层字段获取
    const routeMaxAscent = constraints?.soft?.maxDailyAscentM || 
      constraints?.maxDailyAscentM || 500;
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
