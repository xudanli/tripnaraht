// src/skills/world/world-build-context.skill.ts
/**
 * skill.world.buildContext
 * 
 * 用途：给定 tripId（或原始参数），一次性拉齐 WorldModelContext 所需的一切：
 * - PhysicalRealityModel
 * - HumanCapabilityModel
 * - RoutePhilosophyModel / RouteDirection
 * 
 * 输入：tripId 或 { countryCode, season, duration, partyProfile }
 * 输出：WorldModelContext + missingPieces
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { PhysicalRealityModel, validatePhysicalRealityModel } from '../../trips/decision/models/physical-reality.model';
import { HumanCapabilityModel } from '../../trips/decision/models/human-capability.model';
import { createHumanCapabilityModelFromProfile } from '../../trips/decision/models/human-capability.model';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
import { CacheService } from '../../common/cache/cache.service';
import { CountryConfigService } from './services/country-config.service';
import * as crypto from 'crypto';

/**
 * 错误严重级别
 */
enum ErrorSeverity {
  CRITICAL = 'critical',    // 必须抛出，不能降级
  HIGH = 'high',            // 可以降级，但记录warning
  MEDIUM = 'medium',        // 可以降级，记录info
  LOW = 'low',              // 可以忽略
}

/**
 * 世界模型构建错误
 */
class WorldModelError extends Error {
  constructor(
    message: string,
    public severity: ErrorSeverity,
    public recoverable: boolean = true,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'WorldModelError';
  }
}

export interface WorldBuildContextInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或原始参数 */
  countryCode?: string;
  /** 季节（月份 1-12） */
  season?: number;
  /** 行程天数 */
  duration?: number;
  /** 团队画像 */
  partyProfile?: {
    mobilityProfile?: string;
    riskTolerance?: 'low' | 'medium' | 'high';
    fitness?: 'low' | 'medium' | 'high';
    pace?: 'relaxed' | 'moderate' | 'intense';
    drivingFatiguePreferences?: import('../../trips/decision/models/human-capability.model').DrivingFatiguePreferencesInput;
  };
  /** 路线方向 ID（可选） */
  routeDirectionId?: string;
  /** 用户 ID（可选，用于从 Memory 读取 UserTravelProfile.drivingFatiguePreferences） */
  userId?: string;
}

export interface WorldBuildContextOutput extends SkillOutput {
  /** 世界模型上下文 */
  world: WorldModelContext;
  /** 缺失的数据片段 */
  missingPieces: {
    demGaps?: string[]; // DEM 缺口
    humanProfileIncomplete?: boolean; // HumanProfile 不够细
    routeDirectionMissing?: boolean; // 缺少路线方向
    physicalRealityIncomplete?: boolean; // 物理现实不完整
  };
}

@Injectable()
export class WorldBuildContextSkill implements Skill<WorldBuildContextInput, WorldBuildContextOutput> {
  private readonly logger = new Logger(WorldBuildContextSkill.name);

  metadata = {
    name: 'world.buildContext',
    description: '构建完整的世界模型上下文（PhysicalRealityModel + HumanCapabilityModel + RouteDirection），一次性拉齐决策所需的所有数据',
    version: '1.0.0',
    category: 'world' as const,
    inputSchema: {
      dependencies: [
        { param: 'countryCode', alternatives: ['tripId'] },
        { param: 'tripId', alternatives: ['countryCode'] },
      ],
      extractors: {
        tripId: 'tripId',
        countryCode: 'countryCode',
      },
    },
  };

  // 缓存配置
  private readonly cachePrefix = 'world_model:';
  private readonly cacheTtlSeconds = 3600; // 1小时TTL（世界模型数据相对稳定）

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
    @Optional() private readonly exaIntegration?: ExaIntegrationService,
    @Optional() private readonly demEffortMetadataService?: DEMEffortMetadataService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly countryConfigService?: CountryConfigService,
  ) {
    if (this.cacheService) {
      this.logger.log('✅ 世界模型缓存已启用');
    } else {
      this.logger.debug('⚠️ 缓存服务不可用，世界模型构建将不使用缓存');
    }
  }

  async execute(input: WorldBuildContextInput): Promise<WorldBuildContextOutput> {
    this.logger.debug(`执行 world.buildContext: tripId=${input.tripId || 'none'}, countryCode=${input.countryCode || 'none'}`);

    // 生成缓存键
    const cacheKey = this.generateCacheKey(input);

    // 尝试从缓存获取
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get<WorldBuildContextOutput>(cacheKey);
        if (cached) {
          this.logger.debug(`✅ 从缓存获取世界模型: ${cacheKey}`);
          return cached;
        }
      } catch (error: any) {
        this.logger.warn(`缓存获取失败: ${error.message}，继续构建`);
      }
    }

    const missingPieces: WorldBuildContextOutput['missingPieces'] = {};

    try {
      let trip: any = null;
      let countryCode: string;
      let season: number;
      let routeDirectionId: string | undefined;
      let partyProfile: WorldBuildContextInput['partyProfile'];

      // 1. 获取基础数据
      if (input.tripId) {
        // 从 tripId 获取数据（包含 ItineraryItem 和 Place 的坐标）
        trip = await this.prisma.trip.findUnique({
          where: { id: input.tripId },
          include: {
            TripDay: {
              include: {
                ItineraryItem: {
                  include: {
                    Place: true,
                  },
                  orderBy: {
                    order: 'asc',
                  },
                },
              },
              orderBy: {
                date: 'asc',
              },
            },
          },
        });

        if (!trip) {
          throw new WorldModelError(
            `行程不存在: ${input.tripId}`,
            ErrorSeverity.CRITICAL,
            false,
            { tripId: input.tripId }
          );
        }

        // 优先从 metadata 获取 countryCode，然后是 destination，最后是输入参数
        const tripMetadata = trip.metadata as any;
        countryCode = tripMetadata?.countryCode || trip.destination || trip.countryCode || input.countryCode || '';
        season = trip.startDate ? new Date(trip.startDate).getMonth() + 1 : (input.season || 1);
        routeDirectionId = (trip as any).routeDirectionId || input.routeDirectionId;
        
        // 从 trip 提取 partyProfile
        const pacingConfig = trip.pacingConfig as any;
        const tripMeta = trip.metadata as any;
        partyProfile = {
          mobilityProfile: pacingConfig?.mobilityProfile,
          riskTolerance: pacingConfig?.riskTolerance,
          fitness: pacingConfig?.fitness,
          pace: pacingConfig?.pace,
          drivingFatiguePreferences:
            pacingConfig?.drivingFatiguePreferences ?? tripMeta?.userProfile?.drivingFatiguePreferences,
        };
      } else {
        // 使用原始参数
        countryCode = input.countryCode || '';
        season = input.season || 1;
        routeDirectionId = input.routeDirectionId;
        partyProfile = input.partyProfile;
      }

      if (!countryCode) {
        throw new WorldModelError(
          'countryCode 是必需的（可通过 tripId 或直接传入）',
          ErrorSeverity.CRITICAL,
          false
        );
      }

      // 2. 构建 HumanCapabilityModel
      const human = this.buildHumanCapabilityModel(partyProfile);
      if (!human) {
        missingPieces.humanProfileIncomplete = true;
      }

      // 3. 获取 RouteDirection
      let routeDirection: any;
      if (!this.routeDirectionsService) {
        this.logger.warn('RouteDirectionsService 不可用，将使用空的 RouteDirection');
        missingPieces.routeDirectionMissing = true;
      } else {
        try {
          if (routeDirectionId) {
            routeDirection = await this.routeDirectionsService.findRouteDirectionByUuid(routeDirectionId);
          } else {
            // 如果没有指定，尝试获取第一个可用的
            const routeDirectionsResult = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
              month: season,
              limit: 1,
            });
            routeDirection = routeDirectionsResult.active?.[0];
          }
        } catch (error: any) {
          this.logger.warn(`获取 RouteDirection 失败: ${error?.message || error}`);
          missingPieces.routeDirectionMissing = true;
        }
      }

      if (!routeDirection) {
        this.logger.warn(`未找到 RouteDirection (country: ${countryCode}, season: ${season})，将使用空 RouteDirection`);
        missingPieces.routeDirectionMissing = true;
        // 创建一个最小的 RouteDirection 对象以继续构建
        routeDirection = {
          id: 'unknown',
          uuid: 'unknown',
          name: `Unknown Route for ${countryCode}`,
          countryCode,
          tags: [],
        };
      }

      // 4. 构建 PhysicalRealityModel
      // 4.1 尝试生成 DEM 证据
      let demEvidence: PhysicalRealityModel['demEvidence'] = [];
      
      // 4.1.1 优先：从实际行程路线生成 DEM 证据
      if (trip && trip.TripDay && trip.TripDay.length > 0 && this.demEffortMetadataService) {
        try {
          // 提取所有行程项的坐标
          const routePoints: Array<{ lat: number; lng: number }> = [];
          
          for (const day of trip.TripDay) {
            if (day.ItineraryItem && day.ItineraryItem.length > 0) {
              for (const item of day.ItineraryItem) {
                // 优先从 Place.location 获取坐标，然后从 metadata
                let lat: number | null = null;
                let lng: number | null = null;
                
                if (item.Place?.location) {
                  // 从 PostGIS geography 提取坐标
                  const locationResult: any = await this.prisma.$queryRaw`
                    SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                    FROM "Place"
                    WHERE id = ${item.Place.id}
                  `;
                  if (locationResult?.[0]) {
                    lat = parseFloat(locationResult[0].lat);
                    lng = parseFloat(locationResult[0].lng);
                  }
                }
                
                // 如果从 location 获取失败，尝试从 metadata
                if (!lat || !lng) {
                  const itemMetadata = (item as any).metadata as any;
                  const placeMetadata = item.Place?.metadata as any;
                  const coords = itemMetadata?.coordinates || placeMetadata?.coordinates;
                  if (coords && typeof coords === 'object' && 'lat' in coords && 'lng' in coords) {
                    lat = coords.lat;
                    lng = coords.lng;
                  }
                }
                
                if (lat && lng) {
                  routePoints.push({ lat, lng });
                }
              }
            }
          }
          
          // 如果有足够的路线点，生成 DEM 证据
          if (routePoints.length >= 2) {
            this.logger.debug(`从行程提取 ${routePoints.length} 个路线点，生成 DEM 证据`);
            
            const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(
              routePoints,
              {
                activityType: 'driving', // 冰岛 F 路主要是驾车
                samplingInterval: 100,
                includeElevationProfile: true,
              }
            );
            
            // 计算3天滚动累计爬升（简化版：使用总爬升的估算）
            const days = trip.TripDay.length;
            const avgDailyAscent = effortMetadata.totalAscent / days;
            const rollingAscent3Days = Math.min(effortMetadata.totalAscent, avgDailyAscent * 3);
            
            // 计算疲劳指数（简化版）
            const fatigueIndex = Math.min(100, 
              (effortMetadata.totalAscent / 1000) * 10 + 
              (effortMetadata.maxSlope / 10) + 
              (effortMetadata.totalDistance / 100000)
            );
            
            // 转换为 DemDecisionEvidence 格式
            demEvidence = [{
              segmentId: `trip_${input.tripId}_full_route`,
              elevationProfile: effortMetadata.elevationProfile?.map(p => p.elevation) || [],
              cumulativeAscent: effortMetadata.totalAscent,
              maxSlopePct: effortMetadata.maxSlope,
              rollingAscent3Days,
              fatigueIndex,
              violation: 'NONE',
              explanation: `基于实际行程路线生成：${routePoints.length} 个路线点，总距离 ${(effortMetadata.totalDistance / 1000).toFixed(1)}km，累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m`,
              metadata: {
                elevationRange: {
                  min: effortMetadata.minElevation,
                  max: effortMetadata.maxElevation,
                },
                distanceM: effortMetadata.totalDistance,
                avgSlopePct: effortMetadata.avgSlope,
              },
            }];
            
            this.logger.debug(`DEM 证据生成成功：累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m，最大坡度 ${effortMetadata.maxSlope.toFixed(2)}%`);
          } else {
            this.logger.warn(`行程路线点不足（${routePoints.length} 个），尝试从RouteDirection生成DEM证据`);
          }
        } catch (error: any) {
          // 区分错误类型
          if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
            throw error; // 重新抛出critical错误
          }
          this.logger.warn(`从行程生成 DEM 证据失败: ${error?.message || error}，尝试从RouteDirection生成`);
        }
      }
      
      // 4.1.2 降级：从RouteDirection的corridorGeom生成DEM证据（计划生成阶段）
      if (demEvidence.length === 0 && routeDirection && this.demEffortMetadataService) {
        try {
          // 检查RouteDirection是否有corridorGeom
          const corridorGeom = (routeDirection as any).corridorGeom;
          
          if (corridorGeom) {
            this.logger.debug(`从RouteDirection的corridorGeom生成DEM证据`);
            
            // 从PostGIS geometry提取坐标点
            const routePoints = await this.extractPointsFromCorridorGeometry(corridorGeom);
            
            if (routePoints.length >= 2) {
              this.logger.debug(`从corridorGeom提取 ${routePoints.length} 个路线点`);
              
              const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(
                routePoints,
                {
                  activityType: 'driving',
                  samplingInterval: 100,
                  includeElevationProfile: true,
                }
              );
              
              // 估算3天滚动累计爬升（基于总爬升和天数）
              const estimatedDays = input.duration || 8;
              const avgDailyAscent = effortMetadata.totalAscent / estimatedDays;
              const rollingAscent3Days = Math.min(effortMetadata.totalAscent, avgDailyAscent * 3);
              
              // 计算疲劳指数
              const fatigueIndex = Math.min(100, 
                (effortMetadata.totalAscent / 1000) * 10 + 
                (effortMetadata.maxSlope / 10) + 
                (effortMetadata.totalDistance / 100000)
              );
              
              demEvidence = [{
                segmentId: `route_${routeDirection.uuid || routeDirection.id}_corridor`,
                elevationProfile: effortMetadata.elevationProfile?.map(p => p.elevation) || [],
                cumulativeAscent: effortMetadata.totalAscent,
                maxSlopePct: effortMetadata.maxSlope,
                rollingAscent3Days,
                fatigueIndex,
                violation: 'NONE',
                explanation: `基于RouteDirection corridorGeom生成（source: route_direction_corridor）：${routePoints.length} 个路线点，总距离 ${(effortMetadata.totalDistance / 1000).toFixed(1)}km，累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m`,
                metadata: {
                  elevationRange: {
                    min: effortMetadata.minElevation,
                    max: effortMetadata.maxElevation,
                  },
                  distanceM: effortMetadata.totalDistance,
                  avgSlopePct: effortMetadata.avgSlope,
                },
              }];
              
              this.logger.debug(`从RouteDirection生成DEM证据成功：累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m，最大坡度 ${effortMetadata.maxSlope.toFixed(2)}%`);
            } else {
              this.logger.warn(`从corridorGeom提取的路线点不足（${routePoints.length} 个）`);
            }
          } else {
            this.logger.debug(`RouteDirection没有corridorGeom，无法生成DEM证据`);
          }
        } catch (error: any) {
          // 区分错误类型
          if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
            throw error; // 重新抛出critical错误
          }
          this.logger.warn(`从RouteDirection生成DEM证据失败: ${error?.message || error}`);
        }
      }
      
      // 4.1.3 最后降级：使用占位符
      if (demEvidence.length === 0) {
        demEvidence = [
          {
            segmentId: 'placeholder_no_plan_yet',
            elevationProfile: [],
            cumulativeAscent: 0,
            maxSlopePct: 0,
            rollingAscent3Days: 0,
            fatigueIndex: 0,
            violation: 'NONE',
            explanation: trip 
              ? '占位符：行程路线点不足或坐标信息缺失，DEM 证据将在路线规划完成后填充'
              : routeDirection
              ? '占位符：RouteDirection没有corridorGeom，DEM 证据将在计划生成后填充'
              : '占位符：计划生成阶段尚未有具体路线，DEM 证据将在计划生成后填充',
          },
        ];
        missingPieces.physicalRealityIncomplete = true;
      } else {
        // 如果成功生成DEM证据，清除不完整标记
        missingPieces.physicalRealityIncomplete = false;
      }
      
      // 4.2 验证输入参数
      this.validateInputParameters(countryCode, season);

      const physical: PhysicalRealityModel = {
        demEvidence,
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode,
        month: season,
      };

      // 4.3 验证PhysicalRealityModel
      const physicalValidation = validatePhysicalRealityModel(physical);
      if (!physicalValidation.valid) {
        this.logger.warn(`PhysicalRealityModel 验证失败，缺失字段: ${physicalValidation.missingFields.join(', ')}`);
        // 不阻塞，但记录警告
      }

      // 4.5 补充实时信息（Exa 集成）
      if (this.exaIntegration && routeDirection) {
        try {
          const routeName = routeDirection.name || routeDirectionId || '';
          const realTimeRiskInfo = await this.exaIntegration.searchRealTimeRisks(
            countryCode,
            routeName,
            season,
            new Date().getFullYear(),
          );

          // 如果检测到实时风险，补充到 roadStates 或 hazardZones
          if (realTimeRiskInfo.hasRisk) {
            this.logger.debug(`检测到实时风险信息: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription}`);
            
            if (realTimeRiskInfo.riskType === 'ROAD_CLOSED' || realTimeRiskInfo.riskType === 'TRANSPORT') {
              // 补充到 roadStates
              physical.roadStates.push({
                roadId: `realtime_${Date.now()}`,
                status: 'CLOSED',
                metadata: {
                  reason: realTimeRiskInfo.riskDescription || '实时信息显示道路封闭',
                  source: 'EXA_REALTIME',
                  riskType: realTimeRiskInfo.riskType,
                  confidence: realTimeRiskInfo.confidence,
                },
              });
            } else if (realTimeRiskInfo.riskType === 'WEATHER' || 
                       realTimeRiskInfo.riskType === 'GEOLOGICAL') {
              // 补充到 hazardZones
              // 注意：HazardZoneState.type 是枚举，WEATHER 对应 FLOOD/ICE，GEOLOGICAL 对应 MUDSLIDE/VOLCANIC
              const hazardType = realTimeRiskInfo.riskType === 'WEATHER' 
                ? 'FLOOD' // 或 'ICE'，根据描述判断
                : 'MUDSLIDE'; // 或 'VOLCANIC'，根据描述判断
              
              physical.hazardZones.push({
                zoneId: `realtime_${Date.now()}`,
                type: hazardType,
                level: 'HIGH',
                seasonality: {
                  highRiskMonths: [season],
                  lowRiskMonths: [], // 补充缺失字段
                },
                metadata: {
                  description: realTimeRiskInfo.riskDescription || '实时信息显示高风险',
                  source: 'EXA_REALTIME',
                  riskType: realTimeRiskInfo.riskType,
                  confidence: realTimeRiskInfo.confidence,
                },
              });
            }
          }
        } catch (error: any) {
          this.logger.warn(`Exa real-time info search failed: ${error.message}, continuing without real-time data`);
          // 降级：继续构建，不阻塞
        }
      }

      // 检查 DEM 数据完整性
      // 如果DEM证据是占位符，标记为不完整
      if (demEvidence.length > 0 && demEvidence[0].segmentId === 'placeholder_no_plan_yet') {
        missingPieces.physicalRealityIncomplete = true;
      }

      // 5. 构建合规证据
      const complianceEvidence = this.buildComplianceEvidence(routeDirection);

      // 6. 组装 WorldModelContext
      const world: WorldModelContext = {
        physical,
        human: human || createHumanCapabilityModelFromProfile('default', { pace: 'normal', fitness: 'medium', riskTolerance: 'medium' }),
        routeDirection: routeDirection as any,
        complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
      };

      // 7. 验证WorldModelContext完整性
      const worldValidation = this.validateWorldModelContext(world);
      if (!worldValidation.valid) {
        this.logger.error(`WorldModelContext验证失败: ${worldValidation.errors.join('; ')}`);
        // 对于critical错误，抛出异常
        if (worldValidation.errors.length > 0) {
          throw new WorldModelError(
            `WorldModelContext验证失败: ${worldValidation.errors.join('; ')}`,
            ErrorSeverity.CRITICAL,
            false,
            { errors: worldValidation.errors, warnings: worldValidation.warnings }
          );
        }
      }
      if (worldValidation.warnings.length > 0) {
        this.logger.warn(`WorldModelContext验证警告: ${worldValidation.warnings.join('; ')}`);
      }

      const result: WorldBuildContextOutput = {
        world,
        missingPieces,
      };

      // 写入缓存
      if (this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, this.cacheTtlSeconds);
          this.logger.debug(`✅ 世界模型已存入缓存: ${cacheKey} (TTL: ${this.cacheTtlSeconds}s)`);
        } catch (error: any) {
          this.logger.warn(`缓存写入失败: ${error.message}`);
        }
      }

      return result;
    } catch (error: any) {
      // 如果是WorldModelError，根据严重级别处理
      if (error instanceof WorldModelError) {
        if (error.severity === ErrorSeverity.CRITICAL) {
          this.logger.error(`构建 WorldModelContext 失败（CRITICAL）: ${error.message}`, error.stack);
          throw error; // 重新抛出critical错误
        } else {
          this.logger.warn(`构建 WorldModelContext 失败（${error.severity}）: ${error.message}`, error.context);
          // 对于非critical错误，可以返回部分结果或使用降级策略
          throw error; // 暂时还是抛出，后续可以改为返回部分结果
        }
      } else {
        // 未知错误，视为critical
        this.logger.error(`构建 WorldModelContext 失败（未知错误）: ${error.message}`, error.stack);
        throw new WorldModelError(
          `构建 WorldModelContext 失败: ${error.message}`,
          ErrorSeverity.CRITICAL,
          false,
          { originalError: error.message }
        );
      }
    }
  }

  private buildHumanCapabilityModel(
    partyProfile?: WorldBuildContextInput['partyProfile']
  ): HumanCapabilityModel | null {
    if (!partyProfile) {
      return null;
    }

    const paceMap: Record<string, 'slow' | 'normal' | 'fast'> = {
      relaxed: 'slow',
      moderate: 'normal',
      intense: 'fast',
    };

    return createHumanCapabilityModelFromProfile(
      `party-${Date.now()}`,
      {
        pace: paceMap[partyProfile.pace || 'moderate'] || 'normal',
        fitness: partyProfile.fitness || 'medium',
        riskTolerance: partyProfile.riskTolerance || 'medium',
        drivingFatiguePreferences: partyProfile.drivingFatiguePreferences,
      }
    );
  }

  private buildComplianceEvidence(_routeDirection: any): any[] {
    // 简化实现，实际应该从 RouteDirection 中提取合规规则
    return [];
  }

  /**
   * 验证输入参数
   */
  private validateInputParameters(countryCode: string, season: number): void {
    // 验证countryCode
    if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
      throw new WorldModelError(
        `无效的countryCode: ${countryCode}，必须是2位ISO国家代码`,
        ErrorSeverity.CRITICAL,
        false,
        { countryCode }
      );
    }

    // 验证season（月份）
    if (!Number.isInteger(season) || season < 1 || season > 12) {
      throw new WorldModelError(
        `无效的season: ${season}，必须是1-12之间的整数`,
        ErrorSeverity.CRITICAL,
        false,
        { season }
      );
    }
  }

  /**
   * 生成缓存键
   * 基于输入参数生成唯一缓存键
   */
  private generateCacheKey(input: WorldBuildContextInput): string {
    // 构建缓存键的组成部分
    const parts: string[] = [];
    
    if (input.tripId) {
      parts.push(`trip:${input.tripId}`);
    } else {
      parts.push(`country:${input.countryCode || 'unknown'}`);
      parts.push(`season:${input.season || 1}`);
      if (input.routeDirectionId) {
        parts.push(`route:${input.routeDirectionId}`);
      }
      // 包含partyProfile的哈希（如果存在）
      if (input.partyProfile) {
        const profileHash = crypto
          .createHash('md5')
          .update(JSON.stringify(input.partyProfile))
          .digest('hex')
          .substring(0, 8);
        parts.push(`profile:${profileHash}`);
      }
    }

    const key = `${this.cachePrefix}${parts.join(':')}`;
    return key;
  }

  /**
   * 验证WorldModelContext完整性
   */
  private validateWorldModelContext(world: WorldModelContext): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证PhysicalRealityModel
    const physicalValidation = validatePhysicalRealityModel(world.physical);
    if (!physicalValidation.valid) {
      errors.push(`PhysicalRealityModel验证失败: ${physicalValidation.missingFields.join(', ')}`);
    }

    // 验证HumanCapabilityModel
    if (!world.human) {
      errors.push('HumanCapabilityModel缺失');
    } else {
      // 验证关键字段
      if (world.human.maxDailyAscentM <= 0) {
        warnings.push('HumanCapabilityModel.maxDailyAscentM无效或未设置');
      }
      if (!world.human.preferredPace) {
        warnings.push('HumanCapabilityModel.preferredPace未设置');
      }
    }

    // 验证RouteDirection
    if (!world.routeDirection) {
      warnings.push('RouteDirection缺失，将使用默认值');
    } else {
      if (!world.routeDirection.countryCode) {
        warnings.push('RouteDirection.countryCode缺失');
      }
      if (!world.routeDirection.name && !world.routeDirection.nameCN) {
        warnings.push('RouteDirection名称缺失');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 从RouteDirection的corridorGeom（PostGIS geometry）提取坐标点
   */
  private async extractPointsFromCorridorGeometry(
    corridorGeom: any,
    samplingInterval: number = 100
  ): Promise<Array<{ lat: number; lng: number }>> {
    const routePoints: Array<{ lat: number; lng: number }> = [];
    
    try {
      // 方法1：如果corridorGeom是字符串（WKT格式）
      if (typeof corridorGeom === 'string') {
        // 尝试从WKT格式提取坐标点
        // 例如: "LINESTRING(-21.9 64.1, -19.0 64.5, -16.5 65.0)"
        const wktMatch = corridorGeom.match(/LINESTRING\s*\(([^)]+)\)/i);
        if (wktMatch) {
          const coordsStr = wktMatch[1];
          const coordPairs = coordsStr.split(',').map(s => s.trim());
          
          for (const pair of coordPairs) {
            const parts = pair.trim().split(/\s+/);
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                routePoints.push({ lat, lng });
              }
            }
          }
        }
      }
      // 方法2：如果是PostGIS geography类型，使用SQL查询提取点
      else if (corridorGeom && typeof corridorGeom === 'object') {
        try {
          // 先尝试将geometry转换为WKT格式
          // 注意：corridorGeom可能是PostGIS geography类型，需要先转换为geometry
          const wktResult: any = await this.prisma.$queryRaw`
            SELECT ST_AsText(${corridorGeom}::geography::geometry) as wkt
          `;
          
          if (wktResult?.[0]?.wkt) {
            const wkt = wktResult[0].wkt;
            const wktMatch = wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
            if (wktMatch) {
              const coordsStr = wktMatch[1];
              const coordPairs = coordsStr.split(',').map((s: string) => s.trim());
              
              // 按samplingInterval采样（简化：每N个点取一个）
              const step = Math.max(1, Math.floor(coordPairs.length / Math.max(1, Math.floor(samplingInterval / 50))));
              for (let i = 0; i < coordPairs.length; i += step) {
                const parts = coordPairs[i].trim().split(/\s+/);
                if (parts.length >= 2) {
                  const lng = parseFloat(parts[0]);
                  const lat = parseFloat(parts[1]);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    routePoints.push({ lat, lng });
                  }
                }
              }
            }
          } else {
            // 如果WKT转换失败，尝试直接使用ST_DumpPoints
            const pointsResult: any = await this.prisma.$queryRaw`
              SELECT 
                ST_Y((dp).geom) as lat,
                ST_X((dp).geom) as lng
              FROM (
                SELECT ST_DumpPoints(${corridorGeom}::geography::geometry) as dp
              ) as dumped
              ORDER BY (dp).path[1]
            `;
            
            // 按samplingInterval采样
            const step = Math.max(1, Math.floor((pointsResult.length || 0) / Math.max(1, Math.floor(samplingInterval / 50))));
            for (let i = 0; i < (pointsResult.length || 0); i += step) {
              const point = pointsResult[i];
              if (point?.lat && point?.lng) {
                routePoints.push({
                  lat: parseFloat(point.lat),
                  lng: parseFloat(point.lng),
                });
              }
            }
          }
        } catch (sqlError: any) {
          this.logger.warn(`从PostGIS geometry提取坐标点失败: ${sqlError.message}`);
        }
      }
      
      // 方法3：如果提取失败，尝试从metadata中获取
      if (routePoints.length === 0 && corridorGeom && typeof corridorGeom === 'object') {
        const metadata = (corridorGeom as any).metadata || {};
        if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
          for (const coord of metadata.coordinates) {
            if (coord.lat && coord.lng) {
              routePoints.push({ lat: coord.lat, lng: coord.lng });
            } else if (Array.isArray(coord) && coord.length >= 2) {
              routePoints.push({ lat: coord[1], lng: coord[0] }); // GeoJSON格式：[lng, lat]
            }
          }
        }
      }
      
      this.logger.debug(`从corridorGeom提取了 ${routePoints.length} 个坐标点`);
    } catch (error: any) {
      // 区分错误类型
      if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
        throw error; // 重新抛出critical错误
      }
      this.logger.warn(`提取corridorGeom坐标点失败: ${error?.message || error}`);
    }
    
    return routePoints;
  }
}

// 导出错误类型供其他模块使用
export { WorldModelError, ErrorSeverity };

