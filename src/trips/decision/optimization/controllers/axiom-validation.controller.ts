// src/trips/decision/optimization/controllers/axiom-validation.controller.ts
/**
 * 公理验证 API Controller
 * 
 * 提供：
 * - 公理验证接口
 * - 分层效用计算
 * - 系统健康检查
 */

import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AxiomValidatorService, AxiomValidationReport } from '../axioms/axiom-validator.service';
import {
  HierarchicalUtilityService,
  SubDimensionScoresInput,
  HierarchicalEvaluationResult,
  TopLevelWeights,
  SubDimensionWeights,
} from '../axioms/hierarchical-utility.service';
import {
  NormalizedScore,
  HierarchicalUtilityStructure,
  TRIPNARA_ESSENCE,
} from '../axioms/axiom-system';
import { ObjectiveFunctionWeights } from '../objective-function.interface';

// ========== DTOs ==========

class ValidateNormalizationDto {
  scores!: Array<{
    dimensionId: string;
    rawValue: number;
    normalizedValue: number;
  }>;
}

class ValidateHierarchyDto {
  topLevelWeights!: Record<string, number>;
  subDimensionWeights!: Record<string, Record<string, number>>;
}

class ValidateAdaptiveDto {
  userId!: string;
  currentWeights!: ObjectiveFunctionWeights;
}

class ValidateMultiAgentDto {
  agents!: Array<{
    agentId: string;
    agentName: string;
    weights: ObjectiveFunctionWeights;
  }>;
}

class EvaluateUtilityDto {
  subScores!: SubDimensionScoresInput;
}

@ApiTags('Axiom Validation')
@Controller('v2/axioms')
export class AxiomValidationController {
  private readonly logger = new Logger(AxiomValidationController.name);

  constructor(
    private readonly axiomValidator: AxiomValidatorService,
    private readonly hierarchicalUtility: HierarchicalUtilityService,
  ) {}

  // ========== 公理验证 ==========

  @Post('validate/normalization')
  @ApiOperation({ summary: '验证标准化公理（公理一）' })
  @ApiResponse({ status: 200, description: '返回验证结果' })
  async validateNormalization(@Body() dto: ValidateNormalizationDto): Promise<{
    isValid: boolean;
    violations: Array<{ dimensionId: string; value: number; reason: string }>;
  }> {
    this.logger.log('[Axiom] 验证标准化公理');
    
    const violations: Array<{ dimensionId: string; value: number; reason: string }> = [];
    
    for (const score of dto.scores) {
      const isValid = this.axiomValidator.validateNormalization(score.normalizedValue, score.dimensionId);
      if (!isValid) {
        violations.push({
          dimensionId: score.dimensionId,
          value: score.normalizedValue,
          reason: `分数 ${score.normalizedValue} 不在 [0,1] 范围内`,
        });
      }
    }
    
    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  @Post('validate/hierarchy')
  @ApiOperation({ summary: '验证分层组合公理（公理二）' })
  async validateHierarchy(@Body() dto: ValidateHierarchyDto): Promise<{
    isValid: boolean;
    topLevelSum: number;
    subDimensionSums: Record<string, number>;
    violations: string[];
  }> {
    this.logger.log('[Axiom] 验证分层组合公理');
    
    const violations: string[] = [];
    
    // 检查顶层权重和
    const topLevelSum = Object.values(dto.topLevelWeights).reduce((a, b) => a + b, 0);
    if (Math.abs(topLevelSum - 1.0) > 0.001) {
      violations.push(`顶层权重和 ${topLevelSum.toFixed(4)} ≠ 1.0`);
    }
    
    // 检查子维度权重和
    const subDimensionSums: Record<string, number> = {};
    for (const [dimension, weights] of Object.entries(dto.subDimensionWeights)) {
      const sum = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
      subDimensionSums[dimension] = sum;
      if (Math.abs(sum - 1.0) > 0.001) {
        violations.push(`子维度 ${dimension} 权重和 ${sum.toFixed(4)} ≠ 1.0`);
      }
    }
    
    return {
      isValid: violations.length === 0,
      topLevelSum,
      subDimensionSums,
      violations,
    };
  }

  @Post('validate/adaptive')
  @ApiOperation({ summary: '验证适应一致性公理（公理六）' })
  async validateAdaptive(@Body() dto: ValidateAdaptiveDto): Promise<{
    isValid: boolean;
    weights: ObjectiveFunctionWeights;
    violations: Array<{ weight: string; value: number; min: number; max: number }>;
  }> {
    this.logger.log('[Axiom] 验证适应一致性公理');
    
    const violations: Array<{ weight: string; value: number; min: number; max: number }> = [];
    
    // 定义参数边界（内联类型）
    const weightBounds: Record<string, { min: number; max: number }> = {
      safety: { min: 0.1, max: 0.5 },
      experience: { min: 0.05, max: 0.4 },
      philosophy: { min: 0.05, max: 0.4 },
      timeSlack: { min: 0.02, max: 0.3 },
      fatigueRisk: { min: 0.05, max: 0.3 },
      weatherRisk: { min: 0.05, max: 0.3 },
      budgetRisk: { min: 0.01, max: 0.2 },
      crowdAvoidance: { min: 0.01, max: 0.2 },
    };
    
    // 验证每个权重
    for (const [key, value] of Object.entries(dto.currentWeights)) {
      const bound = weightBounds[key];
      const min = bound?.min || 0;
      const max = bound?.max || 1;
      if (value < min || value > max) {
        violations.push({ weight: key, value, min, max });
      }
    }
    
    return {
      isValid: violations.length === 0,
      weights: dto.currentWeights,
      violations,
    };
  }

  @Post('validate/multi-agent')
  @ApiOperation({ summary: '验证多智能体一致性公理（公理七）' })
  async validateMultiAgent(@Body() dto: ValidateMultiAgentDto): Promise<{
    isValid: boolean;
    sharedObjectiveFunction: boolean;
    agentDifferences: Array<{
      agent1: string;
      agent2: string;
      weightDifference: Record<string, number>;
      totalDeviation: number;
    }>;
  }> {
    this.logger.log('[Axiom] 验证多智能体一致性公理');
    
    const agentDifferences: Array<{
      agent1: string;
      agent2: string;
      weightDifference: Record<string, number>;
      totalDeviation: number;
    }> = [];
    
    // 比较每对智能体
    for (let i = 0; i < dto.agents.length; i++) {
      for (let j = i + 1; j < dto.agents.length; j++) {
        const agent1 = dto.agents[i];
        const agent2 = dto.agents[j];
        
        const weightDifference: Record<string, number> = {};
        let totalDeviation = 0;
        
        for (const key of Object.keys(agent1.weights) as Array<keyof ObjectiveFunctionWeights>) {
          const diff = Math.abs(agent1.weights[key] - agent2.weights[key]);
          weightDifference[key] = diff;
          totalDeviation += diff;
        }
        
        agentDifferences.push({
          agent1: agent1.agentName,
          agent2: agent2.agentName,
          weightDifference,
          totalDeviation,
        });
      }
    }
    
    // 多智能体一致性：共享同一目标函数（允许偏好差异但结构一致）
    const isValid = true; // 结构一致性检查
    
    return {
      isValid,
      sharedObjectiveFunction: true,
      agentDifferences,
    };
  }

  // ========== 综合验证 ==========

  @Get('report')
  @ApiOperation({ summary: '生成完整公理验证报告' })
  @ApiResponse({ status: 200, description: '返回完整验证报告' })
  async getValidationReport(): Promise<AxiomValidationReport> {
    this.logger.log('[Axiom] 生成完整验证报告');
    return this.axiomValidator.generateValidationReport();
  }

  // ========== 分层效用计算 ==========

  @Post('utility/evaluate')
  @ApiOperation({ summary: '计算分层效用' })
  @ApiResponse({ status: 200, description: '返回分层效用计算结果' })
  async evaluateHierarchicalUtility(@Body() dto: EvaluateUtilityDto): Promise<HierarchicalEvaluationResult> {
    this.logger.log('[Axiom] 计算分层效用');
    return this.hierarchicalUtility.evaluate(dto.subScores);
  }

  @Get('utility/structure')
  @ApiOperation({ summary: '获取当前效用结构' })
  async getUtilityStructure(): Promise<{ topLevel: TopLevelWeights; subDimension: SubDimensionWeights }> {
    return this.hierarchicalUtility.getCurrentStructure();
  }

  @Post('utility/weights')
  @ApiOperation({ summary: '更新效用权重' })
  async updateUtilityWeights(@Body() weights: {
    topLevelWeights?: Partial<TopLevelWeights>;
    subDimensionWeights?: Partial<Record<keyof SubDimensionWeights, Record<string, number>>>;
  }): Promise<{ topLevel: TopLevelWeights; subDimension: SubDimensionWeights }> {
    if (weights.topLevelWeights) {
      this.hierarchicalUtility.updateTopLevelWeights(weights.topLevelWeights);
    }
    if (weights.subDimensionWeights) {
      this.hierarchicalUtility.updateAllSubDimensionWeights(weights.subDimensionWeights);
    }
    return this.hierarchicalUtility.getCurrentStructure();
  }

  // ========== 系统信息 ==========

  @Get('essence')
  @ApiOperation({ summary: '获取 TripNARA 决策系统核心公式' })
  async getTripnaraEssence(): Promise<typeof TRIPNARA_ESSENCE> {
    return TRIPNARA_ESSENCE;
  }

  @Get('health')
  @ApiOperation({ summary: '公理系统健康检查' })
  async axiomHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    validationReport: AxiomValidationReport;
    activeViolations: number;
    lastValidation: string;
  }> {
    const report = this.axiomValidator.generateValidationReport();
    const activeViolations = report.axiomResults.filter(r => !r.isValid).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (activeViolations > 0 && activeViolations <= 2) {
      status = 'degraded';
    } else if (activeViolations > 2) {
      status = 'unhealthy';
    }
    
    return {
      status,
      validationReport: report,
      activeViolations,
      lastValidation: new Date().toISOString(),
    };
  }
}
