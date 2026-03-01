/**
 * Decision OS 特性开关服务
 * 
 * 支持:
 * - 布尔开关
 * - 百分比滚动发布
 * - 用户分组
 * - A/B 测试
 * - 特性依赖
 */

import { Injectable, Logger } from '@nestjs/common';

// ========== 类型定义 ==========

export enum FeatureFlagType {
  BOOLEAN = 'boolean',
  PERCENTAGE = 'percentage',
  USER_GROUP = 'user_group',
  AB_TEST = 'ab_test',
}

export interface FeatureFlag {
  key: string;
  name: string;
  description?: string;
  type: FeatureFlagType;
  enabled: boolean;
  value?: unknown;
  percentage?: number;
  userGroups?: string[];
  variants?: FeatureVariant[];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureVariant {
  key: string;
  name: string;
  weight: number;
  value?: unknown;
}

export interface FeatureContext {
  userId?: string;
  userGroups?: string[];
  attributes?: Record<string, unknown>;
}

export interface FeatureEvaluation {
  key: string;
  enabled: boolean;
  variant?: string;
  value?: unknown;
  reason: EvaluationReason;
}

export enum EvaluationReason {
  FLAG_DISABLED = 'flag_disabled',
  FLAG_ENABLED = 'flag_enabled',
  PERCENTAGE_ROLLOUT = 'percentage_rollout',
  USER_GROUP_MATCH = 'user_group_match',
  AB_TEST_VARIANT = 'ab_test_variant',
  DEPENDENCY_NOT_MET = 'dependency_not_met',
  DEFAULT_VALUE = 'default_value',
}

export interface ABTestResult {
  flagKey: string;
  variant: string;
  userId: string;
  timestamp: string;
  conversion?: boolean;
  metadata?: Record<string, unknown>;
}

// ========== 特性开关服务 ==========

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly flags = new Map<string, FeatureFlag>();
  private readonly abTestResults: ABTestResult[] = [];
  private readonly userVariantCache = new Map<string, string>();

  constructor() {
    this.registerDecisionOSFlags();
  }

  register(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): FeatureFlag {
    const now = new Date().toISOString();
    const fullFlag: FeatureFlag = {
      ...flag,
      createdAt: now,
      updatedAt: now,
    };

    this.flags.set(flag.key, fullFlag);
    this.logger.log(`[Feature] 注册特性开关: ${flag.key} (${flag.type})`);

    return fullFlag;
  }

  update(key: string, updates: Partial<FeatureFlag>): FeatureFlag | undefined {
    const flag = this.flags.get(key);
    if (!flag) return undefined;

    const updated: FeatureFlag = {
      ...flag,
      ...updates,
      key: flag.key,
      updatedAt: new Date().toISOString(),
    };

    this.flags.set(key, updated);
    this.logger.log(`[Feature] 更新特性开关: ${key}`);

    return updated;
  }

  get(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  delete(key: string): boolean {
    const deleted = this.flags.delete(key);
    if (deleted) {
      this.logger.log(`[Feature] 删除特性开关: ${key}`);
    }
    return deleted;
  }

  isEnabled(key: string, context?: FeatureContext): boolean {
    const evaluation = this.evaluate(key, context);
    return evaluation.enabled;
  }

  evaluate(key: string, context?: FeatureContext): FeatureEvaluation {
    const flag = this.flags.get(key);

    if (!flag) {
      return {
        key,
        enabled: false,
        reason: EvaluationReason.DEFAULT_VALUE,
      };
    }

    if (!flag.enabled) {
      return {
        key,
        enabled: false,
        reason: EvaluationReason.FLAG_DISABLED,
      };
    }

    if (flag.dependencies?.length) {
      for (const dep of flag.dependencies) {
        if (!this.isEnabled(dep, context)) {
          return {
            key,
            enabled: false,
            reason: EvaluationReason.DEPENDENCY_NOT_MET,
          };
        }
      }
    }

    switch (flag.type) {
      case FeatureFlagType.BOOLEAN:
        return {
          key,
          enabled: true,
          value: flag.value,
          reason: EvaluationReason.FLAG_ENABLED,
        };

      case FeatureFlagType.PERCENTAGE:
        return this.evaluatePercentage(flag, context);

      case FeatureFlagType.USER_GROUP:
        return this.evaluateUserGroup(flag, context);

      case FeatureFlagType.AB_TEST:
        return this.evaluateABTest(flag, context);

      default:
        return {
          key,
          enabled: true,
          reason: EvaluationReason.FLAG_ENABLED,
        };
    }
  }

  recordABTestConversion(flagKey: string, userId: string, conversion: boolean, metadata?: Record<string, unknown>): void {
    const result: ABTestResult = {
      flagKey,
      variant: this.getUserVariant(flagKey, userId) ?? 'unknown',
      userId,
      timestamp: new Date().toISOString(),
      conversion,
      metadata,
    };

    this.abTestResults.push(result);

    if (this.abTestResults.length > 100000) {
      this.abTestResults.shift();
    }
  }

  getABTestStats(flagKey: string): {
    totalParticipants: number;
    variants: Array<{
      key: string;
      participants: number;
      conversions: number;
      conversionRate: number;
    }>;
  } {
    const results = this.abTestResults.filter(r => r.flagKey === flagKey);
    const flag = this.flags.get(flagKey);

    if (!flag?.variants) {
      return { totalParticipants: 0, variants: [] };
    }

    const variantStats = new Map<string, { participants: Set<string>; conversions: number }>();

    for (const variant of flag.variants) {
      variantStats.set(variant.key, { participants: new Set(), conversions: 0 });
    }

    for (const result of results) {
      const stats = variantStats.get(result.variant);
      if (stats) {
        stats.participants.add(result.userId);
        if (result.conversion) {
          stats.conversions++;
        }
      }
    }

    return {
      totalParticipants: new Set(results.map(r => r.userId)).size,
      variants: flag.variants.map(v => {
        const stats = variantStats.get(v.key)!;
        return {
          key: v.key,
          participants: stats.participants.size,
          conversions: stats.conversions,
          conversionRate: stats.participants.size > 0 
            ? stats.conversions / stats.participants.size 
            : 0,
        };
      }),
    };
  }

  private evaluatePercentage(flag: FeatureFlag, context?: FeatureContext): FeatureEvaluation {
    const percentage = flag.percentage ?? 0;
    const userId = context?.userId ?? 'anonymous';
    const hash = this.hashString(`${flag.key}:${userId}`);
    const bucket = hash % 100;

    const enabled = bucket < percentage;

    return {
      key: flag.key,
      enabled,
      value: enabled ? flag.value : undefined,
      reason: EvaluationReason.PERCENTAGE_ROLLOUT,
    };
  }

  private evaluateUserGroup(flag: FeatureFlag, context?: FeatureContext): FeatureEvaluation {
    const allowedGroups = flag.userGroups ?? [];
    const userGroups = context?.userGroups ?? [];

    const match = allowedGroups.some(group => userGroups.includes(group));

    return {
      key: flag.key,
      enabled: match,
      value: match ? flag.value : undefined,
      reason: EvaluationReason.USER_GROUP_MATCH,
    };
  }

  private evaluateABTest(flag: FeatureFlag, context?: FeatureContext): FeatureEvaluation {
    const variants = flag.variants ?? [];
    if (variants.length === 0) {
      return {
        key: flag.key,
        enabled: false,
        reason: EvaluationReason.DEFAULT_VALUE,
      };
    }

    const userId = context?.userId ?? 'anonymous';
    const cacheKey = `${flag.key}:${userId}`;

    let variantKey = this.userVariantCache.get(cacheKey);

    if (!variantKey) {
      const hash = this.hashString(cacheKey);
      const bucket = hash % 100;

      let cumulative = 0;
      for (const variant of variants) {
        cumulative += variant.weight;
        if (bucket < cumulative) {
          variantKey = variant.key;
          break;
        }
      }

      variantKey = variantKey ?? variants[0].key;
      this.userVariantCache.set(cacheKey, variantKey);
    }

    const selectedVariant = variants.find(v => v.key === variantKey);

    return {
      key: flag.key,
      enabled: true,
      variant: variantKey,
      value: selectedVariant?.value,
      reason: EvaluationReason.AB_TEST_VARIANT,
    };
  }

  private getUserVariant(flagKey: string, userId: string): string | undefined {
    return this.userVariantCache.get(`${flagKey}:${userId}`);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private registerDecisionOSFlags(): void {
    this.register({
      key: 'decision.monte_carlo_sampling',
      name: 'Monte Carlo 采样',
      description: '启用 Monte Carlo 采样进行效用计算',
      type: FeatureFlagType.BOOLEAN,
      enabled: true,
      value: { defaultSamples: 1000, maxSamples: 10000 },
    });

    this.register({
      key: 'decision.exploration_enabled',
      name: '探索策略',
      description: '启用探索策略进行信息收集',
      type: FeatureFlagType.PERCENTAGE,
      enabled: true,
      percentage: 100,
    });

    this.register({
      key: 'decision.policy_learning',
      name: '策略学习',
      description: '启用在线策略学习',
      type: FeatureFlagType.PERCENTAGE,
      enabled: true,
      percentage: 50,
    });

    this.register({
      key: 'decision.differentiable_mode',
      name: '可微分决策',
      description: '启用可微分决策架构',
      type: FeatureFlagType.USER_GROUP,
      enabled: true,
      userGroups: ['beta_testers', 'internal'],
    });

    this.register({
      key: 'decision.optimization_algorithm',
      name: '优化算法 A/B 测试',
      description: 'CGUS vs 传统优化算法对比',
      type: FeatureFlagType.AB_TEST,
      enabled: true,
      variants: [
        { key: 'cgus', name: 'CGUS Algorithm', weight: 50, value: 'cgus' },
        { key: 'legacy', name: 'Legacy Algorithm', weight: 50, value: 'legacy' },
      ],
    });

    this.register({
      key: 'decision.new_ui',
      name: '新界面',
      description: '新版决策界面滚动发布',
      type: FeatureFlagType.PERCENTAGE,
      enabled: false,
      percentage: 0,
    });
  }
}

// ========== 装饰器 ==========

const featureFlagMetadataKey = Symbol('featureFlag');

export interface FeatureFlagDecoratorOptions {
  key: string;
  fallback?: unknown;
}

export function FeatureEnabled(options: FeatureFlagDecoratorOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const featureFlagService = (this as any).featureFlagService as FeatureFlagService | undefined;

      if (!featureFlagService) {
        return originalMethod.apply(this, args);
      }

      if (!featureFlagService.isEnabled(options.key)) {
        if (options.fallback !== undefined) {
          return options.fallback;
        }
        throw new Error(`Feature '${options.key}' is not enabled`);
      }

      return originalMethod.apply(this, args);
    };

    Reflect.defineMetadata(featureFlagMetadataKey, options, target, propertyKey);

    return descriptor;
  };
}
