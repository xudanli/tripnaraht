// src/trips/decision/optimization/controllers/user/optimization-user.controller.ts
/**
 * 用户端 - 优化核心 API
 * 
 * 提供用户可直接调用的优化功能
 */

import { Controller, Post, Get, Body, Param, Req, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';
import { IsNotEmpty, IsOptional } from 'class-validator';

import { ObjectiveFunctionService } from '../../objective-function.service';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights } from '../../objective-function.interface';
import { StrategyOrchestratorV2Service, StrategyOrchestrationResultV2 } from '../../strategy-orchestrator-v2.service';
import { ProbabilisticWorldModelService } from '../../probabilistic/probabilistic-world-model.service';
import { ExpectedUtilityService, ExpectedUtilityResult } from '../../probabilistic/expected-utility.service';
import { GuardianDebateService } from '../../learning/guardian-debate.service';
import { DEFAULT_NEGOTIATION_CONFIG } from '../../learning/guardian-persona.interface';
import { WeightLearnerService, FeedbackRecord } from '../../learning/weight-learner.service';
import { WeightPersistenceService } from '../../learning/weight-persistence.service';
import { NegotiateContextLoaderService } from '../../collaboration/negotiate-context-loader.service';
import { RoutePlanDraft, WorldModelContext } from '../../../shared/world-model.types';
import { PrismaService } from '../../../../../prisma/prisma.service';

// ========== Request DTOs ==========

export class EvaluatePlanDto {
  /** 待评估的计划 */
  @IsNotEmpty({ message: 'plan 字段不能为空' })
  plan!: RoutePlanDraft;
  
  /** 世界模型上下文 */
  @IsNotEmpty({ message: 'world 字段不能为空' })
  world!: WorldModelContext;
  
  /** 可选：自定义权重 */
  @IsOptional()
  weights?: Partial<ObjectiveFunctionWeights>;
}

export class ComparePlansDto {
  /** 方案 A */
  @IsNotEmpty({ message: 'planA 字段不能为空' })
  planA!: RoutePlanDraft;
  
  /** 方案 B */
  @IsNotEmpty({ message: 'planB 字段不能为空' })
  planB!: RoutePlanDraft;
  
  /** 世界模型上下文 */
  @IsNotEmpty({ message: 'world 字段不能为空' })
  world!: WorldModelContext;
}

export class OptimizePlanDto {
  /** 可选：仅传 tripId 时由后端加载 plan + world */
  @IsOptional()
  tripId?: string;
  /** 待优化的计划（与 tripId 二选一） */
  plan?: RoutePlanDraft;
  /** 世界模型上下文（与 tripId 二选一） */
  world?: WorldModelContext;
}

export class ComputeRiskDto {
  /** 可选：仅传 tripId 时由后端加载 plan + world */
  @IsOptional()
  tripId?: string;
  /** 待评估的计划 */
  plan?: RoutePlanDraft;
  /** 世界模型上下文 */
  world?: WorldModelContext;
  /** 蒙特卡洛采样数量（默认 1000） */
  @IsOptional()
  sampleSize?: number;
}

export class NegotiatePlanDto {
  /** 可选：仅传 tripId 时由后端加载 plan + world */
  @IsOptional()
  tripId?: string;
  /** 待协商的计划 */
  plan?: RoutePlanDraft;
  /** 世界模型上下文 */
  world?: WorldModelContext;
}

export class RecordFeedbackDto {
  /** 用户 ID */
  userId!: string;
  /** 行程 ID */
  tripId!: string;
  /** 反馈类型 */
  type!: 'SATISFACTION_RATING' | 'FATIGUE_REPORT' | 'PLAN_MODIFICATION' | 'PREFERENCE_UPDATE' | 'TRIP_COMPLETION' | 'EARLY_TERMINATION';
  /** 反馈数据 */
  data!: {
    /** 总体满意度 (1-5) */
    overallSatisfaction?: number;
    /** 安全感知 (1-5) */
    safetyPerception?: number;
    /** 体验质量 (1-5) */
    experienceQuality?: number;
    /** 节奏舒适度 (1-5) */
    pacingComfort?: number;
    /** 哲学契合度 (1-5) */
    philosophyMatch?: number;
    /** 实际疲劳等级 (0-2) */
    actualFatigueLevel?: number;
    /** 预测疲劳等级 (0-2) */
    predictedFatigueLevel?: number;
    /** 修改类型 */
    modificationType?: 'SPLIT_DAY' | 'INSERT_REST' | 'REMOVE_ACTIVITY' | 'REORDER' | 'OTHER';
    /** 修改原因 */
    modificationReason?: string;
    /** 完成率 (0-1) */
    completionRate?: number;
    /** 完成天数 */
    daysCompleted?: number;
    /** 总天数 */
    totalDays?: number;
  };
}

// ========== Response Types ==========

export interface CompareResult {
  /** 更优方案 */
  preferredPlan: 'A' | 'B' | 'EQUAL';
  /** 效用差异 */
  utilityDifference: number;
  /** 各维度对比 */
  dimensionComparison: Record<string, { a: number; b: number; winner: string }>;
}

export interface NegotiationSummary {
  /** 决策结论 */
  decision: string;
  /** 共识度 (0-1) */
  consensusLevel: number;
  /** 关键权衡点 */
  keyTradeoffs: string[];
  /** 附加条件 */
  conditions?: string[];
  /** 需人类决策的点 */
  humanDecisionPoints?: string[];
  /** 三守护者评估摘要 */
  evaluationSummary: {
    abuUtility: number;
    dreUtility: number;
    neptuneUtility: number;
    criticalConcerns: string[];
    /** 建议及对应维度（前端可展示 [安全] 采纳后可提升安全分） */
    suggestionsWithDimension?: Array<{ text: string; dimension: string; dimensionLabel: string }>;
  };
  /** 投票结果 */
  votingResult: {
    approve: number;
    reject: number;
    abstain: number;
  };
  /** TDFPM 疲劳预测（按天） */
  fatiguePrediction?: Array<{
    dayIndex: number;
    fatigueScore: number;
    riskLevel: string;
    recommendation: string;
    confidence?: number;
  }>;
}

export interface UserWeightsResponse {
  /** 当前权重 */
  weights: ObjectiveFunctionWeights;
  /** 学习置信度 */
  confidence: number;
  /** 最后更新时间 */
  lastUpdated: string;
}

@ApiTags('User - Optimization')
@ApiBearerAuth()
@Controller('v2/user/optimization')
export class OptimizationUserController {
  private readonly logger = new Logger(OptimizationUserController.name);

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly orchestratorV2: StrategyOrchestratorV2Service,
    private readonly probabilisticWorldModel: ProbabilisticWorldModelService,
    private readonly expectedUtility: ExpectedUtilityService,
    private readonly guardianDebate: GuardianDebateService,
    private readonly weightLearner: WeightLearnerService,
    private readonly weightPersistence: WeightPersistenceService,
    private readonly negotiateLoader: NegotiateContextLoaderService,
    private readonly prisma: PrismaService,
  ) {}

  // ========== 计划评估 ==========

  @Post('evaluate')
  @ApiOperation({ 
    summary: '评估计划得分',
    description: '对计划进行 8 维度评分，返回总效用值和各维度分解'
  })
  @ApiResponse({ status: 200, description: '返回计划评估结果' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async evaluatePlan(@Body() dto: EvaluatePlanDto): Promise<ObjectiveEvaluationResult> {
    this.logger.log('[User] 评估计划');
    
    // 参数验证
    if (!dto.plan) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'plan 字段不能为空',
        hint: '请求格式: { "plan": { "tripId": "...", "days": [...] }, "world": {...} }',
      });
    }
    if (!dto.plan.tripId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'plan.tripId 不能为空',
        hint: 'plan 对象必须包含 tripId 字段',
      });
    }
    if (!dto.world) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world 字段不能为空',
        hint: '请提供 WorldModelContext: { "physical": {...}, "human": {...}, "routeDirection": {...} }',
      });
    }
    
    if (dto.weights) {
      this.objectiveFunction.updateWeights(dto.weights);
    }
    
    return this.objectiveFunction.evaluate(dto.plan, dto.world);
  }

  @Post('compare')
  @ApiOperation({ 
    summary: '比较两个计划',
    description: '对比方案 A 和方案 B 的效用值，返回更优方案和各维度对比'
  })
  @ApiResponse({ status: 200, description: '返回比较结果' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async comparePlans(@Body() dto: ComparePlansDto, @Req() req: { body?: Record<string, unknown> }): Promise<CompareResult> {
    const raw = req?.body ?? {};
    // 兼容驼峰 planA/planB/world 与蛇形 plan_a/plan_b
    const planA = (dto?.planA ?? raw.plan_a) as RoutePlanDraft | undefined;
    const planB = (dto?.planB ?? raw.plan_b) as RoutePlanDraft | undefined;
    const world = (dto?.world ?? raw.world) as WorldModelContext | undefined;
    if (!planA) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'planA / plan_a 字段不能为空',
      });
    }
    if (!planB) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'planB / plan_b 字段不能为空',
      });
    }
    if (!world) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world 字段不能为空',
      });
    }
    const evalA = this.objectiveFunction.evaluate(planA, world);
    const evalB = this.objectiveFunction.evaluate(planB, world);
    
    const diff = evalA.totalUtility - evalB.totalUtility;
    
    const dimensionComparison: Record<string, { a: number; b: number; winner: string }> = {
      safety: {
        a: evalA.breakdown.safetyScore,
        b: evalB.breakdown.safetyScore,
        winner: evalA.breakdown.safetyScore > evalB.breakdown.safetyScore ? 'A' : evalA.breakdown.safetyScore < evalB.breakdown.safetyScore ? 'B' : 'EQUAL',
      },
      experience: {
        a: evalA.breakdown.experienceScore,
        b: evalB.breakdown.experienceScore,
        winner: evalA.breakdown.experienceScore > evalB.breakdown.experienceScore ? 'A' : evalA.breakdown.experienceScore < evalB.breakdown.experienceScore ? 'B' : 'EQUAL',
      },
      philosophy: {
        a: evalA.breakdown.philosophyScore,
        b: evalB.breakdown.philosophyScore,
        winner: evalA.breakdown.philosophyScore > evalB.breakdown.philosophyScore ? 'A' : evalA.breakdown.philosophyScore < evalB.breakdown.philosophyScore ? 'B' : 'EQUAL',
      },
      timeSlack: {
        a: evalA.breakdown.timeSlackScore,
        b: evalB.breakdown.timeSlackScore,
        winner: evalA.breakdown.timeSlackScore > evalB.breakdown.timeSlackScore ? 'A' : evalA.breakdown.timeSlackScore < evalB.breakdown.timeSlackScore ? 'B' : 'EQUAL',
      },
    };
    
    return {
      preferredPlan: diff > 0.01 ? 'A' : diff < -0.01 ? 'B' : 'EQUAL',
      utilityDifference: diff,
      dimensionComparison,
    };
  }

  // ========== 计划优化 ==========

  @Post('optimize')
  @ApiOperation({ 
    summary: '一键优化计划',
    description: '执行完整优化流程（约束检查 → 排程优化 → 稳定性修复）'
  })
  @ApiResponse({ status: 200, description: '返回优化后的计划' })
  async optimizePlan(@Body() dto: OptimizePlanDto, @Req() req: { body?: Record<string, unknown> }): Promise<StrategyOrchestrationResultV2> {
    this.logger.log('[User] 一键优化计划');
    let plan: RoutePlanDraft;
    let world: WorldModelContext;
    // 兼容 tripId（驼峰）与 trip_id（蛇形），前端可能传其一
    const raw = req?.body ?? {};
    const tripIdStr = (typeof dto?.tripId === 'string' ? dto.tripId : typeof raw.trip_id === 'string' ? raw.trip_id : '').trim();
    if (dto?.plan != null && dto?.world != null) {
      plan = dto.plan;
      world = dto.world;
    } else if (tripIdStr) {
      const loaded = await this.negotiateLoader.loadPlanAndWorld(tripIdStr);
      plan = loaded.plan;
      world = loaded.world;
    } else {
      const bodyKeys = raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : '(空)';
      this.logger.warn(`[User] 一键优化缺少参数，请求体 keys: ${bodyKeys}`);
      throw new BadRequestException({
        message: '请提供 plan + world，或仅传 tripId / trip_id 由后端加载',
        hint: '请求体: { "plan": { "tripId": "...", "days": [...] }, "world": { ... } } 或 { "tripId": "行程UUID" } 或 { "trip_id": "行程UUID" }',
      });
    }
    const result = await this.orchestratorV2.run(world, plan);
    if (result.summary && Number.isNaN(result.summary.finalUtility)) {
      result.summary.finalUtility = 0;
    }
    return result;
  }

  // ========== 风险评估 ==========

  @Post('risk-assessment')
  @ApiOperation({ 
    summary: '风险评估',
    description: '使用 Monte Carlo 模拟计算期望效用、置信区间和风险指标'
  })
  @ApiResponse({ status: 200, description: '返回风险评估结果' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async assessRisk(@Body() dto: ComputeRiskDto, @Req() req: { body?: Record<string, unknown> }): Promise<ExpectedUtilityResult> {
    this.logger.log('[User] 风险评估');
    const raw = req?.body ?? {};
    // 兼容多种前端可能传的 trip 标识：tripId, trip_id, id
    const tripIdStr = (
      (typeof dto?.tripId === 'string' ? dto.tripId : null) ??
      (typeof raw.tripId === 'string' ? raw.tripId : null) ??
      (typeof raw.trip_id === 'string' ? raw.trip_id : null) ??
      (typeof raw.id === 'string' ? raw.id : null) ??
      ''
    ).trim();
    let plan: RoutePlanDraft;
    let world: WorldModelContext;
    if (dto?.plan != null && dto?.world != null) {
      plan = dto.plan;
      world = dto.world;
    } else if (raw.plan != null && raw.world != null) {
      plan = raw.plan as RoutePlanDraft;
      world = raw.world as WorldModelContext;
    } else if (tripIdStr) {
      const loaded = await this.negotiateLoader.loadPlanAndWorld(tripIdStr);
      plan = loaded.plan;
      world = loaded.world;
    } else {
      const bodyKeys = raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : '(空)';
      this.logger.warn(`[User] 风险评估缺少参数，请求体 keys: ${bodyKeys}`);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: '请提供 plan + world，或仅传 tripId / trip_id / id 由后端加载',
        hint: '请求格式: { "plan": { "tripId": "...", "days": [...] }, "world": { ... }, "sampleSize": 1000 } 或 { "tripId": "行程UUID" }',
      });
    }
    if (!world.physical) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.physical 字段不能为空',
        hint: 'WorldModelContext.physical 需要包含天气、地形等物理现实数据',
      });
    }
    if (!world.human) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.human 字段不能为空',
        hint: 'WorldModelContext.human 需要包含用户体能、疲劳等人体状态数据',
      });
    }
    if (!world.routeDirection) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.routeDirection 字段不能为空',
        hint: 'WorldModelContext.routeDirection 需要包含路线哲学和方向信息',
      });
    }
    const sampleSize = (dto?.sampleSize ?? raw.sampleSize) ?? 1000;
    const probabilisticContext = this.probabilisticWorldModel.fromDeterministicModel(world);
    const result = this.expectedUtility.computeExpectedUtility(
      plan,
      probabilisticContext,
      this.objectiveFunction.weights,
      { sampleSize: Number(sampleSize) || 1000 },
    );
    const safe = (n: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : 0);
    return {
      ...result,
      expectedUtility: safe(result.expectedUtility),
      feasibilityProbability: safe(result.feasibilityProbability),
      confidenceInterval: {
        ...result.confidenceInterval,
        lower: safe(result.confidenceInterval?.lower),
        upper: safe(result.confidenceInterval?.upper),
        level: result.confidenceInterval?.level ?? 0.95,
      },
      downsideRisk: safe(result.riskMetrics?.downRiskProbability),
    };
  }

  // ========== 协商结果 ==========

  @Post('negotiation')
  @ApiOperation({ 
    summary: '获取三守护者协商结论',
    description: '返回 Abu/Dre/Neptune 三智能体对计划的评估和协商结果'
  })
  @ApiResponse({ status: 200, description: '返回协商摘要' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async getNegotiationSummary(@Body() dto: NegotiatePlanDto, @Req() req: { body?: Record<string, unknown> }): Promise<NegotiationSummary> {
    const raw = req?.body ?? {};
    const tripIdStr = (
      (typeof dto?.tripId === 'string' ? dto.tripId : null) ??
      (typeof raw.tripId === 'string' ? raw.tripId : null) ??
      (typeof raw.trip_id === 'string' ? raw.trip_id : null) ??
      (typeof raw.id === 'string' ? raw.id : null) ??
      ''
    ).trim();
    let plan: RoutePlanDraft;
    let world: WorldModelContext;
    if (dto?.plan != null && dto?.world != null) {
      plan = dto.plan;
      world = dto.world;
    } else if (raw.plan != null && raw.world != null) {
      plan = raw.plan as RoutePlanDraft;
      world = raw.world as WorldModelContext;
    } else if (tripIdStr) {
      const loaded = await this.negotiateLoader.loadPlanAndWorld(tripIdStr);
      plan = loaded.plan;
      world = loaded.world;
    } else {
      const bodyKeys = raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : '(空)';
      this.logger.warn(`[User] 协商缺少参数，请求体 keys: ${bodyKeys}`);
      throw new BadRequestException({
        message: '请提供 plan + world，或仅传 tripId / trip_id / id 由后端加载',
        hint: '请求体: { "plan": { "tripId": "...", "days": [...] }, "world": { ... } } 或 { "tripId": "行程UUID" }',
      });
    }
    if (!plan.tripId) {
      throw new BadRequestException('请求错误: plan.tripId 不能为空。plan 对象必须包含 tripId 字段');
    }
    await this.enrichRouteDirectionName(world);
    const result = await this.guardianDebate.negotiate(plan, world, DEFAULT_NEGOTIATION_CONFIG);
    
    const abuEval = result.evaluations.find(e => e.persona === 'ABU');
    const dreEval = result.evaluations.find(e => e.persona === 'DRE');
    const neptuneEval = result.evaluations.find(e => e.persona === 'NEPTUNE');
    
    // 人格 → 维度标签（对应评估维度：安全守护者/节奏守护者/修复守护者）
    const PERSONA_DIMENSION: Record<string, { dimension: string; dimensionLabel: string }> = {
      ABU: { dimension: 'safety', dimensionLabel: '安全' },
      DRE: { dimension: 'rhythm', dimensionLabel: '节奏' },
      NEPTUNE: { dimension: 'philosophy', dimensionLabel: '修复' },
    };
    // 合并各角色关注点与建议，去重，用户可读（无 [ABU] 等前缀），用于展示「具体问题」
    const seen = new Set<string>();
    const criticalConcerns: string[] = [];
    const suggestionsWithDimension: Array<{ text: string; dimension: string; dimensionLabel: string }> = [];
    for (const evaluation of result.evaluations) {
      const dim = PERSONA_DIMENSION[evaluation.persona] ?? { dimension: 'general', dimensionLabel: '综合' };
      const items = [
        ...(evaluation.primaryConcerns || []),
        ...(evaluation.suggestedAdjustments || []),
      ];
      for (const text of items) {
        const t = String(text).trim();
        if (t && !seen.has(t)) {
          seen.add(t);
          criticalConcerns.push(t);
          suggestionsWithDimension.push({ text: t, dimension: dim.dimension, dimensionLabel: dim.dimensionLabel });
        }
      }
    }

    const decision = result.decision === 'CONDITIONAL_APPROVE' ? 'APPROVE_WITH_CONDITIONS'
      : result.decision === 'REQUIRES_HUMAN' ? 'NEEDS_HUMAN'
      : result.decision;
    
    return {
      decision,
      consensusLevel: result.consensusLevel ?? 0,
      keyTradeoffs: Array.isArray(result.keyTradeoffs) ? result.keyTradeoffs : [],
      conditions: Array.isArray(result.conditions) ? result.conditions : [],
      humanDecisionPoints: Array.isArray(result.humanDecisionPoints) ? result.humanDecisionPoints : [],
      evaluationSummary: {
        abuUtility: abuEval?.utility ?? 0,
        dreUtility: dreEval?.utility ?? 0,
        neptuneUtility: neptuneEval?.utility ?? 0,
        criticalConcerns,
        suggestionsWithDimension,
      },
      votingResult: {
        approve: Math.max(0, result.votes.filter(v => v.vote === 'APPROVE').length),
        reject: Math.max(0, result.votes.filter(v => v.vote === 'REJECT').length),
        abstain: Math.max(0, result.votes.filter(v => v.vote === 'ABSTAIN').length),
      },
      fatiguePrediction: result.fatiguePrediction,
    };
  }

  /**
   * 当 world.routeDirection 缺少 nameCN 时，根据 id 从数据库补齐实际路线名称（用于优化建议展示）
   */
  private async enrichRouteDirectionName(world: WorldModelContext): Promise<void> {
    const rd = world?.routeDirection as { id?: string | number; nameCN?: string; name?: string } | undefined;
    if (!rd?.id) return;
    const hasName = Boolean((rd.nameCN || rd.name || '').trim());
    if (hasName) return;

    try {
      const idStr = String(rd.id).trim();
      if (!idStr) return;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);
      const numId = parseInt(idStr, 10);
      const db = isUuid
        ? await this.prisma.routeDirection.findFirst({ where: { uuid: idStr } })
        : Number.isInteger(numId) && numId > 0
          ? await this.prisma.routeDirection.findFirst({ where: { id: numId } })
          : null;
      if (db) {
        (rd as Record<string, unknown>).nameCN = db.nameCN ?? db.name ?? '';
        (rd as Record<string, unknown>).name = db.name ?? db.nameCN ?? '';
      }
    } catch (e) {
      this.logger.debug(`[Enrich] 无法补齐路线名称: ${(e as Error).message}`);
    }
  }

  // ========== 测试端点（无需认证） ==========

  @Public()
  @Post('test/negotiation')
  @ApiOperation({ 
    summary: '[测试] 获取三守护者协商结论',
    description: '测试端点，无需认证。返回 Abu/Dre/Neptune 三智能体对计划的评估和协商结果'
  })
  @ApiResponse({ status: 200, description: '返回协商摘要' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async testGetNegotiationSummary(@Body() dto: NegotiatePlanDto, @Req() req: { body?: Record<string, unknown> }): Promise<NegotiationSummary> {
    this.logger.log('[Test] 测试协商端点');
    return this.getNegotiationSummary(dto, req);
  }

  @Public()
  @Post('test/evaluate')
  @ApiOperation({ 
    summary: '[测试] 评估计划得分',
    description: '测试端点，无需认证。评估计划的 8 维度效用值'
  })
  @ApiResponse({ status: 200, description: '返回评估结果' })
  async testEvaluatePlan(@Body() dto: EvaluatePlanDto): Promise<ObjectiveEvaluationResult> {
    this.logger.log('[Test] 测试评估端点');
    return this.evaluatePlan(dto);
  }

  // ========== 反馈与偏好 ==========

  @Post('feedback')
  @ApiOperation({ 
    summary: '提交反馈',
    description: '记录用户对行程的满意度反馈，用于个性化权重学习'
  })
  @ApiResponse({ status: 200, description: '反馈已记录' })
  async recordFeedback(@Body() dto: RecordFeedbackDto): Promise<{ success: boolean; feedbackId: string }> {
    this.logger.log(`[User] 记录反馈: ${dto.type}`);
    
    const feedback: FeedbackRecord = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: dto.userId,
      tripId: dto.tripId,
      type: dto.type,
      timestamp: new Date().toISOString(),
      data: dto.data,
      weightsAtTime: this.weightLearner.getUserWeights(dto.userId),
      utilityAtTime: 0,
    };
    
    this.weightLearner.recordFeedback(feedback);
    await this.weightPersistence.saveFeedback(feedback);
    
    return { success: true, feedbackId: feedback.id };
  }

  @Get('preferences/:userId')
  @ApiOperation({ 
    summary: '获取个性化偏好',
    description: '返回用户通过学习获得的个性化权重配置'
  })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({ status: 200, description: '返回用户偏好' })
  async getUserPreferences(@Param('userId') userId: string): Promise<UserWeightsResponse> {
    const profile = await this.weightPersistence.loadUserProfile(userId);
    
    if (profile) {
      return {
        weights: profile.currentWeights,
        confidence: profile.learningConfidence,
        lastUpdated: profile.lastUpdated,
      };
    }
    
    return {
      weights: this.objectiveFunction.weights,
      confidence: 0.5,
      lastUpdated: new Date().toISOString(),
    };
  }
}
