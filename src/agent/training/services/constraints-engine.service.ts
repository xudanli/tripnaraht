// src/agent/training/services/constraints-engine.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ConstraintRule,
  ConstraintCheckResult,
  ConstraintViolation,
  ConstraintWarning,
  SEVLevel,
} from '../interfaces/safety-compliance.interface';
import { Itinerary } from '../../interfaces/trip-plan.interface';
import { ConstraintRuleManagerService } from './constraint-rule-manager.service';

/**
 * ConstraintsEngineService
 * 
 * 职责：实现硬约束规则引擎（禁区/风险/consent）
 * 
 * 功能：
 * 1. checkConstraints() - 检查规划是否违反约束
 * 2. 规则匹配和执行
 */
@Injectable()
export class ConstraintsEngineService {
  private readonly logger = new Logger(ConstraintsEngineService.name);
  private readonly rules: ConstraintRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ruleManager?: ConstraintRuleManagerService,
  ) {
    // 注意：规则现在从ConstraintRuleManagerService异步加载，不再在构造函数中初始化
  }

  /**
   * 加载规则（从ConstraintRuleManager加载）
   */
  private async loadRules(): Promise<ConstraintRule[]> {
    if (this.ruleManager) {
      try {
        const geographicRules = await this.ruleManager.getGeographicRules();
        const temporalRules = await this.ruleManager.getTemporalRules();
        const complianceRules = await this.ruleManager.getComplianceRules();
        const userPreferenceRules = await this.ruleManager.getUserPreferenceRules();
        return [
          ...geographicRules,
          ...temporalRules,
          ...complianceRules,
          ...userPreferenceRules,
        ];
      } catch (error: any) {
        this.logger.warn(`[ConstraintsEngine] 加载规则失败，使用空规则集: ${error?.message}`);
        return [];
      }
    }
    // 如果没有RuleManager，返回空数组
    return [];
  }

  /**
   * 检查约束
   */
  async checkConstraints(
    itinerary: Itinerary,
    context: {
      country_code?: string;
      season?: string;
      user_preferences?: Record<string, any>;
      model_version?: string;
    },
  ): Promise<ConstraintCheckResult> {
    this.logger.debug(
      `[ConstraintsEngine] 检查约束: countryCode=${context.country_code}`,
    );

    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintWarning[] = [];

    // 加载规则（从ConstraintRuleManager）
    const rules = await this.loadRules();

    // 检查硬约束
    for (const rule of rules.filter((r) => r.severity === 'HARD')) {
      const violation = await this.checkRule(rule, itinerary, context);
      if (violation) {
        violations.push(violation);
      }
    }

    // 检查软约束
    for (const rule of rules.filter((r) => r.severity === 'SOFT')) {
      const warning = await this.checkRuleAsWarning(rule, itinerary, context);
      if (warning) {
        warnings.push(warning);
      }
    }

    // 确定SEV级别
    const sevLevel = this.determineSevLevel(violations, warnings);

    // 判断是否需要阻止
    const isBlocked = violations.length > 0 || sevLevel === 'SEV-1';

    // 判断是否需要审批
    const requiresApproval =
      sevLevel === 'SEV-2' || violations.some((v) => v.sev_level === 'SEV-2');

    const result: ConstraintCheckResult = {
      violations,
      warnings,
      is_blocked: isBlocked,
      sev_level: sevLevel,
      requires_approval: requiresApproval,
    };

    this.logger.debug(
      `[ConstraintsEngine] 约束检查完成: violations=${violations.length}, warnings=${warnings.length}, sevLevel=${sevLevel}`,
    );

    return result;
  }

  /**
   * 检查规则（返回违反）
   */
  private async checkRule(
    rule: ConstraintRule,
    itinerary: Itinerary,
    context: any,
  ): Promise<ConstraintViolation | null> {
    try {
      switch (rule.type) {
        case 'GEOGRAPHIC':
          return await this.checkGeographicConstraint(rule, itinerary, context);
        case 'TEMPORAL':
          return await this.checkTemporalConstraint(rule, itinerary, context);
        case 'COMPLIANCE':
          return await this.checkComplianceConstraint(rule, itinerary, context);
        case 'USER_PREFERENCE':
          return await this.checkUserPreferenceConstraint(rule, itinerary, context);
        default:
          return null;
      }
    } catch (error: any) {
      this.logger.warn(
        `[ConstraintsEngine] 规则检查失败: ruleId=${rule.id}, error=${error?.message}`,
      );
      return null;
    }
  }

  /**
   * 检查规则（返回警告）
   */
  private async checkRuleAsWarning(
    rule: ConstraintRule,
    itinerary: Itinerary,
    context: any,
  ): Promise<ConstraintWarning | null> {
    const violation = await this.checkRule(rule, itinerary, context);
    if (violation) {
      return {
        rule_id: violation.rule_id,
        rule_name: violation.rule_name,
        type: violation.type,
        message: violation.message,
        details: violation.details,
        timestamp: violation.timestamp,
      };
    }
    return null;
  }

  /**
   * 检查地理约束
   */
  private async checkGeographicConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查危险区域、禁区等
    // 这里先返回null（示例）
    return null;
  }

  /**
   * 检查时间约束
   */
  private async checkTemporalConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查季节性风险、天气风险等
    return null;
  }

  /**
   * 检查合规约束
   */
  private async checkComplianceConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查签证、许可、法规要求等
    return null;
  }

  /**
   * 检查用户偏好约束
   */
  private async checkUserPreferenceConstraint(
    _rule: ConstraintRule,
    _itinerary: Itinerary,
    _context: any,
  ): Promise<ConstraintViolation | null> {
    // TODO: 实际实现应该检查用户风险偏好、健康限制等
    return null;
  }

  /**
   * 确定SEV级别
   */
  private determineSevLevel(
    violations: ConstraintViolation[],
    warnings: ConstraintWarning[],
  ): SEVLevel {
    if (violations.length === 0 && warnings.length === 0) {
      return 'SEV-4';
    }

    // 检查是否有SEV-1违反
    if (violations.some((v) => v.sev_level === 'SEV-1')) {
      return 'SEV-1';
    }

    // 检查是否有SEV-2违反
    if (violations.some((v) => v.sev_level === 'SEV-2')) {
      return 'SEV-2';
    }

    // 检查是否有SEV-3违反
    if (violations.some((v) => v.sev_level === 'SEV-3')) {
      return 'SEV-3';
    }

    return 'SEV-4';
  }

  /**
   * 初始化约束规则
   */
  private initializeRules(): void {
    // TODO: 从数据库或配置文件加载规则
    // 这里先添加一些示例规则
    this.rules.push({
      id: 'rule_001',
      name: '危险区域禁止',
      type: 'GEOGRAPHIC',
      severity: 'HARD',
      condition: '{}',
      action: 'BLOCK',
      sev_level: 'SEV-1',
    });

    this.rules.push({
      id: 'rule_002',
      name: '高风险季节警告',
      type: 'TEMPORAL',
      severity: 'SOFT',
      condition: '{}',
      action: 'WARN',
      sev_level: 'SEV-3',
    });
  }

  /**
   * 添加约束规则
   */
  addRule(rule: ConstraintRule): void {
    this.rules.push(rule);
    this.logger.log(`[ConstraintsEngine] 添加约束规则: ruleId=${rule.id}`);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): ConstraintRule[] {
    return [...this.rules];
  }
}
