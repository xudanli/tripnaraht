// src/trips/decision/optimization/axioms/axiom-validator.service.ts
/**
 * 公理验证服务
 * 
 * 确保系统运行时始终符合七条公理
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  AxiomId,
  AxiomViolationError,
  HierarchicalUtilityStructure,
  RobustnessConstraints,
  DEFAULT_ROBUSTNESS_CONSTRAINTS,
  DEFAULT_LEARNABLE_BOUNDS,
  LearnableParameterBounds,
  AgentRole,
  AgentOperationResult,
  AGENT_EXECUTION_ORDER,
  validateHierarchicalWeights,
  validateParameterUpdate,
  validateAgentOperation,
  evaluateRobustness,
} from './axiom-system';

/**
 * 公理验证报告
 */
export interface AxiomValidationReport {
  /** 验证时间 */
  validatedAt: string;
  
  /** 总体是否符合 */
  allAxiomsValid: boolean;
  
  /** 各公理验证结果 */
  axiomResults: {
    axiomId: AxiomId;
    axiomName: string;
    isValid: boolean;
    violations: string[];
    warnings: string[];
  }[];
  
  /** 建议 */
  recommendations: string[];
}

/**
 * 运行时监控数据
 */
interface RuntimeMonitoringData {
  /** 最近的分数验证 */
  recentScoreValidations: Array<{
    score: number;
    source: string;
    timestamp: string;
    isValid: boolean;
  }>;
  
  /** 最近的权重更新 */
  recentWeightUpdates: Array<{
    paramName: string;
    oldValue: number;
    newValue: number;
    timestamp: string;
    isValid: boolean;
  }>;
  
  /** 最近的智能体操作 */
  recentAgentOperations: AgentOperationResult[];
  
  /** 公理违规计数 */
  violationCounts: Record<AxiomId, number>;
}

@Injectable()
export class AxiomValidatorService {
  private readonly logger = new Logger(AxiomValidatorService.name);
  
  private monitoringData: RuntimeMonitoringData = {
    recentScoreValidations: [],
    recentWeightUpdates: [],
    recentAgentOperations: [],
    violationCounts: {
      'AXIOM_1_NORMALIZATION': 0,
      'AXIOM_2_HIERARCHY': 0,
      'AXIOM_3_FEASIBILITY': 0,
      'AXIOM_4_UNCERTAINTY': 0,
      'AXIOM_5_ROBUSTNESS': 0,
      'AXIOM_6_ADAPTIVE': 0,
      'AXIOM_7_MULTI_AGENT': 0,
    },
  };

  /**
   * 公理一验证：分数标准化
   */
  validateNormalization(score: number, source: string): boolean {
    const isValid = score >= 0 && score <= 1;
    
    this.monitoringData.recentScoreValidations.push({
      score,
      source,
      timestamp: new Date().toISOString(),
      isValid,
    });
    
    // 限制历史记录
    if (this.monitoringData.recentScoreValidations.length > 1000) {
      this.monitoringData.recentScoreValidations.shift();
    }
    
    if (!isValid) {
      this.monitoringData.violationCounts['AXIOM_1_NORMALIZATION']++;
      this.logger.warn(`[Axiom1] 分数 ${score} (${source}) 违反标准化公理`);
    }
    
    return isValid;
  }

  /**
   * 公理二验证：分层结构
   */
  validateHierarchy(structure: HierarchicalUtilityStructure): boolean {
    try {
      validateHierarchicalWeights(structure);
      return true;
    } catch (error) {
      if (error instanceof AxiomViolationError) {
        this.monitoringData.violationCounts['AXIOM_2_HIERARCHY']++;
        this.logger.warn(`[Axiom2] ${error.message}`);
      }
      return false;
    }
  }

  /**
   * 公理三验证：硬约束优先
   */
  validateFeasibilityPrecedence(
    utility: number,
    hasHardViolations: boolean,
  ): boolean {
    // 如果有硬约束违规但效用不是 -Infinity，则违反公理三
    if (hasHardViolations && utility !== -Infinity && isFinite(utility)) {
      this.monitoringData.violationCounts['AXIOM_3_FEASIBILITY']++;
      this.logger.warn(`[Axiom3] 存在硬约束违规但效用 ${utility} 不是 -Infinity`);
      return false;
    }
    return true;
  }

  /**
   * 公理四验证：不确定性一致性
   * 
   * 验证概率层是否正确包装确定性层
   */
  validateUncertaintyConsistency(
    deterministicUtility: number,
    probabilisticExpectedUtility: number,
    worldStateSamples: number,
    tolerance: number = 0.1,
  ): boolean {
    // 当只有一个样本时，期望效用应等于确定性效用
    if (worldStateSamples === 1) {
      const diff = Math.abs(probabilisticExpectedUtility - deterministicUtility);
      if (diff > tolerance) {
        this.monitoringData.violationCounts['AXIOM_4_UNCERTAINTY']++;
        this.logger.warn(
          `[Axiom4] 单样本时期望效用 ${probabilisticExpectedUtility} 与确定性效用 ${deterministicUtility} 差异过大`,
        );
        return false;
      }
    }
    return true;
  }

  /**
   * 公理五验证：稳健性
   */
  validateRobustness(
    utilities: number[],
    feasibilityProb: number,
    constraints: RobustnessConstraints = DEFAULT_ROBUSTNESS_CONSTRAINTS,
  ): {
    isValid: boolean;
    evaluation: ReturnType<typeof evaluateRobustness>;
  } {
    const evaluation = evaluateRobustness(utilities, feasibilityProb, constraints);
    
    if (!evaluation.satisfiesRobustnessConstraints) {
      this.monitoringData.violationCounts['AXIOM_5_ROBUSTNESS']++;
      this.logger.warn(
        `[Axiom5] 稳健性约束违反: ${evaluation.violatedConstraints.join(', ')}`,
      );
    }
    
    return {
      isValid: evaluation.satisfiesRobustnessConstraints,
      evaluation,
    };
  }

  /**
   * 公理六验证：自适应一致性
   */
  validateAdaptiveConsistency(
    paramName: string,
    newValue: number,
    bounds: LearnableParameterBounds = DEFAULT_LEARNABLE_BOUNDS,
  ): boolean {
    try {
      // 根据参数类型选择边界
      let paramBounds: { min: number; max: number };
      
      if (paramName.includes('Weight') || paramName.includes('weight')) {
        paramBounds = bounds.dimensionWeights;
      } else if (paramName === 'theta1' || paramName === 'minFeasibilityProbability') {
        paramBounds = bounds.riskThresholds.theta1;
      } else if (paramName === 'theta2' || paramName === 'maxDownsideRisk') {
        paramBounds = bounds.riskThresholds.theta2;
      } else if (paramName === 'tau' || paramName === 'neutralUtilityThreshold') {
        paramBounds = bounds.riskThresholds.tau;
      } else {
        paramBounds = { min: 0, max: 1 };
      }
      
      validateParameterUpdate(paramName, newValue, paramBounds);
      
      this.monitoringData.recentWeightUpdates.push({
        paramName,
        oldValue: 0, // 需要外部提供
        newValue,
        timestamp: new Date().toISOString(),
        isValid: true,
      });
      
      return true;
    } catch (error) {
      if (error instanceof AxiomViolationError) {
        this.monitoringData.violationCounts['AXIOM_6_ADAPTIVE']++;
        this.logger.warn(`[Axiom6] ${error.message}`);
      }
      return false;
    }
  }

  /**
   * 公理七验证：多智能体一致性
   */
  validateMultiAgentConsistency(operation: AgentOperationResult): boolean {
    try {
      validateAgentOperation(operation);
      
      this.monitoringData.recentAgentOperations.push(operation);
      
      // 限制历史记录
      if (this.monitoringData.recentAgentOperations.length > 100) {
        this.monitoringData.recentAgentOperations.shift();
      }
      
      return true;
    } catch (error) {
      if (error instanceof AxiomViolationError) {
        this.monitoringData.violationCounts['AXIOM_7_MULTI_AGENT']++;
        this.logger.warn(`[Axiom7] ${error.message}`);
      }
      return false;
    }
  }

  /**
   * 验证智能体执行顺序
   */
  validateAgentExecutionOrder(executedOrder: AgentRole[]): boolean {
    for (let i = 0; i < executedOrder.length; i++) {
      const expectedAgent = AGENT_EXECUTION_ORDER[i];
      if (executedOrder[i] !== expectedAgent) {
        this.monitoringData.violationCounts['AXIOM_7_MULTI_AGENT']++;
        this.logger.warn(
          `[Axiom7] 智能体执行顺序错误：位置 ${i} 应为 ${expectedAgent}，实际为 ${executedOrder[i]}`,
        );
        return false;
      }
    }
    return true;
  }

  /**
   * 生成完整验证报告
   */
  generateValidationReport(): AxiomValidationReport {
    const axiomResults: AxiomValidationReport['axiomResults'] = [
      {
        axiomId: 'AXIOM_1_NORMALIZATION',
        axiomName: '标准化公理',
        isValid: this.monitoringData.violationCounts['AXIOM_1_NORMALIZATION'] === 0,
        violations: this.getRecentViolations('AXIOM_1_NORMALIZATION'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_2_HIERARCHY',
        axiomName: '分层组合公理',
        isValid: this.monitoringData.violationCounts['AXIOM_2_HIERARCHY'] === 0,
        violations: this.getRecentViolations('AXIOM_2_HIERARCHY'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_3_FEASIBILITY',
        axiomName: '硬约束优先公理',
        isValid: this.monitoringData.violationCounts['AXIOM_3_FEASIBILITY'] === 0,
        violations: this.getRecentViolations('AXIOM_3_FEASIBILITY'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_4_UNCERTAINTY',
        axiomName: '不确定性一致公理',
        isValid: this.monitoringData.violationCounts['AXIOM_4_UNCERTAINTY'] === 0,
        violations: this.getRecentViolations('AXIOM_4_UNCERTAINTY'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_5_ROBUSTNESS',
        axiomName: '稳健性优先公理',
        isValid: this.monitoringData.violationCounts['AXIOM_5_ROBUSTNESS'] === 0,
        violations: this.getRecentViolations('AXIOM_5_ROBUSTNESS'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_6_ADAPTIVE',
        axiomName: '自适应一致公理',
        isValid: this.monitoringData.violationCounts['AXIOM_6_ADAPTIVE'] === 0,
        violations: this.getRecentViolations('AXIOM_6_ADAPTIVE'),
        warnings: [],
      },
      {
        axiomId: 'AXIOM_7_MULTI_AGENT',
        axiomName: '多智能体一致性公理',
        isValid: this.monitoringData.violationCounts['AXIOM_7_MULTI_AGENT'] === 0,
        violations: this.getRecentViolations('AXIOM_7_MULTI_AGENT'),
        warnings: [],
      },
    ];
    
    const allAxiomsValid = axiomResults.every(r => r.isValid);
    
    const recommendations: string[] = [];
    if (!allAxiomsValid) {
      for (const result of axiomResults) {
        if (!result.isValid) {
          recommendations.push(`修复 ${result.axiomName} 违规：${result.violations[0] || '检查日志'}`);
        }
      }
    }
    
    return {
      validatedAt: new Date().toISOString(),
      allAxiomsValid,
      axiomResults,
      recommendations,
    };
  }

  /**
   * 获取最近的违规信息
   */
  private getRecentViolations(axiomId: AxiomId): string[] {
    const count = this.monitoringData.violationCounts[axiomId];
    if (count === 0) return [];
    return [`共 ${count} 次违规`];
  }

  /**
   * 重置监控数据
   */
  resetMonitoringData(): void {
    this.monitoringData = {
      recentScoreValidations: [],
      recentWeightUpdates: [],
      recentAgentOperations: [],
      violationCounts: {
        'AXIOM_1_NORMALIZATION': 0,
        'AXIOM_2_HIERARCHY': 0,
        'AXIOM_3_FEASIBILITY': 0,
        'AXIOM_4_UNCERTAINTY': 0,
        'AXIOM_5_ROBUSTNESS': 0,
        'AXIOM_6_ADAPTIVE': 0,
        'AXIOM_7_MULTI_AGENT': 0,
      },
    };
  }

  /**
   * 获取违规统计
   */
  getViolationStats(): Record<AxiomId, number> {
    return { ...this.monitoringData.violationCounts };
  }
}
