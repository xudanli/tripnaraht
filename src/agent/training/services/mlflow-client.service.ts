// src/agent/training/services/mlflow-client.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * MLflowClientService
 * 
 * 职责：封装 MLflow REST API 调用
 * 
 * MLflow REST API 文档：https://www.mlflow.org/docs/latest/rest-api.html
 */
@Injectable()
export class MLflowClientService {
  private readonly logger = new Logger(MLflowClientService.name);
  private readonly mlflowTrackingUri: string;
  private readonly httpClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.mlflowTrackingUri =
      this.configService.get<string>('MLFLOW_TRACKING_URI') ||
      'http://localhost:5000';
    
    // 创建 HTTP 客户端
    this.httpClient = axios.create({
      baseURL: this.mlflowTrackingUri,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`[MLflowClient] 初始化: trackingUri=${this.mlflowTrackingUri}`);
  }

  /**
   * 创建模型版本
   */
  async createModelVersion(
    modelName: string,
    source: string,
    runId?: string,
    tags?: Record<string, string>,
  ): Promise<{
    model_version: {
      name: string;
      version: string;
      creation_timestamp: number;
      last_updated_timestamp: number;
      user_id: string;
      current_stage: string;
      description?: string;
      source: string;
      run_id?: string;
      status: string;
      status_message?: string;
      tags?: Array<{ key: string; value: string }>;
    };
  }> {
    try {
      const response = await this.httpClient.post('/api/2.0/mlflow/model-versions/create', {
        name: modelName,
        source,
        run_id: runId,
        tags: tags ? Object.entries(tags).map(([key, value]) => ({ key, value })) : undefined,
      });

      this.logger.debug(
        `[MLflowClient] 创建模型版本成功: modelName=${modelName}, version=${response.data.model_version.version}`,
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[MLflowClient] 创建模型版本失败: modelName=${modelName}, error=${error?.message}`,
      );
      throw new Error(`MLflow API 错误: ${error?.message}`);
    }
  }

  /**
   * 获取模型版本
   */
  async getModelVersion(
    modelName: string,
    version: string,
  ): Promise<{
    model_version: {
      name: string;
      version: string;
      creation_timestamp: number;
      last_updated_timestamp: number;
      user_id: string;
      current_stage: string;
      description?: string;
      source: string;
      run_id?: string;
      status: string;
      status_message?: string;
      tags?: Array<{ key: string; value: string }>;
    };
  }> {
    try {
      const response = await this.httpClient.get('/api/2.0/mlflow/model-versions/get', {
        params: {
          name: modelName,
          version,
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null as any;
      }
      this.logger.error(
        `[MLflowClient] 获取模型版本失败: modelName=${modelName}, version=${version}, error=${error?.message}`,
      );
      throw new Error(`MLflow API 错误: ${error?.message}`);
    }
  }

  /**
   * 列出模型的所有版本
   */
  async listModelVersions(
    modelName: string,
    maxResults: number = 100,
  ): Promise<{
    model_versions: Array<{
      name: string;
      version: string;
      creation_timestamp: number;
      last_updated_timestamp: number;
      current_stage: string;
      source: string;
      run_id?: string;
      status: string;
    }>;
  }> {
    try {
      const response = await this.httpClient.get('/api/2.0/mlflow/model-versions/search', {
        params: {
          name: modelName,
          max_results: maxResults,
        },
      });

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[MLflowClient] 列出模型版本失败: modelName=${modelName}, error=${error?.message}`,
      );
      // 如果 MLflow 不可用，返回空列表
      return { model_versions: [] };
    }
  }

  /**
   * 更新模型版本阶段（如设置为 Production）
   */
  async transitionModelVersionStage(
    modelName: string,
    version: string,
    stage: 'Staging' | 'Production' | 'Archived',
    archiveExistingVersions: boolean = false,
  ): Promise<void> {
    try {
      await this.httpClient.post('/api/2.0/mlflow/model-versions/transition-stage', {
        name: modelName,
        version,
        stage,
        archive_existing_versions: archiveExistingVersions,
      });

      this.logger.log(
        `[MLflowClient] 更新模型版本阶段成功: modelName=${modelName}, version=${version}, stage=${stage}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[MLflowClient] 更新模型版本阶段失败: modelName=${modelName}, version=${version}, stage=${stage}, error=${error?.message}`,
      );
      throw new Error(`MLflow API 错误: ${error?.message}`);
    }
  }

  /**
   * 创建或获取实验
   */
  async getOrCreateExperiment(experimentName: string): Promise<string> {
    try {
      // 先尝试获取实验
      const getResponse = await this.httpClient.get('/api/2.0/mlflow/experiments/get-by-name', {
        params: {
          experiment_name: experimentName,
        },
      });

      if (getResponse.data?.experiment?.experiment_id) {
        return getResponse.data.experiment.experiment_id;
      }
    } catch (error: any) {
      // 实验不存在，创建新实验
      if (error.response?.status === 404 || error.response?.status === 400) {
        try {
          const createResponse = await this.httpClient.post('/api/2.0/mlflow/experiments/create', {
            name: experimentName,
          });

          return createResponse.data.experiment_id;
        } catch (createError: any) {
          this.logger.error(
            `[MLflowClient] 创建实验失败: experimentName=${experimentName}, error=${createError?.message}`,
          );
          throw new Error(`MLflow API 错误: ${createError?.message}`);
        }
      }
    }

    throw new Error(`无法获取或创建实验: ${experimentName}`);
  }

  /**
   * 记录运行指标
   */
  async logMetrics(
    runId: string,
    metrics: Record<string, number>,
    step?: number,
    timestamp?: number,
  ): Promise<void> {
    try {
      const metricsArray = Object.entries(metrics).map(([key, value]) => ({
        key,
        value,
        step: step || 0,
        timestamp: timestamp || Date.now(),
      }));

      await this.httpClient.post('/api/2.0/mlflow/runs/log-batch', {
        run_id: runId,
        metrics: metricsArray,
      });

      this.logger.debug(`[MLflowClient] 记录指标成功: runId=${runId}, metricsCount=${metricsArray.length}`);
    } catch (error: any) {
      this.logger.warn(
        `[MLflowClient] 记录指标失败: runId=${runId}, error=${error?.message}`,
      );
      // 不抛出错误，允许继续执行
    }
  }

  /**
   * 记录运行参数
   */
  async logParams(
    runId: string,
    params: Record<string, string>,
  ): Promise<void> {
    try {
      const paramsArray = Object.entries(params).map(([key, value]) => ({
        key,
        value: String(value),
      }));

      await this.httpClient.post('/api/2.0/mlflow/runs/log-batch', {
        run_id: runId,
        params: paramsArray,
      });

      this.logger.debug(`[MLflowClient] 记录参数成功: runId=${runId}, paramsCount=${paramsArray.length}`);
    } catch (error: any) {
      this.logger.warn(
        `[MLflowClient] 记录参数失败: runId=${runId}, error=${error?.message}`,
      );
      // 不抛出错误，允许继续执行
    }
  }

  /**
   * 检查 MLflow 服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error: any) {
      this.logger.warn(`[MLflowClient] MLflow 服务不可用: ${error?.message}`);
      return false;
    }
  }
}
