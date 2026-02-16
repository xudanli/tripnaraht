// src/trips/decision/optimization/controllers/optimization.controller.ts
/**
 * 优化层 API Controller
 * 
 * 提供：
 * 1. 计划评估接口
 * 2. 多智能体协商接口
 * 3. 权重学习接口
 * 4. 概率模型接口
 */

import { Controller, Post, Get, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { ObjectiveFunctionService } from '../objective-function.service';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import { AbuOptimizerService, AbuOptimizationResponse } from '../abu-optimizer.service';
import { DreOptimizerService, DreOptimizationResult } from '../dre-optimizer.service';
import { StrategyOrchestratorV2Service, StrategyOrchestrationResultV2 } from '../strategy-orchestrator-v2.service';
import { ProbabilisticWorldModelService } from '../probabilistic/probabilistic-world-model.service';
import { ProbabilisticWorldModelContext } from '../probabilistic/probabilistic-world-model.interface';
import { ExpectedUtilityService, ExpectedUtilityResult } from '../probabilistic/expected-utility.service';
import { GuardianDebateService } from '../learning/guardian-debate.service';
import { NegotiationResult, DEFAULT_NEGOTIATION_CONFIG, PersonaEvaluation, DebateArgument } from '../learning/guardian-persona.interface';
import { WeightLearnerService, FeedbackRecord, WeightLearningResult, DEFAULT_LEARNING_CONFIG } from '../learning/weight-learner.service';
import { WeightPersistenceService } from '../learning/weight-persistence.service';
import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';

// ========== DTOs ==========

class EvaluatePlanDto {
  plan!: RoutePlanDraft;
  world!: WorldModelContext;
  weights?: Partial<ObjectiveFunctionWeights>;
}

class OptimizePlanDto {
  plan!: RoutePlanDraft;
  world!: WorldModelContext;
}

class NegotiatePlanDto {
  plan!: RoutePlanDraft;
  world!: WorldModelContext;
  maxRounds?: number;
}

class ComputeExpectedUtilityDto {
  plan!: RoutePlanDraft;
  world!: WorldModelContext;
  sampleSize?: number;
}

class RecordFeedbackDto {
  userId!: string;
  tripId!: string;
  type!: 'SATISFACTION_RATING' | 'FATIGUE_REPORT' | 'PLAN_MODIFICATION' | 'PREFERENCE_UPDATE' | 'TRIP_COMPLETION' | 'EARLY_TERMINATION';
  data!: {
    // 满意度评分
    overallSatisfaction?: number;     // 1-5
    safetyPerception?: number;        // 1-5
    experienceQuality?: number;       // 1-5
    pacingComfort?: number;           // 1-5
    philosophyMatch?: number;         // 1-5
    
    // 疲劳数据
    actualFatigueLevel?: number;      // 0-2
    predictedFatigueLevel?: number;   // 0-2
    
    // 修改数据
    modificationType?: 'SPLIT_DAY' | 'INSERT_REST' | 'REMOVE_ACTIVITY' | 'REORDER' | 'OTHER';
    modificationReason?: string;
    
    // 行程完成数据
    completionRate?: number;          // 0-1
    daysCompleted?: number;
    totalDays?: number;
  };
}

class LearnWeightsDto {
  userId!: string;
  feedbackCount?: number;
}

// ========== Response Types ==========

interface NegotiationSummaryResponse {
  decision: string;
  consensusLevel: number;
  keyTradeoffs: string[];
  conditions?: string[];
  humanDecisionPoints?: string[];
  evaluationSummary: {
    abuUtility: number;
    dreUtility: number;
    neptuneUtility: number;
    criticalConcerns: string[];
  };
  debateHighlights: Array<{
    round: number;
    keyArguments: string[];
  }>;
  votingResult: {
    approve: number;
    reject: number;
    abstain: number;
  };
  fatiguePrediction?: Array<{
    dayIndex: number;
    fatigueScore: number;
    riskLevel: string;
    recommendation: string;
    confidence?: number;
  }>;
}

@ApiTags('Optimization')
@Controller('v2/optimization')
export class OptimizationController {
  private readonly logger = new Logger(OptimizationController.name);

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly abuOptimizer: AbuOptimizerService,
    private readonly dreOptimizer: DreOptimizerService,
    private readonly orchestratorV2: StrategyOrchestratorV2Service,
    private readonly probabilisticWorldModel: ProbabilisticWorldModelService,
    private readonly expectedUtility: ExpectedUtilityService,
    private readonly guardianDebate: GuardianDebateService,
    private readonly weightLearner: WeightLearnerService,
    private readonly weightPersistence: WeightPersistenceService,
  ) {}

  // ========== 计划评估 ==========

  @Post('evaluate')
  @ApiOperation({ summary: '评估计划的目标函数值' })
  @ApiResponse({ status: 200, description: '返回计划的 8 维度评分和总效用值' })
  async evaluatePlan(@Body() dto: EvaluatePlanDto): Promise<ObjectiveEvaluationResult> {
    this.logger.log('[Optimization] 评估计划');
    
    if (dto.weights) {
      this.objectiveFunction.updateWeights(dto.weights);
    }
    
    return this.objectiveFunction.evaluate(dto.plan, dto.world);
  }

  @Post('compare')
  @ApiOperation({ summary: '比较两个计划' })
  async comparePlans(@Body() dto: { planA: RoutePlanDraft; planB: RoutePlanDraft; world: WorldModelContext }): Promise<{
    preferredPlan: 'A' | 'B' | 'EQUAL';
    utilityDifference: number;
    dimensionComparison: Record<string, { a: number; b: number; winner: string }>;
  }> {
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

  // ========== 优化器 ==========

  @Post('abu/optimize')
  @ApiOperation({ summary: 'Abu 约束优化' })
  async abuOptimize(@Body() dto: OptimizePlanDto): Promise<AbuOptimizationResponse> {
    this.logger.log('[Optimization] Abu 约束优化');
    return this.abuOptimizer.optimizeConstraints({
      plan: dto.plan,
      world: dto.world,
      autoRepair: false,
    });
  }

  @Post('dre/optimize')
  @ApiOperation({ summary: 'Dre 排程优化' })
  async dreOptimize(@Body() dto: OptimizePlanDto): Promise<DreOptimizationResult> {
    this.logger.log('[Optimization] Dre 排程优化');
    return this.dreOptimizer.optimizeSchedule(dto.plan, dto.world);
  }

  @Post('orchestrate')
  @ApiOperation({ summary: '完整优化流程（Abu → Dre → Neptune）' })
  async orchestrate(@Body() dto: OptimizePlanDto): Promise<StrategyOrchestrationResultV2> {
    this.logger.log('[Optimization] 完整优化流程');
    return this.orchestratorV2.run(dto.world, dto.plan);
  }

  // ========== 概率模型 ==========

  @Post('probabilistic/convert')
  @ApiOperation({ summary: '将确定性世界模型转换为概率模型' })
  async convertToProbabilistic(@Body() world: WorldModelContext): Promise<ProbabilisticWorldModelContext> {
    this.logger.log('[Optimization] 转换为概率模型');
    return this.probabilisticWorldModel.fromDeterministicModel(world);
  }

  @Post('probabilistic/expected-utility')
  @ApiOperation({ summary: '计算期望效用（蒙特卡洛模拟）' })
  async computeExpectedUtility(@Body() dto: ComputeExpectedUtilityDto): Promise<ExpectedUtilityResult> {
    this.logger.log('[Optimization] 计算期望效用');
    
    const probabilisticContext = this.probabilisticWorldModel.fromDeterministicModel(dto.world);
    
    return this.expectedUtility.computeExpectedUtility(
      dto.plan,
      probabilisticContext,
      this.objectiveFunction.weights,
      { sampleSize: dto.sampleSize || 1000 },
    );
  }

  // ========== 多智能体协商 ==========

  @Post('negotiate')
  @ApiOperation({ summary: '启动三守护者协商' })
  @ApiResponse({ status: 200, description: '返回完整协商结果' })
  async negotiate(@Body() dto: NegotiatePlanDto): Promise<NegotiationResult> {
    this.logger.log('[Optimization] 启动三守护者协商');
    
    const config = {
      ...DEFAULT_NEGOTIATION_CONFIG,
      maxDebateRounds: dto.maxRounds || DEFAULT_NEGOTIATION_CONFIG.maxDebateRounds,
    };
    
    return this.guardianDebate.negotiate(dto.plan, dto.world, config);
  }

  @Post('negotiate/summary')
  @ApiOperation({ summary: '获取协商结果摘要（适合 UI 展示）' })
  @ApiResponse({ status: 200, description: '返回简化的协商摘要' })
  async negotiateSummary(@Body() dto: NegotiatePlanDto): Promise<NegotiationSummaryResponse> {
    const config = {
      ...DEFAULT_NEGOTIATION_CONFIG,
      maxDebateRounds: dto.maxRounds || DEFAULT_NEGOTIATION_CONFIG.maxDebateRounds,
    };
    
    const result = await this.guardianDebate.negotiate(dto.plan, dto.world, config);
    
    // 转换为 UI 友好格式
    const abuEval = result.evaluations.find(e => e.persona === 'ABU');
    const dreEval = result.evaluations.find(e => e.persona === 'DRE');
    const neptuneEval = result.evaluations.find(e => e.persona === 'NEPTUNE');
    
    const criticalConcerns: string[] = [];
    for (const evaluation of result.evaluations) {
      // 收集主要关注点作为关键关切
      const concerns = evaluation.primaryConcerns.slice(0, 2);
      criticalConcerns.push(...concerns.map(c => `[${evaluation.persona}] ${c}`));
    }
    
    const debateHighlights = result.debateRounds.map((round, idx) => ({
      round: idx + 1,
      keyArguments: round.arguments.slice(0, 3).map((arg: DebateArgument) => 
        `[${arg.fromPersona}] ${arg.content.slice(0, 80)}...`
      ),
    }));
    
    const votingResult = {
      approve: result.votes.filter(v => v.vote === 'APPROVE').length,
      reject: result.votes.filter(v => v.vote === 'REJECT').length,
      abstain: result.votes.filter(v => v.vote === 'ABSTAIN').length,
    };
    
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
      debateHighlights,
      votingResult,
      fatiguePrediction: result.fatiguePrediction,
    };
  }

  // ========== 权重学习 ==========

  @Post('feedback')
  @ApiOperation({ summary: '记录用户反馈' })
  async recordFeedback(@Body() dto: RecordFeedbackDto): Promise<{ success: boolean; feedbackId: string }> {
    this.logger.log(`[Optimization] 记录反馈: ${dto.type}`);
    
    const feedback: FeedbackRecord = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: dto.userId,
      tripId: dto.tripId,
      type: dto.type,
      timestamp: new Date().toISOString(),
      data: dto.data,
      weightsAtTime: this.weightLearner.getUserWeights(dto.userId),
      utilityAtTime: 0, // 会在学习时计算
    };
    
    this.weightLearner.recordFeedback(feedback);
    await this.weightPersistence.saveFeedback(feedback);
    
    return { success: true, feedbackId: feedback.id };
  }

  @Post('learn')
  @ApiOperation({ summary: '触发权重学习' })
  async learnWeights(@Body() dto: LearnWeightsDto): Promise<WeightLearningResult> {
    this.logger.log(`[Optimization] 触发权重学习: ${dto.userId}`);
    
    const feedbackHistory = await this.weightPersistence.loadFeedbackHistory(
      dto.userId,
      dto.feedbackCount || 50,
    );
    
    const result = await this.weightLearner.learnFromFeedback(
      dto.userId,
      feedbackHistory,
      DEFAULT_LEARNING_CONFIG,
    );
    
    // 保存学习结果
    await this.weightPersistence.saveLearningResult(dto.userId, result);
    await this.weightPersistence.saveUserProfile(dto.userId, {
      userId: dto.userId,
      currentWeights: result.updatedWeights,
      weightHistory: [],
      totalFeedback: feedbackHistory.length,
      learningConfidence: result.confidence,
      lastUpdated: new Date().toISOString(),
    });
    
    return result;
  }

  @Get('weights/:userId')
  @ApiOperation({ summary: '获取用户权重配置' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  async getUserWeights(@Param('userId') userId: string): Promise<{
    weights: ObjectiveFunctionWeights;
    confidence: number;
    lastUpdated: string;
  }> {
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

  @Get('learning-history/:userId')
  @ApiOperation({ summary: '获取用户学习历史' })
  async getLearningHistory(@Param('userId') userId: string): Promise<Array<{
    timestamp: string;
    result: WeightLearningResult;
  }>> {
    return this.weightPersistence.getLearningHistory(userId);
  }

  // ========== 统计和管理 ==========

  @Get('stats')
  @ApiOperation({ summary: '获取优化系统统计信息' })
  async getStatistics(): Promise<{
    persistence: {
      totalUsers: number;
      totalFeedback: number;
      totalLearningRuns: number;
      avgFeedbackPerUser: number;
    };
    currentWeights: ObjectiveFunctionWeights;
  }> {
    const persistenceStats = await this.weightPersistence.getStatistics();
    
    return {
      persistence: persistenceStats,
      currentWeights: this.objectiveFunction.weights,
    };
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
  }> {
    return {
      status: 'healthy',
      services: {
        objectiveFunction: true,
        abuOptimizer: true,
        dreOptimizer: true,
        probabilisticModel: true,
        expectedUtility: true,
        guardianDebate: true,
        weightLearner: true,
        persistence: true,
      },
    };
  }
}
