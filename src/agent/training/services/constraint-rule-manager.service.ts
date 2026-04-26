// src/agent/training/services/constraint-rule-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConstraintRule, ConstraintType } from '../interfaces/safety-compliance.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RuleProvider {
  fetchRules(type: ConstraintType): Promise<ConstraintRule[]>;
}

class FileRuleProvider implements RuleProvider {
  constructor(private readonly rulesDir: string, private readonly logger: Logger) {}

  async fetchRules(type: ConstraintType): Promise<ConstraintRule[]> {
    const fileName = `${type.toLowerCase()}_rules.json`;
    const filePath = path.join(this.rulesDir, fileName);
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(fileContent) as ConstraintRule[];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        this.logger.warn(`[ConstraintRuleManager] 规则文件不存在: ${filePath}，返回空数组`);
        return [];
      }
      this.logger.error(`[ConstraintRuleManager] 读取规则文件失败: ${error?.message}`, error?.stack);
      return [];
    }
  }
}

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
  private readonly providers: RuleProvider[];
  private rulesCache: Map<string, ConstraintRule[]> = new Map();
  private triggerTagIndex: Map<string, ConstraintRule[]> = new Map();
  private allLoaded = false;

  constructor(private readonly configService: ConfigService) {
    // 从环境变量或配置获取规则目录
    this.rulesDir =
      this.configService.get<string>('CONSTRAINT_RULES_DIR') ||
      // Policy-as-code default: checked-in assets
      path.join(process.cwd(), 'src', 'assets', 'ontology', 'rules');

    // Future-proof: can append DbRuleProvider / RemoteRuleProvider later.
    this.providers = [new FileRuleProvider(this.rulesDir, this.logger)];
  }

  /**
   * Load all rule types once and build runtime indexes.
   * This is the "Brain" layer: O(1) retrieval by trigger tags.
   */
  async loadAll(): Promise<void> {
    if (this.allLoaded) return;
    const types: ConstraintType[] = ['GEOGRAPHIC', 'TEMPORAL', 'COMPLIANCE', 'USER_PREFERENCE'];
    const all: ConstraintRule[] = [];
    for (const t of types) {
      // loadRulesFromFile already validates schema + falls back to defaults
      const rules = await this.loadRulesFromFile(t);
      all.push(...rules);
      this.rulesCache.set(t, rules);
    }

    // Build triggerTagIndex
    // Convention: rule.condition can optionally include:
    // { "trigger": { "tags": ["aurora", ...] }, ... }
    const idx = new Map<string, ConstraintRule[]>();
    for (const r of all) {
      try {
        const cond = typeof r.condition === 'string' ? JSON.parse(r.condition) : (r as any).condition;
        const tags: string[] = Array.isArray(cond?.trigger?.tags) ? cond.trigger.tags.map((x: any) => String(x)) : [];
        for (const tag of tags) {
          const key = tag.toLowerCase();
          const arr = idx.get(key) ?? [];
          arr.push(r);
          idx.set(key, arr);
        }
      } catch {
        // ignore non-JSON conditions
      }
    }
    this.triggerTagIndex = idx;
    this.allLoaded = true;
    this.logger.log(`[ConstraintRuleManager] loadAll done: rules=${all.length}, triggerTags=${idx.size}`);
  }

  getRulesByTriggerTag(tag: string): ConstraintRule[] {
    const key = String(tag ?? '').toLowerCase().trim();
    if (!key) return [];
    return this.triggerTagIndex.get(key) ?? [];
  }

  /**
   * 从文件加载规则
   */
  async loadRulesFromFile(type: ConstraintType): Promise<ConstraintRule[]> {
    try {
      const fetched = await Promise.all(this.providers.map((p) => p.fetchRules(type)));
      const rules = fetched.flat();
      const validRules = rules.filter((rule) => this.validateRule(rule, type));
      if (validRules.length > 0) {
        this.logger.log(`[ConstraintRuleManager] 从 providers 加载规则: type=${type}, count=${validRules.length}`);
        return validRules;
      }

      // Back-compat fallback path (older demo scripts wrote to /data/constraint-rules)
      const fileName = `${type.toLowerCase()}_rules.json`;
      try {
        const legacyPath = path.join(process.cwd(), 'data', 'constraint-rules', fileName);
        const legacy = await fs.readFile(legacyPath, 'utf-8');
        const legacyRules = JSON.parse(legacy) as ConstraintRule[];
        const validLegacy = legacyRules.filter((rule) => this.validateRule(rule, type));
        if (validLegacy.length > 0) {
          this.logger.log(`[ConstraintRuleManager] Loaded from legacy path: ${legacyPath}, count=${validLegacy.length}`);
          return validLegacy;
        }
      } catch {
        // ignore
      }
      return this.getDefaultRules(type);
    } catch (error: any) {
      this.logger.error(`[ConstraintRuleManager] 加载规则失败: ${error?.message}`, error?.stack);
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
    this.triggerTagIndex.clear();
    this.allLoaded = false;
    this.logger.log('[ConstraintRuleManager] 规则缓存已清除');
  }
}
