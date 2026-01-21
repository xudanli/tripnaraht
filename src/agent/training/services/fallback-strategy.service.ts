// src/agent/training/services/fallback-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PolicyServiceManagerService } from './policy-service-manager.service';
import { ModelRegistryService } from './model-registry.service';

/**
 * FallbackStrategyService
 * 
 * 职责：实现降级策略（baseline模型降级、历史版本降级）
 */
@Injectable()
export class FallbackStrategyService {
  private readonly logger = new Logger(FallbackStrategyService.name);

  constructor(
    private readonly policyService: PolicyServiceManagerService,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  /**
   * 执行操作（带降级）
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      this.logger.warn(
        `[FallbackStrategy] 主操作失败，尝试降级: ${error?.message}`,
      );

      if (fallbackOperation) {
        try {
          return await fallbackOperation();
        } catch (fallbackError: any) {
          this.logger.error(
            `[FallbackStrategy] 降级操作也失败: ${fallbackError?.message}`,
          );
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * 获取baseline模型版本
   */
  async getBaselineModelVersion(): Promise<string | null> {
    const productionVersion = this.modelRegistry.getCurrentProductionVersion();
    if (productionVersion) {
      return productionVersion;
    }

    // 如果没有生产版本，获取最新的稳定版本
    const versions = await this.modelRegistry.listModelVersions();
    if (versions.length > 0) {
      return versions[0].version;
    }

    return null;
  }

  /**
   * 获取历史版本（用于降级）
   */
  async getFallbackModelVersion(currentVersion: string): Promise<string | null> {
    const versions = await this.modelRegistry.listModelVersions();
    const currentIndex = versions.findIndex((v) => v.version === currentVersion);

    if (currentIndex > 0) {
      // 返回前一个版本
      return versions[currentIndex - 1].version;
    }

    // 如果没有前一个版本，返回baseline
    return await this.getBaselineModelVersion();
  }
}
