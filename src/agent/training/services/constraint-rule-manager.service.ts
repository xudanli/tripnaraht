// src/agent/training/services/constraint-rule-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConstraintRule, ConstraintType } from '../interfaces/safety-compliance.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * ConstraintRuleManagerService
 * 
 * 职责：管理约束规则库（从文件或数据库加载）
 * 
 * 功能：
 * 1. loadRules() - 从文件或数据库加载规则
 * 2. getGeographicRules() - 获取地理约束规则
 * 3. getTemporalRules() - 获取时间约束规则
 * 4. getComplianceRules() - 获取合规约束规则
 * 5. getUserPreferenceRules() - 获取用户偏好约束规则
 * 6. addRule() - 添加规则
 */
@Injectable()
export class ConstraintRuleManagerService {
  private readonly logger = new Logger(ConstraintRuleManagerService.name);
  private readonly rulesDir: string;
  private rulesCache: Map<string, ConstraintRule[]> = new Map();

  constructor(private readonly configService: ConfigService) {
    // 从环境变量或配置获取规则目录
    this.rulesDir =
      this.configService.get<string>('CONSTRAINT_RULES_DIR') ||
      path.join(process.cwd(), 'data', 'constraint-rules');
  }

  /**
   * 从文件加载规则
   */
  async loadRulesFromFile(type: ConstraintType): Promise<ConstraintRule[]> {
    const fileName = `${type.toLowerCase()}_rules.json`;
    const filePath = path.join(this.rulesDir, fileName);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const rules = JSON.parse(fileContent) as ConstraintRule[];

      // 验证规则格式
      const validRules = rules.filter((rule) => this.validateRule(rule, type));

      this.logger.log(
        `[ConstraintRuleManager] 从文件加载规则: type=${type}, count=${validRules.length}`,
      );

      return validRules;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.warn(
          `[ConstraintRuleManager] 规则文件不存在: ${filePath}，返回默认规则`,
        );
        return this.getDefaultRules(type);
      }
      this.logger.error(
        `[ConstraintRuleManager] 加载规则失败: ${error?.message}`,
        error?.stack,
      );
      return this.getDefaultRules(type);
    }
  }

  /**
   * 获取地理约束规则
   */
  async getGeographicRules(): Promise<ConstraintRule[]> {
    const cacheKey = 'GEOGRAPHIC';
    if (this.rulesCache.has(cacheKey)) {
      return this.rulesCache.get(cacheKey)!;
    }

    const rules = await this.loadRulesFromFile('GEOGRAPHIC');
    this.rulesCache.set(cacheKey, rules);
    return rules;
  }

  /**
   * 获取时间约束规则
   */
  async getTemporalRules(): Promise<ConstraintRule[]> {
    const cacheKey = 'TEMPORAL';
    if (this.rulesCache.has(cacheKey)) {
      return this.rulesCache.get(cacheKey)!;
    }

    const rules = await this.loadRulesFromFile('TEMPORAL');
    this.rulesCache.set(cacheKey, rules);
    return rules;
  }

  /**
   * 获取合规约束规则
   */
  async getComplianceRules(): Promise<ConstraintRule[]> {
    const cacheKey = 'COMPLIANCE';
    if (this.rulesCache.has(cacheKey)) {
      return this.rulesCache.get(cacheKey)!;
    }

    const rules = await this.loadRulesFromFile('COMPLIANCE');
    this.rulesCache.set(cacheKey, rules);
    return rules;
  }

  /**
   * 获取用户偏好约束规则
   */
  async getUserPreferenceRules(): Promise<ConstraintRule[]> {
    const cacheKey = 'USER_PREFERENCE';
    if (this.rulesCache.has(cacheKey)) {
      return this.rulesCache.get(cacheKey)!;
    }

    const rules = await this.loadRulesFromFile('USER_PREFERENCE');
    this.rulesCache.set(cacheKey, rules);
    return rules;
  }

  /**
   * 添加规则（保存到文件）
   */
  async addRule(rule: ConstraintRule): Promise<void> {
    const type = rule.type;
    const rules = await this.loadRulesFromFile(type);
    rules.push(rule);

    const fileName = `${type.toLowerCase()}_rules.json`;
    const filePath = path.join(this.rulesDir, fileName);

    // 确保目录存在
    await fs.mkdir(this.rulesDir, { recursive: true });

    // 保存到文件
    await fs.writeFile(filePath, JSON.stringify(rules, null, 2), 'utf-8');

    // 清除缓存
    this.rulesCache.delete(type);

    this.logger.log(
      `[ConstraintRuleManager] 添加规则: type=${type}, id=${rule.id}`,
    );
  }

  /**
   * 验证规则格式
   */
  private validateRule(rule: ConstraintRule, expectedType: ConstraintType): boolean {
    if (!rule.id || !rule.type || !rule.condition || !rule.severity) {
      return false;
    }

    if (rule.type !== expectedType) {
      return false;
    }

    return true;
  }

  /**
   * 获取默认规则（示例）
   */
  private getDefaultRules(type: ConstraintType): ConstraintRule[] {
    switch (type) {
      case 'GEOGRAPHIC':
        return [
          {
            id: 'geo_001',
            type: 'GEOGRAPHIC',
            name: 'High-risk destination restriction',
            severity: 'HARD',
            condition: JSON.stringify({ destination: { in: ['HIGH_RISK_AREA'] } }),
            sev_level: 'SEV-1',
            action: 'BLOCK',
            metadata: { category: 'SAFETY', description: 'Block trips to high-risk destinations' },
          },
        ];

      case 'TEMPORAL':
        return [
          {
            id: 'temp_001',
            type: 'TEMPORAL',
            name: 'Winter season warning',
            severity: 'SOFT',
            condition: JSON.stringify({ season: { eq: 'WINTER' }, destination: { eq: 'IS' } }),
            sev_level: 'SEV-2',
            action: 'WARN',
            metadata: { category: 'SAFETY', description: 'Warn about winter travel risks' },
          },
        ];

      case 'COMPLIANCE':
        return [
          {
            id: 'comp_001',
            type: 'COMPLIANCE',
            name: 'GDPR data handling',
            severity: 'HARD',
            condition: JSON.stringify({ user_location: { in: ['EU'] } }),
            sev_level: 'SEV-1',
            action: 'BLOCK',
            metadata: { category: 'LEGAL', description: 'Ensure GDPR compliance for EU users' },
          },
        ];

      case 'USER_PREFERENCE':
        return [
          {
            id: 'user_001',
            type: 'USER_PREFERENCE',
            name: 'Health restrictions',
            severity: 'SOFT',
            condition: JSON.stringify({ user_health_restrictions: { exists: true } }),
            sev_level: 'SEV-3',
            action: 'WARN',
            metadata: { category: 'HEALTH', description: 'Respect user health restrictions' },
          },
        ];

      default:
        return [];
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.rulesCache.clear();
    this.logger.log('[ConstraintRuleManager] 规则缓存已清除');
  }
}
