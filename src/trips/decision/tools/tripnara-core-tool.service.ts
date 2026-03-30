// src/trips/decision/tools/tripnara-core-tool.service.ts
/**
 * TripNARA Core Tool Service
 * 
 * 将 TripNARA 核心决策引擎封装成可以被 LangGraph / DeepAgents 调用的工具
 * 
 * 实现原则：
 * - 保持 Hard Core 的确定性逻辑不变
 * - 提供标准化的工具调用接口
 * - 将用户查询参数映射到 WorldModelContext
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { StrategyOrchestratorService } from '../services/strategy-orchestrator.service';
import { ITripNaraCoreTool, TripNaraCoreToolInput, TripNaraCoreToolOutput, TripNaraCoreToolError } from './tripnara-core-tool.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { HumanCapabilityModel } from '../models/human-capability.model';
import { createHumanCapabilityModelFromProfile } from '../models/human-capability.model';
import { RouteDirectionsService } from '../../../route-directions/route-directions.service';
import { DemDecisionEvidencePipelineService } from '../services/dem-decision-evidence-pipeline.service';
import { PhysicalRealityModel } from '../models/physical-reality.model';
import { RouteDirectionWithPhilosophy } from '../shared/world-model.types';
import { PhysicalRealityRetrievalService } from '../../readiness/services/physical-reality-retrieval.service';

@Injectable()
export class TripNaraCoreToolService implements ITripNaraCoreTool {
  private readonly logger = new Logger(TripNaraCoreToolService.name);

  constructor(
    private readonly orchestrator: StrategyOrchestratorService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
    @Optional() private readonly demEvidencePipeline?: DemDecisionEvidencePipelineService,
    @Optional() private readonly physicalRealityService?: PhysicalRealityRetrievalService,
  ) {}

  /**
   * 执行路线决策
   */
  async execute(input: TripNaraCoreToolInput): Promise<TripNaraCoreToolOutput> {
    this.logger.debug(`执行 TripNARA Core Tool: ${JSON.stringify(input)}`);

    try {
      // 1. 验证输入
      this.validateInput(input);

      // 2. 构建 WorldModelContext
      const world = await this.buildWorldModelContext(input);

      // 3. 构建或使用初始计划
      const plan = input.initialPlan || await this.buildInitialPlan(input);

      // 4. 执行策略编排（Hard Core）
      const result = await this.orchestrator.run(world, plan);

      // 5. 转换为工具输出格式
      return this.convertToToolOutput(result, input);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`TripNARA Core Tool 执行失败: ${errorMessage}`, errorStack);
      throw new TripNaraCoreToolError(
        `执行失败: ${errorMessage}`,
        'EXECUTION_FAILED',
        { originalError: errorMessage }
      );
    }
  }

  /**
   * 获取工具描述（用于 LangGraph Tool 注册）
   */
  getDescription(): string {
    return `TripNARA 核心决策引擎。基于物理现实、人体能力和路线哲学进行路线规划决策。
    
功能：
- 安全评估（Abu）：检查 DEM 硬违规、道路状态、危险区域
- 节奏调整（Dr.Dre）：基于人体能力模型调整行程节奏
- 空间修复（Neptune）：在保持路线哲学的前提下替换不可用路段

输入参数：
- countryCode: 国家代码（如 "IS"）
- month: 月份（1-12）
- routeDirectionId: 路线方向 ID
- humanCapability: 用户能力参数

输出：
- allowed: 是否允许
- plan: 最终路线计划
- action: 决策动作（ALLOW/REJECT/ADJUST/REPLACE）
- logs: 决策日志
- explanation: 可读解释`;
  }

  /**
   * 获取工具参数 Schema（用于 LangGraph Tool 注册）
   */
  getSchema(): Record<string, any> {
    return {
      type: 'object',
      properties: {
        countryCode: {
          type: 'string',
          description: '国家代码（ISO 3166-1 alpha-2），如 "IS" 表示冰岛',
        },
        month: {
          type: 'number',
          description: '月份（1-12）',
          minimum: 1,
          maximum: 12,
        },
        routeDirectionId: {
          type: 'string',
          description: '路线方向 ID',
        },
        humanCapability: {
          type: 'object',
          description: '用户能力参数',
          properties: {
            maxDailyAscentM: {
              type: 'number',
              description: '单日最大爬升（米）',
            },
            rollingAscent3DaysM: {
              type: 'number',
              description: '连续 3 天滚动爬升（米）',
            },
            maxSlopePct: {
              type: 'number',
              description: '最大坡度（百分比）',
            },
            preferredPace: {
              type: 'string',
              enum: ['SLOW', 'MEDIUM', 'FAST'],
              description: '节奏偏好',
            },
            riskTolerance: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH'],
              description: '风险承受度',
            },
            highAltitudeExperience: {
              type: 'string',
              enum: ['NONE', 'BASIC', 'ADVANCED'],
              description: '高海拔经验',
            },
            specialConstraints: {
              type: 'array',
              items: { type: 'string' },
              description: '特殊限制（例如：["膝盖不好", "恐高"]）',
            },
          },
        },
        initialPlan: {
          type: 'object',
          description: '初始路线计划（可选）',
        },
        metadata: {
          type: 'object',
          description: '元数据（用于传递上下文）',
        },
      },
      required: ['countryCode', 'month', 'routeDirectionId', 'humanCapability'],
    };
  }

  /**
   * 验证输入
   */
  private validateInput(input: TripNaraCoreToolInput): void {
    if (!input.countryCode) {
      throw new TripNaraCoreToolError('countryCode 是必需的', 'INVALID_INPUT');
    }
    if (!input.month || input.month < 1 || input.month > 12) {
      throw new TripNaraCoreToolError('month 必须是 1-12 之间的数字', 'INVALID_INPUT');
    }
    if (!input.routeDirectionId) {
      throw new TripNaraCoreToolError('routeDirectionId 是必需的', 'INVALID_INPUT');
    }
    if (!input.humanCapability) {
      throw new TripNaraCoreToolError('humanCapability 是必需的', 'INVALID_INPUT');
    }
  }

  /**
   * 构建 WorldModelContext
   */
  private async buildWorldModelContext(input: TripNaraCoreToolInput): Promise<WorldModelContext> {
    this.logger.debug('开始构建 WorldModelContext');

    // 1. 构建 HumanCapabilityModel
    const humanCapability = this.buildHumanCapabilityModel(input);

    // 2. 获取 RouteDirection
    const routeDirection = await this.getRouteDirection(input);

    // 3. 构建 PhysicalRealityModel
    const physical = await this.buildPhysicalRealityModel(input, routeDirection);

    // 4. 构建合规证据
    const complianceEvidence = this.buildComplianceEvidence(routeDirection);

    return {
      physical,
      human: humanCapability,
      routeDirection,
      complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
    };
  }

  /**
   * 构建 HumanCapabilityModel
   */
  private buildHumanCapabilityModel(input: TripNaraCoreToolInput): HumanCapabilityModel {
    // 从输入推断 fitness（基于特殊约束）
    let fitness: 'low' | 'medium' | 'high' = 'medium';
    if (input.humanCapability.specialConstraints) {
      const constraints = input.humanCapability.specialConstraints;
      if (constraints.some(c => c.includes('膝盖') || c.includes('受伤') || c.includes('疾病'))) {
        fitness = 'low';
      } else if (constraints.some(c => c.includes('专业') || c.includes('经验丰富'))) {
        fitness = 'high';
      }
    }

    const humanCapability = createHumanCapabilityModelFromProfile(
      `tool-profile-${Date.now()}`,
      {
        pace: input.humanCapability.preferredPace?.toLowerCase() as any || 'normal',
        fitness,
        riskTolerance: input.humanCapability.riskTolerance?.toLowerCase() as any || 'medium',
      }
    );

    // 覆盖显式指定的参数
    if (input.humanCapability.maxDailyAscentM) {
      humanCapability.maxDailyAscentM = input.humanCapability.maxDailyAscentM;
    }
    if (input.humanCapability.rollingAscent3DaysM) {
      humanCapability.rollingAscent3DaysM = input.humanCapability.rollingAscent3DaysM;
    }
    if (input.humanCapability.maxSlopePct) {
      humanCapability.maxSlopePct = input.humanCapability.maxSlopePct;
    }
    if (input.humanCapability.highAltitudeExperience) {
      humanCapability.highAltitudeExperience = input.humanCapability.highAltitudeExperience;
    }

    return humanCapability;
  }

  /**
   * 获取 RouteDirection
   */
  private async getRouteDirection(input: TripNaraCoreToolInput): Promise<RouteDirectionWithPhilosophy> {
    if (!this.routeDirectionsService) {
      throw new TripNaraCoreToolError(
        'RouteDirectionsService 未注入，无法获取 RouteDirection',
        'EXECUTION_FAILED'
      );
    }

    // 尝试通过 ID 查找
    const routeDirections = await this.routeDirectionsService.findRouteDirections({
      countryCode: input.countryCode,
    });

    // 查找匹配的 RouteDirection
    let routeDirection = routeDirections.find(
      rd => rd.uuid === input.routeDirectionId || String(rd.id) === input.routeDirectionId
    );

    if (!routeDirection) {
      // 如果找不到，尝试使用第一个匹配的
      routeDirection = routeDirections[0];
      if (!routeDirection) {
        throw new TripNaraCoreToolError(
          `未找到 RouteDirection: ${input.routeDirectionId} (country: ${input.countryCode})`,
          'EXECUTION_FAILED'
        );
      }
      this.logger.warn(
        `未找到精确匹配的 RouteDirection ${input.routeDirectionId}，使用第一个匹配: ${routeDirection.uuid}`
      );
    }

    return routeDirection as RouteDirectionWithPhilosophy;
  }

  /**
   * 构建 PhysicalRealityModel
   */
  private async buildPhysicalRealityModel(
    input: TripNaraCoreToolInput,
    routeDirection: RouteDirectionWithPhilosophy
  ): Promise<PhysicalRealityModel> {
    // 基础结构
    const physical: PhysicalRealityModel = {
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: input.countryCode,
      month: input.month,
    };

    // 如果有初始计划，可以生成 DEM 证据
    if (input.initialPlan && this.demEvidencePipeline) {
      // TODO: 将 RoutePlanDraft 转换为 TripPlan，然后生成 DEM 证据
      // 这里暂时留空，因为需要 TripPlan 结构
      this.logger.debug('有初始计划，但 DEM 证据生成需要 TripPlan 结构，暂时跳过');
    }

    // 从RAG检索Physical Reality数据（如果服务可用）
    if (this.physicalRealityService) {
      try {
        // 识别区域（根据countryCode或路线坐标）
        const region = this.identifyRegionFromCountryCode(input.countryCode, routeDirection);
        
        if (region && region !== 'unknown') {
          this.logger.debug(`检索Physical Reality数据: region=${region}, month=${input.month}`);
          
          // 获取路线坐标（如果有）
          const routeCoords = this.extractRouteCoordinates(routeDirection);
          
          const physicalRealityData = await this.physicalRealityService.retrievePhysicalRealityData(
            region,
            {
              lat: routeCoords?.lat,
              lng: routeCoords?.lng,
              month: input.month,
              limit: 20,
            }
          );

          // 转换道路状态
          physicalRealityData.roadStates.forEach((road) => {
            physical.roadStates.push({
              roadId: road.roadId,
              status: road.status,
              seasonOpenFrom: road.seasonOpenFrom,
              seasonOpenTo: road.seasonOpenTo,
              requires4x4: road.requires4x4,
              metadata: road.metadata,
            });
          });

          // 转换渡轮状态
          physicalRealityData.ferryStates.forEach((ferry) => {
            physical.ferryStates.push({
              ferryId: ferry.routeId,
              routeId: ferry.routeId,
              status: ferry.status,
              seasonOpenFrom: ferry.seasonOpenFrom,
              seasonOpenTo: ferry.seasonOpenTo,
              metadata: ferry.metadata,
            });
          });

          // 转换气候季节性（从天气窗口数据）
          if (physicalRealityData.weatherWindows.length > 0) {
            const weatherWindow = physicalRealityData.weatherWindows[0];
            const riskLevel = weatherWindow.riskLevels?.find((r) => r.month === input.month);
            
            if (riskLevel) {
              // 计算可达性评分（基于风险等级）
              const accessibilityScore = this.calculateAccessibilityScoreFromRiskLevel(riskLevel.riskLevel);
              
              physical.climateSeasonality = {
                countryCode: input.countryCode,
                month: input.month,
                accessibilityScore,
                riskFactors: riskLevel.risks,
                metadata: {
                  regionId: weatherWindow.regionId,
                  regionName: weatherWindow.regionName,
                },
              };
            }
          }

          this.logger.debug(
            `Physical Reality数据检索完成: ${physical.roadStates.length}条道路, ${physical.ferryStates.length}条渡轮, ${physicalRealityData.weatherWindows.length}个天气区域`
          );
        }
      } catch (error) {
        this.logger.warn(`检索Physical Reality数据失败: ${error instanceof Error ? error.message : String(error)}`, error);
      }
    }

    // 从 RouteDirection 的 constraints 和 riskProfile 提取信息（作为补充）
    if (routeDirection.constraints) {
      const constraints = routeDirection.constraints as any;
      if (constraints.hard) {
        // 可以推断一些道路状态
        if (constraints.hard.requiresPermit) {
          // 检查是否已存在
          const exists = physical.roadStates.some((r) => r.roadId === 'permit-required');
          if (!exists) {
            physical.roadStates.push({
              roadId: 'permit-required',
              status: 'RESTRICTED',
              requires4x4: constraints.hard.requires4x4 || false,
            });
          }
        }
      }
    }

    if (routeDirection.riskProfile) {
      const riskProfile = routeDirection.riskProfile as any;
      if (riskProfile.roadClosure) {
        // 检查是否已存在
        const exists = physical.roadStates.some((r) => r.roadId === 'seasonal-closure');
        if (!exists) {
          physical.roadStates.push({
            roadId: 'seasonal-closure',
            status: 'SEASONAL',
            seasonOpenFrom: riskProfile.weatherWindowMonths?.[0] || 6,
            seasonOpenTo: riskProfile.weatherWindowMonths?.[riskProfile.weatherWindowMonths.length - 1] || 9,
          });
        }
      }
    }

    return physical;
  }

  /**
   * 根据国家代码识别区域
   */
  private identifyRegionFromCountryCode(
    countryCode: string,
    _routeDirection: RouteDirectionWithPhilosophy
  ): string {
    // 国家代码到区域的映射
    const countryToRegion: Record<string, string> = {
      IS: 'iceland',
      GL: 'greenland',
      SJ: 'svalbard',
      FO: 'faroe-islands',
      AR: 'argentina',
      NO: 'lofoten', // 注意：挪威可能包含多个区域
      NZ: 'new-zealand-south-island',
      // 阿尔卑斯跨越多个国家
      CH: 'alps',
      AT: 'alps',
      IT: 'alps',
      FR: 'alps',
      DE: 'alps',
    };

    return countryToRegion[countryCode] || 'unknown';
  }

  /**
   * 从RouteDirection提取路线坐标
   */
  private extractRouteCoordinates(_routeDirection: RouteDirectionWithPhilosophy): { lat: number; lng: number } | null {
    // 简化实现，实际可以从routeDirection中提取起点坐标
    return null;
  }

  /**
   * 根据风险等级计算可达性评分
   */
  private calculateAccessibilityScoreFromRiskLevel(riskLevel: string): number {
    const riskToScore: Record<string, number> = {
      low: 0.9,
      medium: 0.7,
      high: 0.5,
      very_high: 0.3,
      extreme: 0.1,
    };
    return riskToScore[riskLevel] || 0.5;
  }

  /**
   * 构建合规证据
   */
  private buildComplianceEvidence(routeDirection: RouteDirectionWithPhilosophy): any[] {
    const evidence: any[] = [];

    if (routeDirection.constraints) {
      const constraints = routeDirection.constraints as any;
      if (constraints.hard) {
        evidence.push({
          requiresPermit: constraints.hard.requiresPermit || false,
          requiresGuide: constraints.hard.requiresGuide || false,
          valid: true, // 假设已通过 RouteDirection 选择
          violation: 'NONE',
        });
      }
    }

    return evidence;
  }

  /**
   * 构建初始计划
   */
  private async buildInitialPlan(input: TripNaraCoreToolInput): Promise<RoutePlanDraft> {
    this.logger.debug('构建初始计划');

    if (!this.routeDirectionsService) {
      throw new TripNaraCoreToolError(
        'RouteDirectionsService 未注入，无法构建初始计划',
        'EXECUTION_FAILED'
      );
    }

    // 获取 RouteDirection
    const routeDirection = await this.getRouteDirection(input);

    // 生成基本的初始计划骨架
    // 这里创建一个最小化的计划，实际应该从 RouteDirection 的 itinerarySkeleton 生成
    const tripId = `trip-${Date.now()}`;
    const routeDirectionId = (routeDirection as any).uuid || String((routeDirection as any).id) || input.routeDirectionId;

    // 从 RouteDirection 的 itinerarySkeleton 获取天数（如果有）
    let estimatedDays = 7; // 默认 7 天
    if (routeDirection.itinerarySkeleton) {
      const skeleton = routeDirection.itinerarySkeleton as any;
      if (skeleton.dayThemes && Array.isArray(skeleton.dayThemes)) {
        estimatedDays = skeleton.dayThemes.length;
      }
    }

    // 创建初始段（占位符）
    const segments = Array.from({ length: estimatedDays }, (_, index) => ({
      segmentId: `day-${index + 1}`,
      dayIndex: index,
      distanceKm: 100, // 占位值
      ascentM: 0, // 占位值，将由 DEM 服务填充
      slopePct: 0, // 占位值
      metadata: {
        isPlaceholder: true,
        note: '这是初始占位计划，需要由决策引擎填充实际数据',
      },
    }));

    return {
      tripId,
      routeDirectionId,
      segments,
    };
  }

  /**
   * 转换为工具输出格式
   */
  private convertToToolOutput(
    result: any, // StrategyOrchestrationResult
    input: TripNaraCoreToolInput
  ): TripNaraCoreToolOutput {
    // 生成可读解释
    const explanation = this.generateExplanation(result, input);

    return {
      allowed: result.allowed,
      plan: result.plan,
      action: result.finalAction,
      logs: result.logs.map((log: any) => ({
        persona: log.persona,
        action: log.action,
        explanation: log.explanation,
        decisionSource: log.decisionSource,
      })),
      explanation,
      metadata: {
        ...input.metadata,
        tripId: result.plan?.tripId,
      },
    };
  }

  /**
   * 生成可读解释（用于 Narrator Agent）
   */
  private generateExplanation(result: any, _input: TripNaraCoreToolInput): string {
    if (!result.allowed) {
      const rejectReason = result.logs.find((log: any) => log.action === 'REJECT');
      return rejectReason
        ? `路线被拒绝：${rejectReason.explanation}`
        : '路线被拒绝：未知原因';
    }

    const parts: string[] = [];

    // Abu 的检查结果
    const abuLogs = result.logs.filter((log: any) => log.persona === 'ABU');
    if (abuLogs.length > 0) {
      parts.push(`安全评估（Abu）：${abuLogs[0].explanation}`);
    }

    // Dr.Dre 的调整
    const dreLogs = result.logs.filter((log: any) => log.persona === 'DR_DRE');
    if (dreLogs.some((log: any) => log.action === 'ADJUST')) {
      const adjustLog = dreLogs.find((log: any) => log.action === 'ADJUST');
      parts.push(`节奏调整（Dr.Dre）：${adjustLog?.explanation || '已调整行程节奏'}`);
    }

    // Neptune 的替换
    const nepLogs = result.logs.filter((log: any) => log.persona === 'NEPTUNE');
    if (nepLogs.some((log: any) => log.action === 'REPLACE')) {
      const replaceLog = nepLogs.find((log: any) => log.action === 'REPLACE');
      parts.push(`空间修复（Neptune）：${replaceLog?.explanation || '已替换不可用路段'}`);
    }

    return parts.length > 0 ? parts.join('\n') : '路线已通过所有检查';
  }
}

