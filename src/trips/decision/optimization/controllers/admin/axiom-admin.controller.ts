// src/trips/decision/optimization/controllers/admin/axiom-admin.controller.ts
/**
 * 管理端 - 公理验证 API
 * 
 * 提供系统公理验证、效用结构管理功能
 */

import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';

import { AxiomValidatorService, AxiomValidationReport } from '../../axioms/axiom-validator.service';
import {
  HierarchicalUtilityService,
  HierarchicalEvaluationResult,
  SubDimensionScoresInput,
  TopLevelWeights,
  SubDimensionWeights,
} from '../../axioms/hierarchical-utility.service';
import {
  TRIPNARA_ESSENCE,
} from '../../axioms/axiom-system';
import { ObjectiveFunctionWeights } from '../../objective-function.interface';

// ========== Request DTOs ==========

export class ValidateWeightsDto {
  /** 待验证的权重 */
  weights!: ObjectiveFunctionWeights;
}

export class UpdateUtilityWeightsDto {
  /** 顶层维度权重（可选） */
  topLevelWeights?: Record<string, number>;
  /** 子维度权重（可选） */
  subDimensionWeights?: Record<string, Record<string, number>>;
  /** 修改原因 */
  reason!: string;
  /** 操作者 ID */
  operatorId!: string;
}

export class EvaluateUtilityDto {
  /** 子维度分数 */
  subScores!: SubDimensionScoresInput;
}

// ========== Response Types ==========

export interface ValidationResultResponse {
  /** 是否通过 */
  isValid: boolean;
  /** 违规项 */
  violations: Array<{
    axiom: string;
    description: string;
    value?: any;
    expected?: any;
  }>;
  /** 验证时间 */
  validatedAt: string;
}

export interface AxiomHealthResponse {
  /** 健康状态 */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** 验证报告 */
  report: AxiomValidationReport;
  /** 活跃违规数 */
  activeViolations: number;
  /** 各公理状态 */
  axiomStatus: Record<string, { passed: boolean; message?: string }>;
  /** 检查时间 */
  checkedAt: string;
}

@ApiTags('Admin - Axioms')
@ApiBearerAuth()
@Controller('v2/admin/axioms')
export class AxiomAdminController {
  private readonly logger = new Logger(AxiomAdminController.name);

  constructor(
    private readonly axiomValidator: AxiomValidatorService,
    private readonly hierarchicalUtility: HierarchicalUtilityService,
  ) {}

  // ========== 公理验证 ==========

  @Public()
  @Get('report')
  @ApiOperation({ 
    summary: '获取公理验证报告',
    description: '生成完整的七公理验证报告（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回验证报告' })
  async getValidationReport(): Promise<AxiomValidationReport> {
    this.logger.log('[Admin] 生成公理验证报告');
    return this.axiomValidator.generateValidationReport();
  }

  @Public()
  @Get('health')
  @ApiOperation({ 
    summary: '公理系统健康检查',
    description: '检查所有公理的遵守情况（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回健康状态' })
  async getHealth(): Promise<AxiomHealthResponse> {
    const report = this.axiomValidator.generateValidationReport();
    const activeViolations = report.axiomResults.filter(r => !r.isValid).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (activeViolations > 0 && activeViolations <= 2) {
      status = 'degraded';
    } else if (activeViolations > 2) {
      status = 'unhealthy';
    }
    
    const axiomStatus: Record<string, { passed: boolean; message?: string }> = {};
    for (const result of report.axiomResults) {
      axiomStatus[result.axiomId] = {
        passed: result.isValid,
        message: result.isValid ? undefined : result.violations?.[0],
      };
    }
    
    return {
      status,
      report,
      activeViolations,
      axiomStatus,
      checkedAt: new Date().toISOString(),
    };
  }

  @Post('validate/weights')
  @ApiOperation({ 
    summary: '验证权重配置',
    description: '检查权重是否符合公理要求'
  })
  @ApiResponse({ status: 200, description: '返回验证结果' })
  async validateWeights(@Body() dto: ValidateWeightsDto): Promise<ValidationResultResponse> {
    const violations: ValidationResultResponse['violations'] = [];
    
    // 公理一：标准化检查
    for (const [key, value] of Object.entries(dto.weights)) {
      if (value < 0 || value > 1) {
        violations.push({
          axiom: 'AXIOM_1_NORMALIZATION',
          description: `权重 ${key} 值 ${value} 超出 [0,1] 范围`,
          value,
          expected: '[0, 1]',
        });
      }
    }
    
    // 权重和检查
    const sum = Object.values(dto.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      violations.push({
        axiom: 'AXIOM_2_HIERARCHY',
        description: `权重和 ${sum.toFixed(4)} 不等于 1.0`,
        value: sum,
        expected: 1.0,
      });
    }
    
    // 公理六：边界检查
    const bounds: Record<string, { min: number; max: number }> = {
      safety: { min: 0.1, max: 0.5 },
      experience: { min: 0.05, max: 0.4 },
      philosophy: { min: 0.05, max: 0.4 },
      timeSlack: { min: 0.02, max: 0.3 },
      fatigueRisk: { min: 0.05, max: 0.3 },
      weatherRisk: { min: 0.05, max: 0.3 },
      budgetRisk: { min: 0.01, max: 0.2 },
      crowdAvoidance: { min: 0.01, max: 0.2 },
    };
    
    for (const [key, value] of Object.entries(dto.weights)) {
      const bound = bounds[key];
      if (bound && (value < bound.min || value > bound.max)) {
        violations.push({
          axiom: 'AXIOM_6_ADAPTIVE',
          description: `权重 ${key} 值 ${value} 超出学习边界 [${bound.min}, ${bound.max}]`,
          value,
          expected: `[${bound.min}, ${bound.max}]`,
        });
      }
    }
    
    return {
      isValid: violations.length === 0,
      violations,
      validatedAt: new Date().toISOString(),
    };
  }

  // ========== 效用结构管理 ==========

  @Public()
  @Get('utility/structure')
  @ApiOperation({ 
    summary: '获取效用结构',
    description: '返回当前的分层效用结构配置（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回效用结构' })
  async getUtilityStructure(): Promise<{ topLevel: TopLevelWeights; subDimension: SubDimensionWeights }> {
    return this.hierarchicalUtility.getCurrentStructure();
  }

  @Post('utility/weights')
  @ApiOperation({ 
    summary: '更新效用权重',
    description: '修改分层效用结构的权重配置'
  })
  @ApiResponse({ status: 200, description: '返回更新后的结构' })
  async updateUtilityWeights(@Body() dto: UpdateUtilityWeightsDto): Promise<{ topLevel: TopLevelWeights; subDimension: SubDimensionWeights }> {
    this.logger.warn(`[Admin] 更新效用权重 by ${dto.operatorId}: ${dto.reason}`);
    
    if (dto.topLevelWeights) {
      this.hierarchicalUtility.updateTopLevelWeights(dto.topLevelWeights);
    }
    if (dto.subDimensionWeights) {
      this.hierarchicalUtility.updateAllSubDimensionWeights(dto.subDimensionWeights);
    }
    
    return this.hierarchicalUtility.getCurrentStructure();
  }

  @Post('utility/evaluate')
  @ApiOperation({ 
    summary: '计算分层效用',
    description: '根据子维度分数计算总效用'
  })
  @ApiResponse({ status: 200, description: '返回效用计算结果' })
  async evaluateUtility(@Body() dto: EvaluateUtilityDto): Promise<HierarchicalEvaluationResult> {
    return this.hierarchicalUtility.evaluate(dto.subScores);
  }

  // ========== 系统信息 ==========

  @Public()
  @Get('essence')
  @ApiOperation({ 
    summary: '获取系统本质',
    description: '返回 TripNARA 决策系统的核心数学公式（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回系统本质' })
  async getEssence(): Promise<typeof TRIPNARA_ESSENCE & { explanation: string }> {
    return {
      ...TRIPNARA_ESSENCE,
      explanation: `
TripNARA 的核心是一个风险约束下的分层效用最大化器：

1. 目标：在所有可能的计划中找到期望效用最大的方案
2. 约束：
   - 可行性概率 P(feasible) 必须 ≥ θ₁（默认 0.9）
   - 下行风险 P(U < τ) 必须 ≤ θ₂（默认 0.1）
3. 效用：通过二级线性组合计算
   - 顶层：SAFETY, EXPERIENCE, EFFICIENCY, PHILOSOPHY
   - 底层：各顶层维度下的子指标

这个公式保证了系统在追求最优的同时，始终把安全和稳健放在首位。
      `.trim(),
    };
  }
}
