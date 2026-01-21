// src/agent/training/services/policy-service-manager.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PolicyInferenceRequest,
  PolicyInferenceResponse,
  PolicyServiceHealth,
  PolicyServiceMetrics,
} from '../interfaces/training-platform.interface';
import { ModelRegistryService } from './model-registry.service';
import { RollPolicyAdapterService } from './roll-policy-adapter.service';

/**
 * PolicyServiceManagerService
 * 
 * 职责：管理PolicyService在线推理服务
 * 
 * 功能：
 * 1. predict() - 调用PolicyService进行推理
 * 2. healthCheck() - 检查PolicyService健康状态
 * 3. getMetrics() - 获取PolicyService指标
 * 4. deployModel() - 部署模型到PolicyService
 * 5. rollbackModel() - 回滚模型版本
 */
@Injectable()
export class PolicyServiceManagerService {
  private readonly logger = new Logger(PolicyServiceManagerService.name);
  private readonly policyServiceUrl: string;
  private readonly fallbackEnabled: boolean = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly modelRegistry: ModelRegistryService,
    @Optional() private readonly rollPolicyAdapter?: RollPolicyAdapterService,
  ) {
    // 从环境变量获取PolicyService URL
    this.policyServiceUrl =
      this.configService.get<string>('POLICY_SERVICE_URL') ||
      'http://localhost:8002';
    this.fallbackEnabled =
      this.configService.get<boolean>('POLICY_SERVICE_FALLBACK_ENABLED') !==
      false;
  }

  /**
   * 策略推理
   */
  async predict(
    request: PolicyInferenceRequest,
    useFallback: boolean = true,
  ): Promise<PolicyInferenceResponse> {
    this.logger.debug(
      `[PolicyService] 策略推理: requestId=${request.request_id}, modelVersion=${request.model_version}`,
    );

    // 优先使用 ROLL Policy-Worker（如果启用）
    if (this.rollPolicyAdapter) {
      try {
        const rollResult = await this.rollPolicyAdapter.predict(request);
        this.logger.debug(
          `[PolicyService] 使用 ROLL Policy-Worker 推理完成: requestId=${request.request_id}, action=${rollResult.action}`,
        );
        return rollResult;
      } catch (error: any) {
        this.logger.warn(
          `[PolicyService] ROLL Policy-Worker 调用失败，回退到 PolicyService: ${error?.message}`,
        );
        // 继续执行 PolicyService 调用
      }
    }

    try {
      // 调用PolicyService API
      const response = await fetch(`${this.policyServiceUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5000), // 5秒超时
      });

      if (!response.ok) {
        throw new Error(`PolicyService error: ${response.statusText}`);
      }

      const result = (await response.json()) as PolicyInferenceResponse;

      this.logger.debug(
        `[PolicyService] 推理完成: requestId=${request.request_id}, action=${result.action}, latency=${result.latency_ms}ms`,
      );

      return result;
    } catch (error: any) {
      this.logger.warn(
        `[PolicyService] 推理失败: requestId=${request.request_id}, error=${error?.message}`,
      );

      // 如果启用回退，尝试使用fallback模型
      if (useFallback && this.fallbackEnabled) {
        return await this.predictWithFallback(request);
      }

      throw error;
    }
  }

  /**
   * 使用fallback模型进行推理
   */
  private async predictWithFallback(
    request: PolicyInferenceRequest,
  ): Promise<PolicyInferenceResponse> {
    this.logger.log(
      `[PolicyService] 使用fallback模型: requestId=${request.request_id}`,
    );

    // 获取fallback模型版本
    const fallbackVersion = await this.getFallbackModelVersion();
    if (!fallbackVersion) {
      throw new Error('No fallback model available');
    }

    // 使用fallback模型版本重新请求
    const fallbackRequest: PolicyInferenceRequest = {
      ...request,
      model_version: fallbackVersion,
    };

    try {
      const response = await fetch(`${this.policyServiceUrl}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackRequest),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`PolicyService fallback error: ${response.statusText}`);
      }

      const result = (await response.json()) as PolicyInferenceResponse;
      result.metadata = {
        ...result.metadata,
        fallback_used: true,
        original_model_version: request.model_version,
      };

      this.logger.log(
        `[PolicyService] Fallback推理成功: requestId=${request.request_id}, fallbackVersion=${fallbackVersion}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[PolicyService] Fallback推理失败: requestId=${request.request_id}, error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<PolicyServiceHealth> {
    try {
      const response = await fetch(`${this.policyServiceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return {
          status: 'unhealthy',
          model_loaded: false,
          qps: 0,
          p95_latency_ms: 0,
          error_rate: 1.0,
          uptime_seconds: 0,
        };
      }

      const health = (await response.json()) as PolicyServiceHealth;
      return health;
    } catch (error: any) {
      this.logger.warn(
        `[PolicyService] 健康检查失败: error=${error?.message}`,
      );
      return {
        status: 'unhealthy',
        model_loaded: false,
        qps: 0,
        p95_latency_ms: 0,
        error_rate: 1.0,
        uptime_seconds: 0,
      };
    }
  }

  /**
   * 获取服务指标
   */
  async getMetrics(): Promise<PolicyServiceMetrics> {
    try {
      const response = await fetch(`${this.policyServiceUrl}/metrics`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        throw new Error(`PolicyService metrics error: ${response.statusText}`);
      }

      const metrics = (await response.json()) as PolicyServiceMetrics;
      return metrics;
    } catch (error: any) {
      this.logger.warn(
        `[PolicyService] 获取指标失败: error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 部署模型到PolicyService
   */
  async deployModel(modelVersion: string): Promise<void> {
    this.logger.log(
      `[PolicyService] 部署模型: modelVersion=${modelVersion}`,
    );

    const modelEntry = await this.modelRegistry.getModelVersion(modelVersion);
    if (!modelEntry) {
      throw new Error(`Model version not found: ${modelVersion}`);
    }

    try {
      const response = await fetch(`${this.policyServiceUrl}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_version: modelVersion,
          model_path: modelEntry.model_path,
          mlflow_model_uri: modelEntry.mlflow_model_uri,
        }),
      });

      if (!response.ok) {
        throw new Error(`PolicyService deploy error: ${response.statusText}`);
      }

      this.logger.log(
        `[PolicyService] 模型已部署: modelVersion=${modelVersion}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[PolicyService] 部署模型失败: modelVersion=${modelVersion}, error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 回滚模型版本
   */
  async rollbackModel(targetVersion: string): Promise<void> {
    this.logger.log(
      `[PolicyService] 回滚模型: targetVersion=${targetVersion}`,
    );

    // 先回滚Model Registry
    await this.modelRegistry.rollbackToVersion(targetVersion);

    // 然后部署到PolicyService
    await this.deployModel(targetVersion);

    this.logger.log(
      `[PolicyService] 模型已回滚: targetVersion=${targetVersion}`,
    );
  }

  /**
   * 获取fallback模型版本
   */
  private async getFallbackModelVersion(): Promise<string | null> {
    // 获取当前生产版本
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
}
