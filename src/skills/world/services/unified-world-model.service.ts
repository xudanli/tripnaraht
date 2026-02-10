/**
 * 统一的世界模型服务（整合所有护城河扩展）
 * 
 * 这是护城河扩展的统一服务，整合了：
 * 1. 原有能力（WorldBuildContextSkill）
 * 2. 护城河扩展能力（实时状态、预测数据、自适应参数、学习后的能力）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorldBuildContextSkill } from '../world-build-context.skill';
import { UnifiedWorldModel, UnifiedWorldModelRequest } from '../interfaces/unified-world-model.interface';
import { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import { executeWithFallback, executeWithConditionalFallback } from '../utils/fallback-helper';

// 护城河扩展服务
import { RealtimeWeatherService } from './realtime-weather.service';
import { RealtimeRoadStatusService } from './realtime-road-status.service';
import { WeatherPredictionService } from './weather-prediction.service';
import { FailureRiskPredictionService } from './failure-risk-prediction.service';
import { AdaptiveWorldModelService } from './adaptive-world-model.service';
import { UserCapabilityLearningService } from './user-capability-learning.service';
import { MultimodalWorldPerceptionService } from './multimodal-world-perception.service';
// 使用Skills替代直接服务调用
import { WorldRealtimeWeatherSkill } from '../world-realtime-weather.skill';
import { WorldWeatherPredictionSkill } from '../world-weather-prediction.skill';
import { WorldFailureRiskPredictionSkill } from '../world-failure-risk-prediction.skill';
import { WorldAdaptiveParametersSkill } from '../world-adaptive-parameters.skill';
import { WorldMultimodalPerceptionSkill } from '../world-multimodal-perception.skill';
import { WorldCollaborativeDataSkill } from '../world-collaborative-data.skill';
import { SkillsRegistryService } from '../../services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../services/skills-registry.token';
import { Inject } from '@nestjs/common';
import { CollaborativeWorldModelService } from './collaborative-world-model.service';
import { CountryConfigService } from './country-config.service';
import { CausalReasoningService } from './causal-reasoning.service';
import { MultiAgentCollaborationService } from './multi-agent-collaboration.service';
import { WorldModelVersionService } from './world-model-version.service';
import { WorldModelEventsService } from './world-model-events.service';
import { WorldModelMonitoringService } from './world-model-monitoring.service';

@Injectable()
export class UnifiedWorldModelService {
  private readonly logger = new Logger(UnifiedWorldModelService.name);

  constructor(
    // 原有服务
    private worldBuildContextSkill: WorldBuildContextSkill,
    
    // Skills Registry（用于获取Skills）
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private skillsRegistry?: SkillsRegistryService,
    
    // 护城河扩展服务（保留作为降级策略）
    @Optional() private realtimeWeatherService?: RealtimeWeatherService,
    @Optional() private realtimeRoadStatusService?: RealtimeRoadStatusService,
    @Optional() private weatherPredictionService?: WeatherPredictionService,
    @Optional() private failureRiskPredictionService?: FailureRiskPredictionService,
    @Optional() private adaptiveWorldModelService?: AdaptiveWorldModelService,
    @Optional() private userCapabilityLearningService?: UserCapabilityLearningService,
    @Optional() private multimodalWorldPerceptionService?: MultimodalWorldPerceptionService,
    @Optional() private collaborativeWorldModelService?: CollaborativeWorldModelService,
    @Optional() private countryConfigService?: CountryConfigService,
    @Optional() private causalReasoningService?: CausalReasoningService,
    @Optional() private multiAgentCollaborationService?: MultiAgentCollaborationService,
    @Optional() private worldModelVersionService?: WorldModelVersionService,
    @Optional() private worldModelEventsService?: WorldModelEventsService,
    @Optional() private worldModelMonitoringService?: WorldModelMonitoringService,
    
    // Skills（直接注入，优先使用）
    @Optional() private worldRealtimeWeatherSkill?: WorldRealtimeWeatherSkill,
    @Optional() private worldWeatherPredictionSkill?: WorldWeatherPredictionSkill,
    @Optional() private worldFailureRiskPredictionSkill?: WorldFailureRiskPredictionSkill,
    @Optional() private worldAdaptiveParametersSkill?: WorldAdaptiveParametersSkill,
    @Optional() private worldMultimodalPerceptionSkill?: WorldMultimodalPerceptionSkill,
    @Optional() private worldCollaborativeDataSkill?: WorldCollaborativeDataSkill,
  ) {}

  /**
   * 构建统一的世界模型（整合所有能力）
   */
  async buildUnifiedWorldModel(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel> {
    this.logger.log(`[UnifiedWorldModel] 开始构建统一世界模型: tripId=${request.tripId}, countryCode=${request.countryCode || 'N/A'}`);

    // Code Review P2-3修复：记录构建开始时间
    const buildStartTime = Date.now();

    try {
      // 0. 获取国家配置（如果提供了国家代码）
      const countryCode = request.countryCode;
      let countryConfig = undefined;
      if (countryCode && this.countryConfigService) {
        countryConfig = this.countryConfigService.getCountryConfig(countryCode);
        this.logger.debug(
          `[UnifiedWorldModel] 使用国家配置: ${countryCode}`,
        );
      }

      // Code Review P0-3修复：并行化独立的数据获取操作
      // 1. 构建基础世界模型（必须首先完成，因为其他操作可能依赖它）
      const baseWorldModel = await this.buildBaseWorldModel(request);

      // 2-7. 并行获取所有独立的数据（这些操作互不依赖）
      const [
        realtimeState,
        predictions,
        adaptiveParameters,
        learnedCapabilities,
        multimodalPerception,
        collaborativeData,
      ] = await Promise.all([
        this.getRealtimeState(request),
        this.getPredictions(request),
        this.getAdaptiveParameters(request, countryConfig),
        this.getLearnedCapabilities(request),
        this.getMultimodalPerception(request),
        this.getCollaborativeData(request),
      ]);

      // 8. 合并所有数据（先构建基础模型）
      const unifiedWorldModel: UnifiedWorldModel = {
        ...baseWorldModel,
        realtimeState,
        predictions,
        adaptiveParameters,
        learnedCapabilities,
        multimodalPerception,
        collaborativeData,
      };

      // 9-11. 并行获取依赖基础模型的数据
      const [causalReasoning, multiAgentCollaboration, versionInfo] = await Promise.all([
        this.getCausalReasoning(unifiedWorldModel),
        this.getMultiAgentCollaboration(request.tripId),
        this.getVersionInfo(request),
      ]);

      // 12-14. 添加所有数据
      unifiedWorldModel.causalReasoning = causalReasoning;
      unifiedWorldModel.multiAgentCollaboration = multiAgentCollaboration;
      unifiedWorldModel.versionInfo = versionInfo;

      // Code Review P2-3修复：发布世界模型构建完成事件
      const buildTimeMs = Date.now() - buildStartTime;
      if (this.worldModelEventsService) {
        await this.worldModelEventsService.emitWorldModelBuilt({
          tripId: request.tripId,
          routeDirectionId: request.routeDirectionId,
          countryCode: request.countryCode,
          worldModel: unifiedWorldModel,
          buildTimeMs,
        });
      }

      // Code Review P2-4修复：记录性能指标
      if (this.worldModelMonitoringService) {
        this.worldModelMonitoringService.recordBuild(buildTimeMs, request.countryCode);
      }

      this.logger.log(`[UnifiedWorldModel] 统一世界模型构建完成 (耗时: ${buildTimeMs}ms)`);
      return unifiedWorldModel;
    } catch (error) {
      // Code Review P2-4修复：记录错误
      if (this.worldModelMonitoringService) {
        this.worldModelMonitoringService.recordError(
          'BUILD_FAILED',
          error.message,
          request.countryCode,
        );
      }
      
      this.logger.error(`[UnifiedWorldModel] 构建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 构建基础世界模型（原有逻辑）
   */
  private async buildBaseWorldModel(
    request: UnifiedWorldModelRequest,
  ): Promise<WorldModelContext> {
    // 使用现有的 WorldBuildContextSkill
    const result = await this.worldBuildContextSkill.execute({
      tripId: request.tripId,
      countryCode: request.countryCode,
      season: request.season,
      duration: request.duration,
      partyProfile: request.partyProfile,
      routeDirectionId: request.routeDirectionId,
    });

    if (!result.world) {
      throw new Error('Failed to build base world model');
    }

    return result.world;
  }

  /**
   * 获取实时状态（护城河扩展）
   */
  private async getRealtimeState(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['realtimeState']> {
    const weatherAlerts: any[] = [];
    const roadStatusUpdates: any[] = [];

    try {
      // 1. 获取天气预警（优先使用Skill）
      if (request.countryCode) {
        // 获取地理编码坐标（Code Review P0修复）
        let location: { lat: number; lng: number } | null = null;
        if (!request.poiId && this.countryConfigService) {
          try {
            location = await this.countryConfigService.getGeocodingCoordinates(
              request.countryCode,
            );
          } catch (error: any) {
            this.logger.warn(
              `[UnifiedWorldModel] 获取地理编码坐标失败: ${error.message}`,
            );
          }
        }

        // Code Review P1修复：使用通用降级策略
        const alerts = await executeWithConditionalFallback({
          condition: !!this.worldRealtimeWeatherSkill,
          primary: async () => {
            const skillResult = await this.worldRealtimeWeatherSkill!.execute({
              region: request.countryCode,
              dateRange: request.dateRange,
              location: request.poiId ? undefined : location || undefined,
            });
            this.logger.debug(
              `[UnifiedWorldModel] 使用world.realtimeWeather Skill获取到 ${skillResult.alerts.length} 条预警`,
            );
            return skillResult.alerts;
          },
          fallback: this.realtimeWeatherService
            ? async () => {
                return await this.realtimeWeatherService!.getWeatherAlerts(
                  request.countryCode,
                );
              }
            : undefined,
          defaultValue: [],
          logger: this.logger,
          operationName: '获取实时天气预警',
        });
        weatherAlerts.push(...alerts);
      }

      // 2. 获取道路状态更新
      // TODO: 从request中提取roadId列表
      // if (this.realtimeRoadStatusService && roadIds.length > 0) {
      //   for (const roadId of roadIds) {
      //     const status = await this.realtimeRoadStatusService.getRoadStatus(roadId);
      //     if (status) {
      //       roadStatusUpdates.push(status);
      //     }
      //   }
      // }
    } catch (error: any) {
      this.logger.warn(
        `[UnifiedWorldModel] 获取实时状态失败: ${error.message}`,
      );
      // 降级策略：继续使用空数据
    }

    return {
      weatherAlerts,
      roadStatusUpdates,
      poiStatusUpdates: [], // TODO: 实现POI状态更新
    };
  }

  /**
   * 获取预测数据（护城河扩展）
   */
  private async getPredictions(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['predictions']> {
    const weatherPredictions: any[] = [];
    let failureRiskPrediction: any = null;

    try {
      // 1. 获取天气预测（优先使用Skill）
      if (request.countryCode && request.duration) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + request.duration);

        // 获取地理编码坐标（Code Review P0修复）
        let location: { lat: number; lng: number } | null = null;
        if (this.countryConfigService) {
          try {
            location = await this.countryConfigService.getGeocodingCoordinates(
              request.countryCode,
            );
          } catch (error: any) {
            this.logger.warn(
              `[UnifiedWorldModel] 获取地理编码坐标失败: ${error.message}`,
            );
          }
        }

        // 优先使用world.weatherPrediction Skill
        if (this.worldWeatherPredictionSkill) {
          try {
            const skillResult = await this.worldWeatherPredictionSkill.execute({
              region: request.countryCode,
              dateRange: { start: startDate, end: endDate },
              location: location || undefined,
            });
            weatherPredictions.push(...skillResult.predictions);
            this.logger.debug(
              `[UnifiedWorldModel] 使用world.weatherPrediction Skill获取到 ${skillResult.predictions.length} 条预测`,
            );
          } catch (error: any) {
            this.logger.warn(
              `[UnifiedWorldModel] world.weatherPrediction Skill失败: ${error.message}`,
            );
            // 降级到服务
          }
        }

        // 降级策略：使用WeatherPredictionService
        if (weatherPredictions.length === 0 && this.weatherPredictionService) {
          const predictions = await this.weatherPredictionService.predictWeather(
            request.countryCode,
            { start: startDate, end: endDate },
          );
          weatherPredictions.push(...predictions);
        }
      }

      // 2. 获取失败风险预测（优先使用Skill）
      if (request.routeDirectionId && request.duration && request.countryCode) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + request.duration);

        // 获取地理编码坐标（Code Review P0修复）
        let location: { lat: number; lng: number } | null = null;
        if (request.countryCode && this.countryConfigService) {
          try {
            location = await this.countryConfigService.getGeocodingCoordinates(
              request.countryCode,
            );
          } catch (error: any) {
            this.logger.warn(
              `[UnifiedWorldModel] 获取地理编码坐标失败: ${error.message}`,
            );
          }
        }

        // 优先使用world.failureRiskPrediction Skill
        if (this.worldFailureRiskPredictionSkill) {
          try {
            const skillResult = await this.worldFailureRiskPredictionSkill.execute({
              routeDirectionId: request.routeDirectionId,
              userProfile: {
                userId: request.userId,
                riskTolerance: request.partyProfile?.risk_tolerance as any,
                fitness: request.partyProfile?.fitness as any,
              },
              dateRange: { start: startDate, end: endDate },
              region: request.countryCode,
              location: location || undefined,
            });
            failureRiskPrediction = skillResult.prediction;
            this.logger.debug(
              `[UnifiedWorldModel] 使用world.failureRiskPrediction Skill获取到预测`,
            );
          } catch (error: any) {
            this.logger.warn(
              `[UnifiedWorldModel] world.failureRiskPrediction Skill失败: ${error.message}`,
            );
            // 降级到服务
          }
        }

        // 降级策略：使用FailureRiskPredictionService
        if (!failureRiskPrediction && this.failureRiskPredictionService) {
          failureRiskPrediction =
            await this.failureRiskPredictionService.predictFailureRisk(
              request.routeDirectionId,
              {
                userId: request.userId,
                riskTolerance: request.partyProfile?.risk_tolerance as any,
                fitness: request.partyProfile?.fitness as any,
              },
              { start: startDate, end: endDate },
            );
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `[UnifiedWorldModel] 获取预测数据失败: ${error.message}`,
      );
      // 降级策略：继续使用空数据
    }

    return {
      weather: weatherPredictions,
      roadStatus: [], // TODO: 实现道路状态预测
      failureRisk: failureRiskPrediction,
    };
  }

  /**
   * 获取自适应参数（护城河扩展，应用国家特定调整）
   */
  private async getAdaptiveParameters(
    request: UnifiedWorldModelRequest,
    countryConfig?: import('./country-config.service').CountryConfig,
  ): Promise<UnifiedWorldModel['adaptiveParameters']> {
    // 优先使用world.adaptiveParameters Skill
    if (this.worldAdaptiveParametersSkill) {
      try {
        const skillResult = await this.worldAdaptiveParametersSkill.execute({
          routeDirectionId: request.routeDirectionId,
          userId: request.userId,
        });
        this.logger.debug(
          `[UnifiedWorldModel] 使用world.adaptiveParameters Skill获取到参数`,
        );
        return skillResult.parameters;
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] world.adaptiveParameters Skill失败: ${error.message}`,
        );
        // 降级到服务
      }
    }

    // 降级策略：使用AdaptiveWorldModelService
    let parameters: UnifiedWorldModel['adaptiveParameters'] | undefined;
    if (this.adaptiveWorldModelService) {
      try {
        parameters = await this.adaptiveWorldModelService.getAdaptiveParameters(
          request.routeDirectionId,
          request.userId,
        );
        this.logger.debug(
          `[UnifiedWorldModel] 使用AdaptiveWorldModelService获取到参数`,
        );
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] 获取自适应参数失败: ${error.message}`,
        );
      }
    }

    // 应用国家特定的世界模型参数调整
    if (countryConfig?.worldModelParameters) {
      const countryParams = countryConfig.worldModelParameters;
      if (parameters) {
        // 合并国家特定调整
        parameters = {
          routeDifficultyAdjustment:
            (parameters.routeDifficultyAdjustment || 1.0) *
            (countryParams.routeDifficultyAdjustment || 1.0),
          timeEstimateAdjustment:
            (parameters.timeEstimateAdjustment || 1.0) *
            (countryParams.timeEstimateAdjustment || 1.0),
          riskAssessmentAdjustment:
            (parameters.riskAssessmentAdjustment || 1.0) *
            (countryParams.riskAssessmentAdjustment || 1.0),
        };
        this.logger.debug(
          `[UnifiedWorldModel] 已应用国家特定调整: ${countryConfig.countryCode}`,
        );
      } else {
        // 如果没有自适应参数，直接使用国家特定参数
        parameters = {
          routeDifficultyAdjustment: countryParams.routeDifficultyAdjustment || 1.0,
          timeEstimateAdjustment: countryParams.timeEstimateAdjustment || 1.0,
          riskAssessmentAdjustment: countryParams.riskAssessmentAdjustment || 1.0,
        };
      }
    }

    // 最终降级策略：返回默认值
    return (
      parameters || {
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 1.0,
        riskAssessmentAdjustment: 1.0,
      }
    );
  }

  /**
   * 获取学习后的能力（护城河扩展）
   */
  private async getLearnedCapabilities(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['learnedCapabilities']> {
    let userCapability = null;
    let routeDifficultyCorrection = null;

    try {
      // 1. 获取用户能力（学习后的）
      if (this.userCapabilityLearningService && request.userId) {
        userCapability =
          await this.userCapabilityLearningService.getLearnedCapability(
            request.userId,
          );
      }

      // 2. 获取路线难度修正
      if (request.routeDirectionId) {
        // TODO: 实现路线难度修正获取
        // routeDifficultyCorrection = await this.routeDifficultyCorrectionService.getCorrection(...);
      }
    } catch (error: any) {
      this.logger.warn(
        `[UnifiedWorldModel] 获取学习后的能力失败: ${error.message}`,
      );
      // 降级策略：继续使用空数据
    }

    return {
      userCapability,
      routeDifficultyCorrection,
    };
  }

  /**
   * 获取多模态感知数据（护城河扩展）
   */
  private async getMultimodalPerception(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['multimodalPerception']> {
    // 优先使用world.multimodalPerception Skill
    if (this.worldMultimodalPerceptionSkill) {
      try {
        const skillResult = await this.worldMultimodalPerceptionSkill.execute({
          poiId: request.poiId,
          routeDirectionId: request.routeDirectionId,
        });
        this.logger.debug(
          `[UnifiedWorldModel] 使用world.multimodalPerception Skill获取到感知数据`,
        );
        return skillResult.perception;
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] world.multimodalPerception Skill失败: ${error.message}`,
        );
        // 降级到服务
      }
    }

    // 降级策略：使用MultimodalWorldPerceptionService
    if (this.multimodalWorldPerceptionService) {
      try {
        const perceptionResult =
          await this.multimodalWorldPerceptionService.aggregatePerceptionResults(
            request.poiId,
            request.routeDirectionId,
          );
        return perceptionResult;
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] 获取多模态感知数据失败: ${error.message}`,
        );
      }
    }

    // 最终降级策略：返回undefined
    return undefined;
  }

  /**
   * 获取协作数据（护城河扩展）
   */
  private async getCollaborativeData(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['collaborativeData']> {
    // 优先使用world.collaborativeData Skill
    if (this.worldCollaborativeDataSkill) {
      try {
        // 根据request类型确定targetId
        const targetId = request.routeDirectionId || request.poiId || request.tripId;
        if (!targetId) {
          return undefined;
        }

        const skillResult = await this.worldCollaborativeDataSkill.execute({
          targetId,
        });
        this.logger.debug(
          `[UnifiedWorldModel] 使用world.collaborativeData Skill获取到 ${skillResult.contributions.length} 条贡献`,
        );
        return {
          contributions: skillResult.contributions.map((c) => ({
            id: c.id,
            userId: c.userId,
            type: c.type,
            targetId: c.targetId,
            data: c.data,
            qualityScore: c.qualityScore,
            verifiedByExpert: c.verifiedByExpert,
            status: c.status,
          })),
          averageQualityScore: skillResult.averageQualityScore,
        };
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] world.collaborativeData Skill失败: ${error.message}`,
        );
        // 降级到服务
      }
    }

    // 降级策略：使用CollaborativeWorldModelService
    if (this.collaborativeWorldModelService) {
      try {
        const targetId = request.routeDirectionId || request.poiId || request.tripId;
        if (!targetId) {
          return undefined;
        }

        const contributions = await this.collaborativeWorldModelService.getVerifiedContributions(
          targetId,
        );

        const averageQualityScore =
          contributions.length > 0
            ? contributions.reduce((sum, c) => sum + c.qualityScore, 0) /
              contributions.length
            : 0;

        return {
          contributions: contributions.map((c) => ({
            id: c.id,
            userId: c.userId,
            type: c.type,
            targetId: c.targetId,
            data: c.data,
            qualityScore: c.qualityScore,
            verifiedByExpert: c.verifiedByExpert,
            status: c.status,
          })),
          averageQualityScore,
        };
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] 获取协作数据失败: ${error.message}`,
        );
      }
    }

    // 最终降级策略：返回undefined
    return undefined;
  }

  /**
   * 获取因果推理数据（护城河扩展）
   */
  private async getCausalReasoning(
    worldModel: UnifiedWorldModel,
  ): Promise<UnifiedWorldModel['causalReasoning']> {
    // 使用CausalReasoningService执行因果推理
    if (this.causalReasoningService) {
      try {
        const result = await this.causalReasoningService.reasonAboutWorldModel(
          worldModel,
          undefined, // targetNodeType
          {
            enableCounterfactuals: true,
            minConfidence: 0.5,
          },
        );

        return {
          causalChains: result.worldModelChains.map((chain) => ({
            id: chain.id,
            sourceType: chain.worldModelContext.sourceType,
            targetType: chain.worldModelContext.targetType,
            factors: chain.worldModelContext.factors,
            confidence: chain.confidence,
          })),
          rootCauses: result.causalReasoning.rootCauses.map((n) => n.id),
          effects: result.causalReasoning.effects.map((n) => n.id),
          overallConfidence: result.causalReasoning.overallConfidence,
          counterfactuals: result.counterfactuals?.map((cf) => ({
            id: cf.id,
            scenario: cf.scenario,
            originalOutcome: cf.originalOutcome,
            counterfactualOutcome: cf.counterfactualOutcome,
            changedFactors: cf.changedFactors,
            confidence: cf.confidence,
            explanation: cf.explanation,
          })),
        };
      } catch (error: any) {
        this.logger.warn(
          `[UnifiedWorldModel] 获取因果推理数据失败: ${error.message}`,
        );
      }
    }

    // 降级策略：返回undefined
    return undefined;
  }

  /**
   * 获取多智能体协作数据（护城河扩展）
   */
  private async getMultiAgentCollaboration(
    tripId?: string,
  ): Promise<UnifiedWorldModel['multiAgentCollaboration']> {
    if (!tripId || !this.multiAgentCollaborationService) {
      return undefined;
    }

    try {
      // 获取协作的世界模型（当前实现返回空，因为需要智能体注册贡献）
      const collaborativeWorldModel =
        await this.multiAgentCollaborationService.getCollaborativeWorldModel(
          tripId,
        );

      // 返回协作状态（简化实现）
      return {
        contributions: [],
        conflicts: [],
        consensusConfidence: 0.8,
      };
    } catch (error: any) {
      this.logger.warn(
        `[UnifiedWorldModel] 获取多智能体协作数据失败: ${error.message}`,
      );
      return undefined;
    }
  }

  /**
   * 获取版本信息（护城河扩展）
   */
  private async getVersionInfo(
    request: UnifiedWorldModelRequest,
  ): Promise<UnifiedWorldModel['versionInfo']> {
    if (!this.worldModelVersionService) {
      return undefined;
    }

    try {
      const activeVersion = await this.worldModelVersionService.getActiveVersion(
        request.routeDirectionId,
        request.countryCode,
      );

      if (!activeVersion) {
        return undefined;
      }

      return {
        versionId: activeVersion.versionId,
        version: activeVersion.version,
        isActive: activeVersion.isActive,
        createdAt: activeVersion.createdAt,
        performanceMetrics: activeVersion.performanceMetrics,
      };
    } catch (error: any) {
      this.logger.warn(
        `[UnifiedWorldModel] 获取版本信息失败: ${error.message}`,
      );
      return undefined;
    }
  }
}
