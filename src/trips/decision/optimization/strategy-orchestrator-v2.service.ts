// src/trips/decision/optimization/strategy-orchestrator-v2.service.ts
/**
 * 策略编排器 V2（Phase 1 升级版）
 * 
 * 整合 Abu 优化器 + Dre 优化器 + Neptune（待升级）
 * 
 * 核心变化：
 * 1. 所有决策都基于统一目标函数
 * 2. 返回效用分数和权衡分析
 * 3. 支持多候选方案比较
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult, DecisionLogEntry } from '../shared/decision-result.types';
import { ObjectiveFunctionService } from './objective-function.service';
import { AbuOptimizerService, AbuOptimizationResponse } from './abu-optimizer.service';
import { DreOptimizerService, DreOptimizationResult } from './dre-optimizer.service';
import { NeptuneStrategy } from '../strategies/neptune-strategy.service';
import { ObjectiveEvaluationResult, CandidateComparisonResult } from './objective-function.interface';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
import { enrichOptimizeResultChooseFields } from '../shared/guardian-choose-options.util';

/**
 * V2 编排结果
 */
export interface StrategyOrchestrationResultV2 {
  /** 最终计划（可能经过优化） */
  plan: RoutePlanDraft | null;
  
  /** 是否允许继续 */
  allowed: boolean;
  
  /** 最终动作 */
  finalAction: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
  
  /** 决策日志 */
  logs: DecisionLogEntry[];
  
  /** 目标函数评估（最终计划） */
  objectiveEvaluation: ObjectiveEvaluationResult;
  
  /** Abu 评估详情 */
  abuResult: AbuOptimizationResponse;
  
  /** Dre 优化详情 */
  dreResult: DreOptimizationResult;
  
  /** Neptune 修复详情（如果触发） */
  neptuneResult?: DecisionResult;
  
  /** 优化摘要 */
  summary: {
    /** 原始效用 */
    originalUtility: number;
    /** 最终效用 */
    finalUtility: number;
    /** 效用提升百分比（可为负，表示优化后更差） */
    improvementPct: number;
    /** 变更项数量（用于前端展示「共X项变更」） */
    changeCount?: number;
    /** 效用是否下降（优化后更差，前端可展示「以满足约束为主，综合评分略有下降」） */
    utilityDecreased?: boolean;
    /** 安全性分数 */
    safetyScore: number;
    /** 约束满足度 */
    constraintSatisfaction: number;
    /** 决策置信度 */
    confidence: number;
  };
  
  /** 用户判断点（需要用户确认的权衡） */
  userJudgmentPoints?: Array<{
    id: string;
    question: string;
    options: string[];
    recommendation: string;
  }>;

  /** 扁平 CHOOSE 选项 — 与 negotiation humanDecisionPoints 对齐 */
  humanDecisionPointsFlat?: string[];

  /** 是否需要用户 CHOOSE */
  chooseRequired?: boolean;

  /** 硬约束 BLOCK — 禁用 CHOOSE */
  hardConstraintBlocked?: boolean;
}

/**
 * V2 编排配置
 */
export interface OrchestrationConfigV2 {
  /** 是否启用 Abu 优化 */
  enableAbuOptimization?: boolean;
  
  /** 是否启用 Dre 优化 */
  enableDreOptimization?: boolean;
  
  /** 是否启用 Neptune 修复 */
  enableNeptuneRepair?: boolean;
  
  /** 最大优化轮数 */
  maxOptimizationRounds?: number;
  
  /** 收敛阈值（效用提升低于此值停止优化） */
  convergenceThreshold?: number;
  
  /** 是否自动应用优化 */
  autoApplyOptimization?: boolean;
}

const DEFAULT_CONFIG: OrchestrationConfigV2 = {
  enableAbuOptimization: true,
  enableDreOptimization: true,
  enableNeptuneRepair: true,
  maxOptimizationRounds: 3,
  convergenceThreshold: 0.01,
  autoApplyOptimization: true,
};

@Injectable()
export class StrategyOrchestratorV2Service {
  private readonly logger = new Logger(StrategyOrchestratorV2Service.name);

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly abuOptimizer: AbuOptimizerService,
    private readonly dreOptimizer: DreOptimizerService,
    @Optional() private readonly neptune?: NeptuneStrategy,
    @Optional() private readonly contextEngineer?: ContextEngineerService,
  ) {}

  /**
   * V2 编排流程
   * 
   * 流程：
   * 1. Abu 约束评估
   * 2. 如果 Abu 允许，Dre 时序优化
   * 3. 如果需要，Neptune 空间修复
   * 4. 汇总结果
   */
  async run(
    world: WorldModelContext,
    plan: RoutePlanDraft,
    config: OrchestrationConfigV2 = DEFAULT_CONFIG
  ): Promise<StrategyOrchestrationResultV2> {
    this.logger.log(`[OrchestratorV2] 开始编排: ${plan.tripId}`);
    
    const allLogs: DecisionLogEntry[] = [];
    let currentPlan = plan;
    
    // 0. 评估原始计划
    const originalEvaluation = this.objectiveFunction.evaluate(plan, world);
    const rawUtil = originalEvaluation.totalUtility;
    this.logger.debug(`[OrchestratorV2] 原始效用: ${typeof rawUtil === 'number' && !Number.isNaN(rawUtil) ? rawUtil.toFixed(3) : 'NaN(已兜底)'}`);

    // 1. Abu 约束评估
    this.logger.debug('[OrchestratorV2] 执行 Abu 约束优化...');
    const abuResult = await this.abuOptimizer.optimizeConstraints({
      plan: currentPlan,
      world,
      autoRepair: false,
    });
    allLogs.push(...abuResult.logs);

    // 如果 Abu 拒绝，直接返回
    if (!abuResult.allowed && abuResult.action === 'REJECT') {
      this.logger.warn(`[OrchestratorV2] Abu 拒绝计划: ${plan.tripId}`);
      
      // 尝试 Neptune 修复
      let neptuneResult: DecisionResult | undefined;
      if (config.enableNeptuneRepair && this.neptune) {
        this.logger.debug('[OrchestratorV2] 尝试 Neptune 修复...');
        neptuneResult = await this.neptune.evaluate(world, currentPlan);
        allLogs.push(...neptuneResult.logs);
        
        if (neptuneResult.action === 'REPLACE' && neptuneResult.updatedPlan) {
          currentPlan = neptuneResult.updatedPlan;
          
          // 重新评估
          const repairEvaluation = this.objectiveFunction.evaluate(currentPlan, world);
          
          return this.enrichResult({
            plan: currentPlan,
            allowed: repairEvaluation.isFeasible,
            finalAction: 'REPLACE',
            logs: allLogs,
            objectiveEvaluation: repairEvaluation,
            abuResult,
            dreResult: null as any, // Dre 未执行
            neptuneResult,
            summary: this.buildSummary(originalEvaluation, repairEvaluation, abuResult, null),
          });
        }
      }
      
      return this.enrichResult({
        plan: null,
        allowed: false,
        finalAction: 'REJECT',
        logs: allLogs,
        objectiveEvaluation: abuResult.objectiveEvaluation,
        abuResult,
        dreResult: null as any,
        neptuneResult,
        summary: this.buildSummary(originalEvaluation, abuResult.objectiveEvaluation, abuResult, null),
      });
    }

    // 2. Dre 时序优化
    let dreResult: DreOptimizationResult;
    if (config.enableDreOptimization) {
      this.logger.debug('[OrchestratorV2] 执行 Dre 时序优化...');
      dreResult = await this.dreOptimizer.optimizeSchedule(currentPlan, world);
      allLogs.push(...dreResult.logs);
      
      if (dreResult.needsAdjustment && config.autoApplyOptimization) {
        currentPlan = dreResult.recommendedCandidate.plan;
        const pct = dreResult.summary?.improvementPct;
        this.logger.debug(`[OrchestratorV2] Dre 优化效用提升: ${typeof pct === 'number' && !Number.isNaN(pct) ? pct.toFixed(1) : 0}%`);
      }
    } else {
      // 如果不启用 Dre，创建一个空结果
      dreResult = {
        needsAdjustment: false,
        recommendedCandidate: {
          type: 'ORIGINAL',
          plan: currentPlan,
          evaluation: originalEvaluation,
          modifications: [],
          utilityImprovement: 0,
          fatigueStats: { mean: 0, variance: 0, max: 0, overloadedDays: 0 },
        },
        allCandidates: [],
        comparison: {
          bestIndex: 0,
          evaluations: [originalEvaluation],
          ranking: [0],
          tradeoffAnalysis: { pairwise: [] },
        },
        logs: [],
        summary: {
          originalUtility: originalEvaluation.totalUtility,
          optimizedUtility: originalEvaluation.totalUtility,
          improvement: 0,
          improvementPct: 0,
        },
      };
    }

    // 3. 最终评估
    const finalEvaluation = this.objectiveFunction.evaluate(currentPlan, world);
    
    // 4. 检查是否需要用户判断
    const userJudgmentPoints = this.identifyUserJudgmentPoints(
      abuResult,
      dreResult,
      finalEvaluation
    );

    // 5. 确定最终动作
    const finalAction = this.determineFinalAction(
      abuResult,
      dreResult,
      currentPlan !== plan
    );

    return this.enrichResult({
      plan: currentPlan,
      allowed: true,
      finalAction,
      logs: allLogs,
      objectiveEvaluation: finalEvaluation,
      abuResult,
      dreResult,
      summary: this.buildSummary(originalEvaluation, finalEvaluation, abuResult, dreResult),
      userJudgmentPoints,
    });
  }

  private enrichResult(result: StrategyOrchestrationResultV2): StrategyOrchestrationResultV2 {
    return enrichOptimizeResultChooseFields(result);
  }

  /**
   * 构建优化摘要
   */
  private buildSummary(
    originalEvaluation: ObjectiveEvaluationResult,
    finalEvaluation: ObjectiveEvaluationResult,
    abuResult: AbuOptimizationResponse,
    dreResult?: DreOptimizationResult | null
  ): StrategyOrchestrationResultV2['summary'] {
    const orig = typeof originalEvaluation.totalUtility === 'number' && !Number.isNaN(originalEvaluation.totalUtility)
      ? originalEvaluation.totalUtility : 0;
    const final_ = typeof finalEvaluation.totalUtility === 'number' && !Number.isNaN(finalEvaluation.totalUtility)
      ? finalEvaluation.totalUtility : 0;
    const improvement = final_ - orig;
    const improvementPct = orig > 0 ? (improvement / orig) * 100 : 0;
    const changeCount = dreResult?.recommendedCandidate?.modifications?.length ?? 0;
    const utilityDecreased = improvementPct < 0;
    return {
      originalUtility: orig,
      finalUtility: final_,
      improvementPct: Number.isNaN(improvementPct) ? 0 : improvementPct,
      changeCount,
      utilityDecreased,
      safetyScore: finalEvaluation.breakdown?.safetyScore ?? 0,
      constraintSatisfaction: abuResult.evaluation?.overallSatisfaction ?? 0,
      confidence: abuResult.evaluation?.confidence ?? 0,
    };
  }

  /**
   * 识别用户判断点
   */
  private identifyUserJudgmentPoints(
    abuResult: AbuOptimizationResponse,
    dreResult: DreOptimizationResult,
    _finalEvaluation: ObjectiveEvaluationResult
  ): StrategyOrchestrationResultV2['userJudgmentPoints'] {
    const points: StrategyOrchestrationResultV2['userJudgmentPoints'] = [];

    // 1. 安全性与体验的权衡
    if (abuResult.action === 'ALLOW_WITH_CONDITIONS') {
      points.push({
        id: 'SAFETY_TRADEOFF',
        question: '存在一些风险点，是否接受？',
        options: ['接受风险，继续计划', '调整计划以降低风险'],
        recommendation: '建议采取预防措施后继续',
      });
    }

    // 2. 节奏与天数的权衡
    if (dreResult.needsAdjustment && dreResult.recommendedCandidate.type === 'INSERT_BUFFER') {
      points.push({
        id: 'PACING_TRADEOFF',
        question: '建议增加休息日以降低疲劳风险，这会增加总天数',
        options: ['接受增加天数', '保持原计划'],
        recommendation: '建议增加休息日',
      });
    }

    // 3. 多方案选择
    if (dreResult.allCandidates.length > 2) {
      const alternatives = dreResult.allCandidates
        .filter(c => c.type !== 'ORIGINAL')
        .map(c => `${this.getCandidateLabel(c.type)}: 效用 ${c.evaluation?.totalUtility.toFixed(2) || 'N/A'}`);
      
      if (alternatives.length > 1) {
        points.push({
          id: 'ALTERNATIVE_PLANS',
          question: '发现多个优化方案，请选择偏好',
          options: ['自动选择最优', ...alternatives],
          recommendation: `推荐: ${this.getCandidateLabel(dreResult.recommendedCandidate.type)}`,
        });
      }
    }

    return points.length > 0 ? points : undefined;
  }

  /**
   * 获取候选类型标签
   */
  private getCandidateLabel(type: string): string {
    const labels: Record<string, string> = {
      ORIGINAL: '原始方案',
      SPLIT_DAY: '拆天方案',
      INSERT_BUFFER: '增加休息日',
      REORDER_SEGMENTS: '重排序方案',
      LOAD_BALANCE: '负载均衡方案',
    };
    return labels[type] || type;
  }

  /**
   * 确定最终动作
   */
  private determineFinalAction(
    abuResult: AbuOptimizationResponse,
    dreResult: DreOptimizationResult,
    planModified: boolean
  ): 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE' {
    if (!abuResult.allowed) {
      return 'REJECT';
    }
    
    if (planModified) {
      return dreResult.needsAdjustment ? 'ADJUST' : 'ALLOW';
    }
    
    return 'ALLOW';
  }

  /**
   * 快速评估（不执行优化，仅评估）
   */
  async quickEvaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<{
    utility: number;
    isFeasible: boolean;
    safetyScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    summary: string;
  }> {
    const evaluation = this.objectiveFunction.evaluate(plan, world);
    
    const riskLevel = evaluation.breakdown.safetyScore > 0.8 ? 'LOW'
      : evaluation.breakdown.safetyScore > 0.6 ? 'MEDIUM'
      : evaluation.breakdown.safetyScore > 0.4 ? 'HIGH'
      : 'CRITICAL';
    
    return {
      utility: evaluation.totalUtility,
      isFeasible: evaluation.isFeasible,
      safetyScore: evaluation.breakdown.safetyScore,
      riskLevel,
      summary: `效用: ${(evaluation.totalUtility * 100).toFixed(0)}%, 安全: ${(evaluation.breakdown.safetyScore * 100).toFixed(0)}%, 风险: ${riskLevel}`,
    };
  }

  /**
   * 比较多个计划
   */
  async comparePlans(
    world: WorldModelContext,
    plans: RoutePlanDraft[]
  ): Promise<CandidateComparisonResult> {
    return this.objectiveFunction.compareCandidates(plans, world);
  }
}
