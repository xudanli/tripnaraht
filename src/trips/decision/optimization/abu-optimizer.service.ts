// src/trips/decision/optimization/abu-optimizer.service.ts
/**
 * Abu 优化器服务（Phase 1 升级版）
 * 
 * 从"布尔判断规则引擎"升级为"约束满足度优化器"
 * 
 * 核心变化：
 * 1. 返回约束满足度分数（0-1），而不仅仅是 ALLOW/REJECT
 * 2. 提供修复建议和最小修改路径
 * 3. 与统一目标函数集成
 * 
 * Abu 的新职责：
 * - 约束强制器（Constraint Enforcer）
 * - 风险最小化人格（Risk Minimizer Persona）
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionPersonaStrategy } from '../strategies/decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult, DecisionLogEntry } from '../shared/decision-result.types';
import { ObjectiveFunctionService } from './objective-function.service';
import {
  ConstraintSatisfactionResult,
  ObjectiveEvaluationResult,
} from './objective-function.interface';

/**
 * Abu 约束评估结果
 */
export interface AbuConstraintEvaluationResult {
  /** 是否可行（所有硬约束满足） */
  isFeasible: boolean;
  
  /** 整体约束满足度 (0-1) */
  overallSatisfaction: number;
  
  /** 安全性分数 (0-1) */
  safetyScore: number;
  
  /** 硬约束检查结果 */
  hardConstraints: ConstraintSatisfactionResult[];
  
  /** 软约束检查结果 */
  softConstraints: ConstraintSatisfactionResult[];
  
  /** 风险热力图（每个路段的风险等级） */
  riskHeatmap: Array<{
    segmentId: string;
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    riskFactors: string[];
  }>;
  
  /** 修复建议 */
  repairSuggestions: Array<{
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    constraintId: string;
    suggestion: string;
    estimatedEffort: 'MINIMAL' | 'MODERATE' | 'SIGNIFICANT';
  }>;
  
  /** 决策置信度 */
  confidence: number;
}

/**
 * Abu 优化请求
 */
export interface AbuOptimizationRequest {
  /** 待评估的计划 */
  plan: RoutePlanDraft;
  
  /** 世界模型上下文 */
  world: WorldModelContext;
  
  /** 是否自动修复（如果可能） */
  autoRepair?: boolean;
  
  /** 最大修复迭代次数 */
  maxRepairIterations?: number;
  
  /** 风险容忍度覆盖（可选） */
  riskToleranceOverride?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Abu 优化响应
 */
export interface AbuOptimizationResponse {
  /** 是否允许继续 */
  allowed: boolean;
  
  /** 决策动作 */
  action: 'ALLOW' | 'REJECT' | 'ALLOW_WITH_CONDITIONS';
  
  /** 约束评估结果 */
  evaluation: AbuConstraintEvaluationResult;
  
  /** 目标函数评估结果 */
  objectiveEvaluation: ObjectiveEvaluationResult;
  
  /** 修复后的计划（如果有） */
  repairedPlan?: RoutePlanDraft;
  
  /** 决策日志 */
  logs: DecisionLogEntry[];
  
  /** 条件（如果 action 是 ALLOW_WITH_CONDITIONS） */
  conditions?: string[];
}

@Injectable()
export class AbuOptimizerService implements DecisionPersonaStrategy {
  private readonly logger = new Logger(AbuOptimizerService.name);
  readonly personaName = 'ABU' as const;

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
  ) {}

  /**
   * 评估计划（兼容旧接口）
   */
  async evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult> {
    const response = await this.optimizeConstraints({
      plan,
      world,
      autoRepair: false,
    });

    return {
      allowed: response.allowed,
      action: response.action === 'ALLOW_WITH_CONDITIONS' ? 'ALLOW' : response.action,
      updatedPlan: response.repairedPlan,
      logs: response.logs,
    };
  }

  /**
   * 约束优化（Phase 1 核心方法）
   * 
   * 从规则检查升级为约束优化
   */
  async optimizeConstraints(
    request: AbuOptimizationRequest
  ): Promise<AbuOptimizationResponse> {
    const { plan, world, autoRepair = false, maxRepairIterations = 3 } = request;
    
    this.logger.debug(`[Abu] 开始约束优化: ${plan.tripId}`);

    // 1. 使用目标函数评估
    const objectiveEvaluation = this.objectiveFunction.evaluate(plan, world);
    
    // 2. 详细约束评估
    const constraintEvaluation = this.evaluateConstraintsDetailed(plan, world, objectiveEvaluation);
    
    // 3. 生成修复建议
    const repairSuggestions = this.generateRepairSuggestions(constraintEvaluation);
    constraintEvaluation.repairSuggestions = repairSuggestions;
    
    // 4. 决策逻辑
    const { allowed, action, conditions } = this.makeDecision(
      constraintEvaluation,
      objectiveEvaluation,
      request.riskToleranceOverride || world.human.riskTolerance
    );
    
    // 5. 自动修复（如果启用且需要）
    let repairedPlan: RoutePlanDraft | undefined;
    if (autoRepair && !allowed && constraintEvaluation.isFeasible === false) {
      repairedPlan = await this.attemptAutoRepair(plan, world, maxRepairIterations);
    }
    
    // 6. 生成决策日志
    const logs = this.generateDecisionLogs(constraintEvaluation, objectiveEvaluation, action);
    
    return {
      allowed,
      action,
      evaluation: constraintEvaluation,
      objectiveEvaluation,
      repairedPlan,
      logs,
      conditions,
    };
  }

  /**
   * 详细约束评估
   */
  private evaluateConstraintsDetailed(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    objectiveEvaluation: ObjectiveEvaluationResult
  ): AbuConstraintEvaluationResult {
    // 从目标函数获取约束检查结果
    const constraintResults = this.objectiveFunction.checkConstraints(plan, world);
    
    // 分离硬约束和软约束
    const hardConstraints = constraintResults.filter(c => 
      this.objectiveFunction.hardConstraints.some(hc => hc.id === c.constraintId)
    );
    const softConstraints = constraintResults.filter(c => 
      this.objectiveFunction.softConstraints.some(sc => sc.id === c.constraintId)
    );
    
    // 计算整体满足度
    const hardSatisfaction = hardConstraints.length > 0
      ? hardConstraints.reduce((sum, c) => sum + c.satisfactionScore, 0) / hardConstraints.length
      : 1;
    const softSatisfaction = softConstraints.length > 0
      ? softConstraints.reduce((sum, c) => sum + c.satisfactionScore, 0) / softConstraints.length
      : 1;
    
    // 整体满足度：硬约束权重更高
    const overallSatisfaction = 0.7 * hardSatisfaction + 0.3 * softSatisfaction;
    
    // 生成风险热力图
    const riskHeatmap = this.generateRiskHeatmap(plan, world);
    
    // 计算决策置信度
    const confidence = this.calculateConfidence(constraintResults, world);
    
    return {
      isFeasible: objectiveEvaluation.isFeasible,
      overallSatisfaction,
      safetyScore: objectiveEvaluation.breakdown.safetyScore,
      hardConstraints,
      softConstraints,
      riskHeatmap,
      repairSuggestions: [], // 将在后续填充
      confidence,
    };
  }

  /**
   * 风险等级优先级（用于比较）
   */
  private readonly RISK_PRIORITY: Record<string, number> = {
    'NONE': 0,
    'LOW': 1,
    'MEDIUM': 2,
    'HIGH': 3,
    'CRITICAL': 4,
  };

  /**
   * 提升风险等级
   */
  private elevateRiskLevel(
    current: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    target: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    return this.RISK_PRIORITY[target] > this.RISK_PRIORITY[current] ? target : current;
  }

  /**
   * 生成风险热力图
   */
  private generateRiskHeatmap(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): AbuConstraintEvaluationResult['riskHeatmap'] {
    const heatmap: AbuConstraintEvaluationResult['riskHeatmap'] = [];
    
    for (const segment of plan.segments) {
      const riskFactors: string[] = [];
      let maxRiskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'NONE';
      
      // 检查 DEM 风险
      const demEvidence = world.physical.demEvidence.find(
        d => d.segmentId === segment.segmentId
      );
      if (demEvidence) {
        if (demEvidence.violation === 'HARD') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'CRITICAL');
          riskFactors.push(`DEM 硬违规: ${demEvidence.explanation}`);
        } else if (demEvidence.violation === 'SOFT') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'MEDIUM');
          riskFactors.push(`DEM 软违规: ${demEvidence.explanation}`);
        }
        
        // 疲劳指数风险
        if (demEvidence.fatigueIndex > 1.4) {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'HIGH');
          riskFactors.push(`高疲劳指数: ${demEvidence.fatigueIndex.toFixed(2)}`);
        } else if (demEvidence.fatigueIndex > 1.1) {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'MEDIUM');
          riskFactors.push(`中等疲劳指数: ${demEvidence.fatigueIndex.toFixed(2)}`);
        }
      }
      
      // 检查道路风险
      const roadState = world.physical.roadStates.find(
        r => segment.metadata?.roadId === r.roadId
      );
      if (roadState) {
        if (roadState.status === 'CLOSED') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'CRITICAL');
          riskFactors.push('道路关闭');
        } else if (roadState.status === 'RESTRICTED' || roadState.status === 'SEASONAL') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'MEDIUM');
          riskFactors.push('道路受限开放');
        }
      }
      
      // 检查危险区域
      for (const hazard of world.physical.hazardZones) {
        // 简化：检查是否在危险区域附近
        if (hazard.level === 'HIGH') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'HIGH');
          riskFactors.push(`高风险区域: ${hazard.type}`);
        } else if (hazard.level === 'MEDIUM') {
          maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'MEDIUM');
          riskFactors.push(`中风险区域: ${hazard.type}`);
        }
      }
      
      // 坡度风险
      if (segment.slopePct > 30) {
        maxRiskLevel = this.elevateRiskLevel(maxRiskLevel, 'MEDIUM');
        riskFactors.push(`陡峭坡度: ${segment.slopePct}%`);
      }
      
      if (riskFactors.length === 0) {
        maxRiskLevel = 'NONE';
      }
      
      heatmap.push({
        segmentId: segment.segmentId,
        riskLevel: maxRiskLevel,
        riskFactors,
      });
    }
    
    return heatmap;
  }

  /**
   * 生成修复建议
   */
  private generateRepairSuggestions(
    evaluation: AbuConstraintEvaluationResult
  ): AbuConstraintEvaluationResult['repairSuggestions'] {
    const suggestions: AbuConstraintEvaluationResult['repairSuggestions'] = [];
    
    // 处理硬约束违反
    for (const constraint of evaluation.hardConstraints) {
      if (!constraint.satisfied) {
        suggestions.push({
          priority: 'CRITICAL',
          constraintId: constraint.constraintId,
          suggestion: constraint.repairSuggestion || this.getDefaultRepairSuggestion(constraint.constraintId),
          estimatedEffort: 'SIGNIFICANT',
        });
      }
    }
    
    // 处理软约束违反
    for (const constraint of evaluation.softConstraints) {
      if (!constraint.satisfied && constraint.violationDegree > 0.3) {
        suggestions.push({
          priority: constraint.violationDegree > 0.5 ? 'HIGH' : 'MEDIUM',
          constraintId: constraint.constraintId,
          suggestion: constraint.repairSuggestion || this.getDefaultRepairSuggestion(constraint.constraintId),
          estimatedEffort: constraint.violationDegree > 0.5 ? 'MODERATE' : 'MINIMAL',
        });
      }
    }
    
    // 处理高风险路段
    const criticalSegments = evaluation.riskHeatmap.filter(
      s => s.riskLevel === 'CRITICAL' || s.riskLevel === 'HIGH'
    );
    for (const segment of criticalSegments) {
      if (!suggestions.some(s => s.suggestion.includes(segment.segmentId))) {
        suggestions.push({
          priority: segment.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          constraintId: `SEGMENT_${segment.segmentId}`,
          suggestion: `路段 ${segment.segmentId} 存在风险: ${segment.riskFactors.join(', ')}`,
          estimatedEffort: 'MODERATE',
        });
      }
    }
    
    // 按优先级排序
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    return suggestions;
  }

  /**
   * 获取默认修复建议
   */
  private getDefaultRepairSuggestion(constraintId: string): string {
    const suggestions: Record<string, string> = {
      'HC_DEM_VIOLATION': '需要重新规划路线，避开超过能力范围的路段',
      'HC_ROAD_CLOSED': '需要选择替代道路或等待道路开放',
      'HC_HAZARD_ZONE': '需要避开危险区域或选择其他时间',
      'HC_COMPLIANCE': '需要获取必要许可或安排向导',
      'HC_ALTITUDE': '需要降低最高海拔或增加适应时间',
      'SC_FATIGUE': '建议拆分高负荷天或插入休息日',
      'SC_ROLLING_ASCENT': '建议调整连续几天的爬升分配',
      'SC_BUDGET': '建议优化预算分配',
      'SC_WEATHER': '建议关注天气预报并准备备选方案',
      'SC_PHILOSOPHY': '建议确保计划符合路线核心精神',
    };
    
    return suggestions[constraintId] || '需要进一步分析并调整计划';
  }

  /**
   * 计算决策置信度
   */
  private calculateConfidence(
    constraintResults: ConstraintSatisfactionResult[],
    world: WorldModelContext
  ): number {
    let confidence = 0.8; // 基础置信度
    
    // 数据完整性影响
    const demEvidence = world.physical.demEvidence;
    if (demEvidence.length === 0 || demEvidence.every(e => e.segmentId.includes('placeholder'))) {
      confidence -= 0.3; // DEM 数据缺失
    }
    
    // 约束检查一致性
    const satisfactionVariance = this.calculateVariance(
      constraintResults.map(c => c.satisfactionScore)
    );
    if (satisfactionVariance > 0.2) {
      confidence -= 0.1; // 约束满足度差异大
    }
    
    // 用户能力数据置信度
    if (world.human.confidenceLevel === 'LOW') {
      confidence -= 0.1;
    } else if (world.human.confidenceLevel === 'HIGH') {
      confidence += 0.1;
    }
    
    return Math.max(0.3, Math.min(1, confidence));
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length;
  }

  /**
   * 做出决策
   */
  private makeDecision(
    evaluation: AbuConstraintEvaluationResult,
    objectiveEvaluation: ObjectiveEvaluationResult,
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH'
  ): { allowed: boolean; action: 'ALLOW' | 'REJECT' | 'ALLOW_WITH_CONDITIONS'; conditions?: string[] } {
    
    // 1. 硬约束违反 → 必须 REJECT
    if (!evaluation.isFeasible) {
      return { allowed: false, action: 'REJECT' };
    }
    
    // 2. 安全性分数过低 → REJECT
    const safetyThreshold = riskTolerance === 'LOW' ? 0.7 
      : riskTolerance === 'HIGH' ? 0.4 
      : 0.5;
    
    if (evaluation.safetyScore < safetyThreshold) {
      return { allowed: false, action: 'REJECT' };
    }
    
    // 3. 整体满足度低 → ALLOW_WITH_CONDITIONS
    const satisfactionThreshold = riskTolerance === 'LOW' ? 0.8 
      : riskTolerance === 'HIGH' ? 0.5 
      : 0.6;
    
    if (evaluation.overallSatisfaction < satisfactionThreshold) {
      const conditions = evaluation.repairSuggestions
        .filter(s => s.priority === 'CRITICAL' || s.priority === 'HIGH')
        .map(s => s.suggestion);
      
      return {
        allowed: true,
        action: 'ALLOW_WITH_CONDITIONS',
        conditions,
      };
    }
    
    // 4. 一切正常 → ALLOW
    return { allowed: true, action: 'ALLOW' };
  }

  /**
   * 尝试自动修复
   */
  private async attemptAutoRepair(
    plan: RoutePlanDraft,
    _world: WorldModelContext,
    _maxIterations: number
  ): Promise<RoutePlanDraft | undefined> {
    this.logger.debug(`[Abu] 尝试自动修复计划: ${plan.tripId}`);
    
    // Phase 1 简化：暂不实现自动修复
    // Phase 2 将引入更复杂的修复策略
    
    return undefined;
  }

  /**
   * 生成决策日志
   */
  private generateDecisionLogs(
    evaluation: AbuConstraintEvaluationResult,
    objectiveEvaluation: ObjectiveEvaluationResult,
    action: 'ALLOW' | 'REJECT' | 'ALLOW_WITH_CONDITIONS'
  ): DecisionLogEntry[] {
    const logs: DecisionLogEntry[] = [];
    
    // 主决策日志
    const reasonCodes: string[] = [];
    const evidenceRefs: string[] = [];
    
    for (const constraint of evaluation.hardConstraints) {
      if (!constraint.satisfied) {
        reasonCodes.push(constraint.constraintId);
        if (constraint.violationExplanation) {
          evidenceRefs.push(constraint.violationExplanation);
        }
      }
    }
    
    for (const constraint of evaluation.softConstraints) {
      if (!constraint.satisfied && constraint.violationDegree > 0.3) {
        reasonCodes.push(constraint.constraintId);
      }
    }
    
    let explanation: string;
    if (action === 'REJECT') {
      explanation = `检测到 ${reasonCodes.length} 个约束违反，整体满足度 ${(evaluation.overallSatisfaction * 100).toFixed(1)}%，安全性分数 ${(evaluation.safetyScore * 100).toFixed(1)}%`;
    } else if (action === 'ALLOW_WITH_CONDITIONS') {
      explanation = `允许继续，但存在 ${evaluation.repairSuggestions.length} 个需要注意的风险点，建议采取相应措施`;
    } else {
      explanation = `通过所有约束检查，整体满足度 ${(evaluation.overallSatisfaction * 100).toFixed(1)}%，安全性分数 ${(evaluation.safetyScore * 100).toFixed(1)}%`;
    }
    
    logs.push({
      persona: 'ABU',
      action: action === 'ALLOW_WITH_CONDITIONS' ? 'ALLOW' : action,
      explanation,
      reasonCodes,
      evidenceRefs,
      timestamp: new Date().toISOString(),
      decisionSource: 'PHYSICAL',
      decisionStage: 'ABU_GATE',
    });
    
    // 风险摘要日志
    const criticalSegments = evaluation.riskHeatmap.filter(
      s => s.riskLevel === 'CRITICAL' || s.riskLevel === 'HIGH'
    );
    if (criticalSegments.length > 0) {
      logs.push({
        persona: 'ABU',
        action: 'ALLOW',
        explanation: `识别到 ${criticalSegments.length} 个高风险路段，需要特别注意`,
        reasonCodes: criticalSegments.map(s => `RISK_${s.riskLevel}_${s.segmentId}`),
        evidenceRefs: criticalSegments.flatMap(s => s.riskFactors),
        timestamp: new Date().toISOString(),
        decisionSource: 'PHYSICAL',
        decisionStage: 'ABU_GATE',
      });
    }
    
    return logs;
  }

  /**
   * 获取约束评估摘要（用于 UI 展示）
   */
  getEvaluationSummary(evaluation: AbuConstraintEvaluationResult): {
    status: 'SAFE' | 'CAUTION' | 'DANGER';
    statusEmoji: string;
    headline: string;
    details: string[];
  } {
    if (!evaluation.isFeasible) {
      return {
        status: 'DANGER',
        statusEmoji: '🚫',
        headline: '存在不可接受的风险',
        details: evaluation.repairSuggestions
          .filter(s => s.priority === 'CRITICAL')
          .map(s => s.suggestion),
      };
    }
    
    if (evaluation.overallSatisfaction < 0.6 || evaluation.safetyScore < 0.5) {
      return {
        status: 'CAUTION',
        statusEmoji: '⚠️',
        headline: '存在需要注意的风险',
        details: evaluation.repairSuggestions
          .filter(s => s.priority === 'CRITICAL' || s.priority === 'HIGH')
          .map(s => s.suggestion),
      };
    }
    
    return {
      status: 'SAFE',
      statusEmoji: '✅',
      headline: '安全检查通过',
      details: [`整体满足度: ${(evaluation.overallSatisfaction * 100).toFixed(0)}%`],
    };
  }
}
