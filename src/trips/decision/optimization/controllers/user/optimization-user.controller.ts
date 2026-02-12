// src/trips/decision/optimization/controllers/user/optimization-user.controller.ts
/**
 * 用户端 - 优化核心 API
 * 
 * 提供用户可直接调用的优化功能
 */

import { Controller, Post, Get, Body, Param, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { ObjectiveFunctionService } from '../../objective-function.service';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../../objective-function.interface';
import { StrategyOrchestratorV2Service, StrategyOrchestrationResultV2 } from '../../strategy-orchestrator-v2.service';
import { ProbabilisticWorldModelService } from '../../probabilistic/probabilistic-world-model.service';
import { ExpectedUtilityService, ExpectedUtilityResult } from '../../probabilistic/expected-utility.service';
import { GuardianDebateService } from '../../learning/guardian-debate.service';
import { NegotiationResult, DEFAULT_NEGOTIATION_CONFIG, DebateArgument } from '../../learning/guardian-persona.interface';
import { WeightLearnerService, FeedbackRecord } from '../../learning/weight-learner.service';
import { WeightPersistenceService } from '../../learning/weight-persistence.service';
import { RoutePlanDraft, WorldModelContext } from '../../../shared/world-model.types';

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
  /** 待优化的计划 */
  plan!: RoutePlanDraft;
  /** 世界模型上下文 */
  world!: WorldModelContext;
}

export class ComputeRiskDto {
  /** 待评估的计划 */
  @IsNotEmpty({ message: 'plan 字段不能为空' })
  plan!: RoutePlanDraft;
  
  /** 世界模型上下文 */
  @IsNotEmpty({ message: 'world 字段不能为空' })
  world!: WorldModelContext;
  
  /** 蒙特卡洛采样数量（默认 1000） */
  @IsOptional()
  sampleSize?: number;
}

export class NegotiatePlanDto {
  /** 待协商的计划 */
  @IsNotEmpty({ message: 'plan 字段不能为空' })
  plan!: RoutePlanDraft;
  
  /** 世界模型上下文 */
  @IsNotEmpty({ message: 'world 字段不能为空' })
  world!: WorldModelContext;
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
  };
  /** 投票结果 */
  votingResult: {
    approve: number;
    reject: number;
    abstain: number;
  };
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
  async comparePlans(@Body() dto: ComparePlansDto): Promise<CompareResult> {
    // 参数验证
    if (!dto.planA) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'planA 字段不能为空',
      });
    }
    if (!dto.planB) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'planB 字段不能为空',
      });
    }
    if (!dto.world) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world 字段不能为空',
      });
    }
    
    const evalA = this.objectiveFunction.evaluate(dto.planA, dto.world);
    const evalB = this.objectiveFunction.evaluate(dto.planB, dto.world);
    
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
  async optimizePlan(@Body() dto: OptimizePlanDto): Promise<StrategyOrchestrationResultV2> {
    this.logger.log('[User] 一键优化计划');
    return this.orchestratorV2.run(dto.world, dto.plan);
  }

  // ========== 风险评估 ==========

  @Post('risk-assessment')
  @ApiOperation({ 
    summary: '风险评估',
    description: '使用 Monte Carlo 模拟计算期望效用、置信区间和风险指标'
  })
  @ApiResponse({ status: 200, description: '返回风险评估结果' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async assessRisk(@Body() dto: ComputeRiskDto): Promise<ExpectedUtilityResult> {
    this.logger.log('[User] 风险评估');
    
    // 参数验证
    if (!dto.plan) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'plan 字段不能为空',
        hint: '请求格式: { "plan": { "tripId": "...", "days": [...] }, "world": { "physical": {...}, "human": {...}, "routeDirection": {...} }, "sampleSize": 1000 }',
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
    if (!dto.world.physical) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.physical 字段不能为空',
        hint: 'WorldModelContext.physical 需要包含天气、地形等物理现实数据',
      });
    }
    if (!dto.world.human) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.human 字段不能为空',
        hint: 'WorldModelContext.human 需要包含用户体能、疲劳等人体状态数据',
      });
    }
    if (!dto.world.routeDirection) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'world.routeDirection 字段不能为空',
        hint: 'WorldModelContext.routeDirection 需要包含路线哲学和方向信息',
      });
    }
    
    const probabilisticContext = this.probabilisticWorldModel.fromDeterministicModel(dto.world);
    
    return this.expectedUtility.computeExpectedUtility(
      dto.plan,
      probabilisticContext,
      this.objectiveFunction.weights,
      { sampleSize: dto.sampleSize || 1000 },
    );
  }

  // ========== 协商结果 ==========

  @Post('negotiation')
  @ApiOperation({ 
    summary: '获取三守护者协商结论',
    description: '返回 Abu/Dre/Neptune 三智能体对计划的评估和协商结果'
  })
  @ApiResponse({ status: 200, description: '返回协商摘要' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async getNegotiationSummary(@Body() dto: NegotiatePlanDto): Promise<NegotiationSummary> {
    // 参数验证
    if (!dto.plan) {
      throw new BadRequestException('请求错误: plan 字段不能为空。请提供 { plan: RoutePlanDraft, world: WorldModelContext }');
    }
    if (!dto.plan.tripId) {
      throw new BadRequestException('请求错误: plan.tripId 不能为空。plan 对象必须包含 tripId 字段');
    }
    if (!dto.world) {
      throw new BadRequestException('请求错误: world 字段不能为空。请提供有效的 WorldModelContext 对象');
    }
    
    const result = await this.guardianDebate.negotiate(dto.plan, dto.world, DEFAULT_NEGOTIATION_CONFIG);
    
    const abuEval = result.evaluations.find(e => e.persona === 'ABU');
    const dreEval = result.evaluations.find(e => e.persona === 'DRE');
    const neptuneEval = result.evaluations.find(e => e.persona === 'NEPTUNE');
    
    const criticalConcerns: string[] = [];
    for (const evaluation of result.evaluations) {
      const concerns = evaluation.primaryConcerns.slice(0, 2);
      criticalConcerns.push(...concerns.map(c => `[${evaluation.persona}] ${c}`));
    }
    
    return {
      decision: result.decision,
      consensusLevel: result.consensusLevel,
      keyTradeoffs: result.keyTradeoffs,
      conditions: result.conditions,
      humanDecisionPoints: result.humanDecisionPoints,
      evaluationSummary: {
        abuUtility: abuEval?.utility || 0,
        dreUtility: dreEval?.utility || 0,
        neptuneUtility: neptuneEval?.utility || 0,
        criticalConcerns,
      },
      votingResult: {
        approve: result.votes.filter(v => v.vote === 'APPROVE').length,
        reject: result.votes.filter(v => v.vote === 'REJECT').length,
        abstain: result.votes.filter(v => v.vote === 'ABSTAIN').length,
      },
    };
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
  async testGetNegotiationSummary(@Body() dto: NegotiatePlanDto): Promise<NegotiationSummary> {
    this.logger.log('[Test] 测试协商端点');
    return this.getNegotiationSummary(dto);
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
