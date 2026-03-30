// src/agent/training/services/model-registry.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelVersion,
  ModelRegistryEntry,
  TrainingMetrics,
} from '../interfaces/training-platform.interface';
import { MLflowClientService } from './mlflow-client.service';

/**
 * ModelRegistryService
 * 
 * 职责：管理模型注册表（版本管理、元数据、可回滚）
 * 
 * 功能：
 * 1. registerModel() - 注册模型到MLflow
 * 2. getModelVersion() - 获取指定版本
 * 3. listModelVersions() - 列出所有版本
 * 4. rollbackToVersion() - 回滚到指定版本
 * 5. setProductionVersion() - 设置生产版本
 * 6. compareVersions() - 对比两个版本
 */
@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);
  private readonly mlflowTrackingUri: string;
  private readonly mlflowModelName: string = 'tripnara-policy-model';
  private readonly registry: Map<string, ModelRegistryEntry> = new Map();
  private currentProductionVersion: string | null = null;
  private currentStagingVersion: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mlflowClient: MLflowClientService,
  ) {
    // 从环境变量获取MLflow配置
    this.mlflowTrackingUri =
      this.configService?.get<string>('MLFLOW_TRACKING_URI') ||
      process.env.MLFLOW_TRACKING_URI ||
      'http://localhost:5000';
    this.mlflowModelName =
      this.configService?.get<string>('MLFLOW_MODEL_NAME') ||
      process.env.MLFLOW_MODEL_NAME ||
      'tripnara-policy-model';

    this.logger.log(`[ModelRegistry] MLflow URI: ${this.mlflowTrackingUri}, Model: ${this.mlflowModelName}`);
  }

  /**
   * 注册模型到MLflow Model Registry
   */
  async registerModel(
    modelVersion: ModelVersion,
    evalMetrics?: Record<string, number>,
  ): Promise<ModelRegistryEntry> {
    this.logger.log(
      `[ModelRegistry] 注册模型: version=${modelVersion.version}`,
    );

    try {
      // 调用MLflow API注册模型
      // 实际实现应该调用MLflow Python API或REST API
      const mlflowModelUri = await this.registerToMLflow(modelVersion, evalMetrics);

      const entry: ModelRegistryEntry = {
        version: modelVersion.version,
        model_path: modelVersion.model_path,
        mlflow_model_uri: mlflowModelUri,
        training_metrics: modelVersion.training_metrics,
        eval_metrics: evalMetrics || modelVersion.eval_metrics,
        training_config: modelVersion.training_config,
        model_config: modelVersion.model_config,
        dataset_version: modelVersion.dataset_version,
        created_at: modelVersion.created_at,
        is_production: false,
        is_staging: false,
      };

      // 保存到本地注册表
      this.registry.set(modelVersion.version, entry);

      this.logger.log(
        `[ModelRegistry] 模型已注册: version=${modelVersion.version}, mlflowUri=${mlflowModelUri}`,
      );

      return entry;
    } catch (error: any) {
      this.logger.error(
        `[ModelRegistry] 注册模型失败: version=${modelVersion.version}, error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 获取指定版本的模型
   */
  async getModelVersion(version: string): Promise<ModelRegistryEntry | undefined> {
    // 先从本地注册表查找
    let entry = this.registry.get(version);

    if (!entry) {
      // 如果本地没有，从MLflow获取
      try {
        const mlflowEntry = await this.getFromMLflow(version);
        if (mlflowEntry) {
          entry = mlflowEntry;
          this.registry.set(version, entry);
        }
      } catch (error: any) {
        this.logger.warn(
          `[ModelRegistry] 从MLflow获取模型失败: version=${version}, error=${error?.message}`,
        );
      }
    }

    return entry;
  }

  /**
   * 列出所有模型版本
   */
  async listModelVersions(): Promise<ModelRegistryEntry[]> {
    // 从MLflow获取所有版本
    try {
      const versions = await this.listFromMLflow();
      
      // 更新本地注册表
      for (const version of versions) {
        this.registry.set(version.version, version);
      }

      return Array.from(this.registry.values()).sort((a, b) =>
        this.compareVersionNumbers(b.version, a.version),
      );
    } catch (error: any) {
      this.logger.warn(
        `[ModelRegistry] 从MLflow列出版本失败: error=${error?.message}`,
      );
      // 返回本地注册表的版本
      return Array.from(this.registry.values()).sort((a, b) =>
        this.compareVersionNumbers(b.version, a.version),
      );
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(version: string): Promise<ModelRegistryEntry> {
    this.logger.log(`[ModelRegistry] 回滚到版本: version=${version}`);

    const entry = await this.getModelVersion(version);
    if (!entry) {
      throw new Error(`Model version not found: ${version}`);
    }

    // 设置当前生产版本
    this.currentProductionVersion = version;

    // 更新MLflow中的生产版本标记
    await this.setProductionVersionInMLflow(version);

    this.logger.log(
      `[ModelRegistry] 已回滚到版本: version=${version}`,
    );

    return entry;
  }

  /**
   * 设置生产版本
   */
  async setProductionVersion(version: string): Promise<void> {
    this.logger.log(`[ModelRegistry] 设置生产版本: version=${version}`);

    const entry = await this.getModelVersion(version);
    if (!entry) {
      throw new Error(`Model version not found: ${version}`);
    }

    // 取消之前的生产版本标记
    if (this.currentProductionVersion) {
      const prevEntry = this.registry.get(this.currentProductionVersion);
      if (prevEntry) {
        prevEntry.is_production = false;
      }
    }

    // 设置新的生产版本
    entry.is_production = true;
    this.currentProductionVersion = version;

    // 更新MLflow
    await this.setProductionVersionInMLflow(version);

    this.logger.log(
      `[ModelRegistry] 生产版本已设置: version=${version}`,
    );
  }

  /**
   * 设置预发布版本
   */
  async setStagingVersion(version: string): Promise<void> {
    this.logger.log(`[ModelRegistry] 设置预发布版本: version=${version}`);

    const entry = await this.getModelVersion(version);
    if (!entry) {
      throw new Error(`Model version not found: ${version}`);
    }

    // 取消之前的预发布版本标记
    if (this.currentStagingVersion) {
      const prevEntry = this.registry.get(this.currentStagingVersion);
      if (prevEntry) {
        prevEntry.is_staging = false;
      }
    }

    // 设置新的预发布版本
    entry.is_staging = true;
    this.currentStagingVersion = version;

    this.logger.log(
      `[ModelRegistry] 预发布版本已设置: version=${version}`,
    );
  }

  /**
   * 对比两个版本
   */
  async compareVersions(
    version1: string,
    version2: string,
  ): Promise<{
    version1: ModelRegistryEntry;
    version2: ModelRegistryEntry;
    differences: {
      training_metrics: Record<string, { v1: number; v2: number; diff: number }>;
      eval_metrics: Record<string, { v1: number; v2: number; diff: number }>;
      training_config: Record<string, any>;
    };
  }> {
    const v1 = await this.getModelVersion(version1);
    const v2 = await this.getModelVersion(version2);

    if (!v1 || !v2) {
      throw new Error(`Model version not found: ${!v1 ? version1 : version2}`);
    }

    // 对比训练指标
    const trainingMetricsDiff: Record<string, { v1: number; v2: number; diff: number }> = {};
    const allMetricsKeys = new Set([
      ...Object.keys(v1.training_metrics),
      ...Object.keys(v2.training_metrics),
    ]);

    for (const key of allMetricsKeys) {
      const val1 = v1.training_metrics[key] as number;
      const val2 = v2.training_metrics[key] as number;
      if (typeof val1 === 'number' && typeof val2 === 'number') {
        trainingMetricsDiff[key] = {
          v1: val1,
          v2: val2,
          diff: val2 - val1,
        };
      }
    }

    // 对比评测指标
    const evalMetricsDiff: Record<string, { v1: number; v2: number; diff: number }> = {};
    if (v1.eval_metrics && v2.eval_metrics) {
      const allEvalKeys = new Set([
        ...Object.keys(v1.eval_metrics),
        ...Object.keys(v2.eval_metrics),
      ]);

      for (const key of allEvalKeys) {
        const val1 = v1.eval_metrics?.[key] || 0;
        const val2 = v2.eval_metrics?.[key] || 0;
        evalMetricsDiff[key] = {
          v1: val1,
          v2: val2,
          diff: val2 - val1,
        };
      }
    }

    // 对比训练配置
    const trainingConfigDiff: Record<string, any> = {};
    const config1 = v1.training_config as Record<string, any>;
    const config2 = v2.training_config as Record<string, any>;
    const allConfigKeys = new Set([
      ...Object.keys(config1),
      ...Object.keys(config2),
    ]);

    for (const key of allConfigKeys) {
      if (config1[key] !== config2[key]) {
        trainingConfigDiff[key] = {
          v1: config1[key],
          v2: config2[key],
        };
      }
    }

    return {
      version1: v1,
      version2: v2,
      differences: {
        training_metrics: trainingMetricsDiff,
        eval_metrics: evalMetricsDiff,
        training_config: trainingConfigDiff,
      },
    };
  }

  /**
   * 获取当前生产版本
   */
  getCurrentProductionVersion(): string | null {
    return this.currentProductionVersion;
  }

  /**
   * 获取当前预发布版本
   */
  getCurrentStagingVersion(): string | null {
    return this.currentStagingVersion;
  }

  /**
   * 注册模型到MLflow
   */
  private async registerToMLflow(
    modelVersion: ModelVersion,
    evalMetrics?: Record<string, number>,
  ): Promise<string> {
    try {
      // 检查 MLflow 服务是否可用
      const isAvailable = await this.mlflowClient.healthCheck();
      if (!isAvailable) {
        this.logger.warn(
          `[ModelRegistry] MLflow 服务不可用，使用模拟模式: modelVersion=${modelVersion.version}`,
        );
        return `models:/${this.mlflowModelName}/${modelVersion.version}`;
      }

      // 准备标签
      const tags: Record<string, string> = {
        model_version: modelVersion.version,
        dataset_version: modelVersion.dataset_version || 'unknown',
        training_config: JSON.stringify(modelVersion.training_config),
        model_config: JSON.stringify(modelVersion.model_config),
      };

      if (evalMetrics) {
        tags.eval_metrics = JSON.stringify(evalMetrics);
      }

      // 创建模型版本
      const result = await this.mlflowClient.createModelVersion(
        this.mlflowModelName,
        modelVersion.model_path,
        modelVersion.mlflow_run_id,
        tags,
      );

      const modelUri = `models:/${this.mlflowModelName}/${result.model_version.version}`;
      
      this.logger.log(
        `[ModelRegistry] 注册到MLflow成功: modelUri=${modelUri}, version=${result.model_version.version}`,
      );

      return modelUri;
    } catch (error: any) {
      this.logger.error(
        `[ModelRegistry] 注册到MLflow失败: modelVersion=${modelVersion.version}, error=${error?.message}`,
      );
      // 降级：返回模拟 URI
      return `models:/${this.mlflowModelName}/${modelVersion.version}`;
    }
  }

  /**
   * 从MLflow获取模型版本
   */
  private async getFromMLflow(version: string): Promise<ModelRegistryEntry | null> {
    try {
      const result = await this.mlflowClient.getModelVersion(this.mlflowModelName, version);
      
      if (!result?.model_version) {
        return null;
      }

      const mv = result.model_version;
      
      // 解析标签
      const tags: Record<string, string> = {};
      if (mv.tags) {
        for (const tag of mv.tags) {
          tags[tag.key] = tag.value;
        }
      }

      // 解析训练配置和模型配置
      let trainingConfig = {};
      let modelConfig = {};
      let evalMetrics: Record<string, number> | undefined;

      try {
        if (tags.training_config) {
          trainingConfig = JSON.parse(tags.training_config);
        }
        if (tags.model_config) {
          modelConfig = JSON.parse(tags.model_config);
        }
        if (tags.eval_metrics) {
          evalMetrics = JSON.parse(tags.eval_metrics);
        }
      } catch (parseError: any) {
        this.logger.warn(`[ModelRegistry] 解析标签失败: ${parseError?.message}`);
      }

      const entry: ModelRegistryEntry = {
        version: mv.version,
        model_path: mv.source,
        mlflow_model_uri: `models:/${this.mlflowModelName}/${mv.version}`,
        training_metrics: {} as TrainingMetrics, // MLflow 不直接存储训练指标，需要从 run_id 获取
        eval_metrics: evalMetrics,
        training_config: trainingConfig as any,
        model_config: modelConfig as any,
        dataset_version: tags.dataset_version || 'unknown',
        created_at: new Date(mv.creation_timestamp).toISOString(),
        is_production: mv.current_stage === 'Production',
        is_staging: mv.current_stage === 'Staging',
      };

      return entry;
    } catch (error: any) {
      this.logger.warn(
        `[ModelRegistry] 从MLflow获取模型版本失败: version=${version}, error=${error?.message}`,
      );
      return null;
    }
  }

  /**
   * 从MLflow列出所有版本
   */
  private async listFromMLflow(): Promise<ModelRegistryEntry[]> {
    try {
      const result = await this.mlflowClient.listModelVersions(this.mlflowModelName, 100);
      
      const entries: ModelRegistryEntry[] = [];
      
      for (const mv of result.model_versions) {
        const entry = await this.getFromMLflow(mv.version);
        if (entry) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error: any) {
      this.logger.warn(
        `[ModelRegistry] 从MLflow列出版本失败: error=${error?.message}`,
      );
      return [];
    }
  }

  /**
   * 在MLflow中设置生产版本
   */
  private async setProductionVersionInMLflow(version: string): Promise<void> {
    try {
      await this.mlflowClient.transitionModelVersionStage(
        this.mlflowModelName,
        version,
        'Production',
        true, // 归档其他生产版本
      );

      this.logger.log(
        `[ModelRegistry] 在MLflow中设置生产版本成功: version=${version}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `[ModelRegistry] 在MLflow中设置生产版本失败: version=${version}, error=${error?.message}`,
      );
      // 不抛出错误，允许继续执行
    }
  }

  /**
   * 对比版本号
   */
  private compareVersionNumbers(v1: string, v2: string): number {
    const v1Numbers = v1.replace('v', '').split('.').map(Number);
    const v2Numbers = v2.replace('v', '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (v1Numbers[i] > v2Numbers[i]) return 1;
      if (v1Numbers[i] < v2Numbers[i]) return -1;
    }

    return 0;
  }
}
