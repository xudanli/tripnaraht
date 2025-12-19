// src/trips/decision/versioning/version.service.ts

/**
 * 版本控制和 Feature Flag 支持
 * 
 * 支持策略版本号、回滚、灰度发布
 */

import { Injectable, Logger } from '@nestjs/common';

export interface PlannerVersion {
  plannerVersion: string; // e.g., 'planner-0.1'
  policyVersion: string;   // e.g., 'policy-v1.2'
  releasedAt: string;      // ISO datetime
  changelog?: string;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage: number; // 0~100, 灰度百分比
  targetUsers?: string[];    // 特定用户ID列表
  targetDestinations?: string[]; // 特定目的地列表
}

export interface VersionConfig {
  currentVersion: PlannerVersion;
  featureFlags: Record<string, FeatureFlag>;
  fallbackVersion?: PlannerVersion; // 回滚版本
}

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private versionConfig: VersionConfig;

  constructor() {
    // 默认配置
    this.versionConfig = {
      currentVersion: {
        plannerVersion: 'planner-0.1',
        policyVersion: 'policy-v1.0',
        releasedAt: new Date().toISOString(),
        changelog: 'Initial version',
      },
      featureFlags: {
        useConstraintChecker: {
          name: 'useConstraintChecker',
          enabled: true,
          rolloutPercentage: 100,
        },
        useDataQuality: {
          name: 'useDataQuality',
          enabled: true,
          rolloutPercentage: 100,
        },
        useEventTrigger: {
          name: 'useEventTrigger',
          enabled: true,
          rolloutPercentage: 50, // 50% 灰度
        },
        useEvaluation: {
          name: 'useEvaluation',
          enabled: false,
          rolloutPercentage: 0, // 未启用
        },
      },
    };
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(): PlannerVersion {
    return this.versionConfig.currentVersion;
  }

  /**
   * 检查 feature flag 是否启用
   */
  isFeatureEnabled(
    flagName: string,
    context?: {
      userId?: string;
      destination?: string;
    }
  ): boolean {
    const flag = this.versionConfig.featureFlags[flagName];

    if (!flag) {
      this.logger.warn(`Feature flag "${flagName}" not found`);
      return false;
    }

    if (!flag.enabled) {
      return false;
    }

    // 检查特定用户/目的地
    if (context) {
      if (
        context.userId &&
        flag.targetUsers &&
        flag.targetUsers.includes(context.userId)
      ) {
        return true;
      }

      if (
        context.destination &&
        flag.targetDestinations &&
        flag.targetDestinations.includes(context.destination)
      ) {
        return true;
      }
    }

    // 灰度检查（简单实现：基于 flagName hash）
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashString(flagName + (context?.userId || 'default'));
      const percentage = (hash % 100) + 1;
      return percentage <= flag.rolloutPercentage;
    }

    return true;
  }

  /**
   * 更新版本配置
   */
  updateVersionConfig(config: Partial<VersionConfig>): void {
    this.versionConfig = {
      ...this.versionConfig,
      ...config,
      featureFlags: {
        ...this.versionConfig.featureFlags,
        ...(config.featureFlags || {}),
      },
    };

    this.logger.log(
      `Version config updated: ${JSON.stringify(this.versionConfig.currentVersion)}`
    );
  }

  /**
   * 设置 feature flag
   */
  setFeatureFlag(flagName: string, flag: Partial<FeatureFlag>): void {
    const existing = this.versionConfig.featureFlags[flagName] || {
      name: flagName,
      enabled: false,
      rolloutPercentage: 0,
    };

    this.versionConfig.featureFlags[flagName] = {
      ...existing,
      ...flag,
      name: flagName,
    };

    this.logger.log(`Feature flag "${flagName}" updated: ${JSON.stringify(flag)}`);
  }

  /**
   * 回滚到指定版本
   */
  rollbackToVersion(version: PlannerVersion): void {
    this.logger.warn(
      `Rolling back to version: ${version.plannerVersion} (${version.policyVersion})`
    );

    this.versionConfig.fallbackVersion = this.versionConfig.currentVersion;
    this.versionConfig.currentVersion = version;
  }

  /**
   * 恢复当前版本（取消回滚）
   */
  restoreVersion(): void {
    if (this.versionConfig.fallbackVersion) {
      this.logger.log('Restoring to previous version');
      this.versionConfig.currentVersion = this.versionConfig.fallbackVersion;
      this.versionConfig.fallbackVersion = undefined;
    }
  }

  /**
   * 获取所有 feature flags 状态
   */
  getAllFeatureFlags(): Record<string, FeatureFlag> {
    return { ...this.versionConfig.featureFlags };
  }

  /**
   * 简单 hash 函数（用于灰度）
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

