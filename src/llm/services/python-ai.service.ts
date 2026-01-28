// src/llm/services/python-ai.service.ts
/**
 * Python AI Service 客户端
 * 
 * 用于与独立部署的 Python AI 服务通信，提供：
 * - BGE-M3 Embedding 生成
 * - BGE-Reranker 重排序
 * - 批量处理支持
 * 
 * 架构：
 * ┌─────────────────────────┐
 * │      NestJS 服务        │
 * │  (本客户端)             │
 * └───────────┬─────────────┘
 *             │ HTTP / JSON
 *             ▼
 * ┌─────────────────────────┐
 * │     Python AI 服务      │
 * │  FastAPI / Ray / vLLM   │
 * │  - BGE-M3 Embedding     │
 * │  - BGE-Reranker         │
 * └─────────────────────────┘
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { retryWithBackoff } from '../utils/retry-with-backoff';

// ==================== 接口定义 ====================

/**
 * Embedding 请求
 */
export interface EmbeddingRequest {
  texts: string[];
  model?: string;  // 默认 'bge-m3'
  encoding_format?: 'float' | 'base64';
  return_sparse?: boolean;
  return_colbert?: boolean;
}

/**
 * 稀疏向量
 */
export interface SparseVector {
  tokens: number[];
  weights: number[];
}

/**
 * Embedding 结果
 */
export interface EmbeddingResult {
  dense: number[];
  sparse?: SparseVector;
  colbert?: number[][];
}

/**
 * Embedding 响应
 */
export interface EmbeddingResponse {
  embeddings: EmbeddingResult[];
  usage: {
    total_tokens: number;
  };
  model: string;
}

/**
 * Rerank 文档
 */
export interface RerankDocument {
  id: string;
  text: string;
}

/**
 * Rerank 请求
 */
export interface RerankRequest {
  query: string;
  documents: RerankDocument[];
  top_k?: number;
  model?: string;  // 默认 'bge-reranker-v2-m3'
}

/**
 * Rerank 结果
 */
export interface RerankResult {
  id: string;
  score: number;
  rank: number;
}

/**
 * Rerank 响应
 */
export interface RerankResponse {
  results: RerankResult[];
  usage: {
    total_tokens: number;
  };
}

/**
 * 批量任务状态
 */
export interface BatchTaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_url?: string;
  error?: string;
}

/**
 * 健康检查响应
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  service?: string;
  models?: {
    embedding?: string;
    reranker?: string;
  };
  gpu_available?: boolean;
  [key: string]: any; // 允许其他字段
}

// ==================== 服务实现 ====================

@Injectable()
export class PythonAIService implements OnModuleInit {
  private readonly logger = new Logger(PythonAIService.name);
  private readonly http: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly healthCheckTimeout: number; // 健康检查超时（通常比普通请求更长）
  private readonly enabled: boolean;
  private isHealthy: boolean = false;

  constructor(private configService: ConfigService) {
    // 读取配置
    this.baseUrl = this.configService.get<string>('PYTHON_AI_SERVICE_URL') || 'http://localhost:8001';
    this.timeout = this.configService.get<number>('PYTHON_AI_SERVICE_TIMEOUT') || 30000;
    // 健康检查超时时间（默认 15 秒，比普通请求更长，因为可能涉及网络延迟）
    this.healthCheckTimeout = this.configService.get<number>('PYTHON_AI_SERVICE_HEALTH_TIMEOUT') || 15000;
    this.enabled = this.configService.get<string>('PYTHON_AI_SERVICE_ENABLED') !== 'false';

    // 检查是否禁用代理（Python AI 服务通常在内网，不需要代理）
    const disableProxy = this.configService?.get<string>('PYTHON_AI_DISABLE_PROXY') === 'true' || true;

    // 创建 HTTP 客户端（显式禁用代理，避免使用环境变量中的代理配置）
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
      // 关键：禁用代理，直接连接 Python AI 服务
      proxy: false,
      // 使用自定义 HTTPS Agent（强制 IPv4，避免 IPv6 连接问题）
      httpsAgent: new https.Agent({
        keepAlive: true,
        family: 4, // 强制 IPv4
      }),
    });

    // 创建熔断器（连续 5 次失败后熔断，30秒后尝试恢复）
    this.circuitBreaker = new CircuitBreaker('PythonAIService', {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 2,
    });

    this.logger.log(`Python AI Service 配置: baseUrl=${this.baseUrl}, enabled=${this.enabled}, proxy=${disableProxy ? 'disabled' : 'enabled'}`);
  }

  /**
   * 模块初始化时检查服务健康状态
   * 
   * 使用重试机制，避免因临时网络问题导致初始化失败
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Python AI Service 已禁用');
      return;
    }

    // 重试 3 次，每次间隔 2 秒
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const health = await this.checkHealth();
        this.logger.log(`✅ Python AI Service 连接成功 (尝试 ${attempt}/${maxRetries})`);
        
        // 构建详细的日志信息
        const logParts = [
          `状态: ${health.status}`,
          `版本: ${health.version || 'unknown'}`,
        ];
        
        // 如果响应中包含 service 字段，也记录
        if (health.service) {
          logParts.push(`服务: ${health.service}`);
        }
        
        // GPU 信息（如果响应中包含）
        if (health.gpu_available !== undefined) {
          logParts.push(`GPU: ${health.gpu_available ? '可用' : '不可用'}`);
        } else {
          // 响应中没有 GPU 信息，这是正常的（取决于服务端实现）
          logParts.push(`GPU: 未报告`);
        }
        
        // 模型信息（如果响应中包含）
        if (health.models) {
          const modelInfo = [];
          if (health.models.embedding) modelInfo.push(`Embedding: ${health.models.embedding}`);
          if (health.models.reranker) modelInfo.push(`Reranker: ${health.models.reranker}`);
          if (modelInfo.length > 0) {
            logParts.push(`模型: ${modelInfo.join(', ')}`);
          }
        }
        
        this.logger.debug(`服务详情: ${logParts.join(' | ')}`);
        return; // 成功连接，退出
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          this.logger.debug(`健康检查失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${2}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
        }
      }
    }

    // 所有重试都失败
    this.logger.warn(
      `⚠️ Python AI Service 连接失败 (已重试 ${maxRetries} 次): ${lastError?.message}，将使用 OpenAI 降级`
    );
    this.logger.warn(`提示: 请检查服务地址 ${this.baseUrl} 是否可访问，或增加 PYTHON_AI_SERVICE_HEALTH_TIMEOUT`);
  }

  // ==================== 公共方法 ====================

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return this.enabled && this.isHealthy && !this.circuitBreaker.isOpen();
  }

  /**
   * 获取服务状态信息（用于监控和调试）
   */
  getServiceStatus(): {
    enabled: boolean;
    healthy: boolean;
    baseUrl: string;
    circuitBreakerState: string;
    isAvailable: boolean;
  } {
    return {
      enabled: this.enabled,
      healthy: this.isHealthy,
      baseUrl: this.baseUrl,
      circuitBreakerState: this.circuitBreaker.getState(),
      isAvailable: this.isAvailable(),
    };
  }

  /**
   * 健康检查
   * 
   * 注意：健康检查使用更长的超时时间，因为可能涉及跨网络连接
   */
  async checkHealth(): Promise<HealthCheckResponse> {
    try {
      const response = await this.http.get<HealthCheckResponse>('/health', {
        timeout: this.healthCheckTimeout,  // 使用配置的超时时间（默认 15 秒）
      });
      this.isHealthy = response.data.status === 'healthy';
      return response.data;
    } catch (error: any) {
      this.isHealthy = false;
      
      // 区分不同类型的错误
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error(`Health check timeout (${this.healthCheckTimeout}ms): service may be slow or unreachable`);
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused: service may not be running at ${this.baseUrl}`);
      } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        throw new Error(`DNS resolution failed: cannot resolve hostname`);
      } else {
        throw new Error(`Health check failed: ${error.message || error.code || 'Unknown error'}`);
      }
    }
  }

  /**
   * 生成 Embedding
   * 
   * @param texts 文本列表
   * @param options 选项
   * @returns Embedding 结果列表
   */
  async generateEmbeddings(
    texts: string[],
    options: {
      returnSparse?: boolean;
      returnColbert?: boolean;
    } = {}
  ): Promise<EmbeddingResult[]> {
    if (!this.enabled) {
      throw new Error('Python AI Service is disabled');
    }

    if (this.circuitBreaker.isOpen()) {
      throw new Error('Python AI Service circuit breaker is open');
    }

    const request: EmbeddingRequest = {
      texts,
      model: 'bge-m3',
      encoding_format: 'float',
      return_sparse: options.returnSparse ?? false,
      return_colbert: options.returnColbert ?? false,
    };

    try {
      const response = await retryWithBackoff(
        () => this.http.post<EmbeddingResponse>('/api/v1/embeddings', request),
        {
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          factor: 2,
          jitter: true,
        }
      );

      this.circuitBreaker.recordSuccess();
      // 更新健康状态（如果之前不健康，现在成功了说明服务恢复）
      if (!this.isHealthy) {
        this.isHealthy = true;
        this.logger.log('✅ Python AI Service 已恢复连接');
      }
      this.logger.debug(`✅ Embedding 生成成功: ${texts.length} 条文本，维度: ${response.data.embeddings[0]?.dense?.length || 'unknown'}`);
      return response.data.embeddings;
    } catch (error: any) {
      this.circuitBreaker.recordFailure();
      this.handleError(error, 'generateEmbeddings');
      throw error;
    }
  }

  /**
   * 生成单条文本的 Embedding
   * 
   * @param text 文本
   * @param options 选项
   * @returns Dense 向量
   */
  async generateEmbedding(
    text: string,
    options: {
      returnSparse?: boolean;
    } = {}
  ): Promise<number[]> {
    const results = await this.generateEmbeddings([text], options);
    return results[0].dense;
  }

  /**
   * 重排序
   * 
   * @param query 查询文本
   * @param documents 候选文档列表
   * @param topK 返回数量
   * @returns 重排序结果
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    topK: number = 10
  ): Promise<RerankResult[]> {
    if (!this.enabled) {
      throw new Error('Python AI Service is disabled');
    }

    if (this.circuitBreaker.isOpen()) {
      throw new Error('Python AI Service circuit breaker is open');
    }

    const request: RerankRequest = {
      query,
      documents,
      top_k: topK,
      model: 'bge-reranker-v2-m3',
    };

    try {
      const response = await retryWithBackoff(
        () => this.http.post<RerankResponse>('/api/v1/rerank', request),
        {
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          factor: 2,
          jitter: true,
        }
      );

      this.circuitBreaker.recordSuccess();
      this.logger.debug(`✅ Rerank 成功: ${documents.length} 条文档 -> top ${topK}`);
      return response.data.results;
    } catch (error: any) {
      this.circuitBreaker.recordFailure();
      this.handleError(error, 'rerank');
      throw error;
    }
  }

  /**
   * 批量生成 Embedding（异步任务）
   * 
   * @param texts 大批量文本
   * @param batchSize 每批处理数量
   * @param callbackUrl 完成后回调 URL（可选）
   * @returns 任务 ID
   */
  async createBatchEmbeddingTask(
    texts: string[],
    batchSize: number = 32,
    callbackUrl?: string
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('Python AI Service is disabled');
    }

    try {
      const response = await this.http.post<{ task_id: string }>('/api/v1/embeddings/batch', {
        texts,
        batch_size: batchSize,
        callback_url: callbackUrl,
      });

      this.logger.log(`📤 批量 Embedding 任务已创建: ${response.data.task_id}`);
      return response.data.task_id;
    } catch (error: any) {
      this.handleError(error, 'createBatchEmbeddingTask');
      throw error;
    }
  }

  /**
   * 查询批量任务状态
   * 
   * @param taskId 任务 ID
   * @returns 任务状态
   */
  async getBatchTaskStatus(taskId: string): Promise<BatchTaskStatus> {
    try {
      const response = await this.http.get<BatchTaskStatus>(`/api/v1/embeddings/batch/${taskId}`);
      return response.data;
    } catch (error: any) {
      this.handleError(error, 'getBatchTaskStatus');
      throw error;
    }
  }

  /**
   * 获取 Embedding 维度
   */
  getEmbeddingDimension(): number {
    // BGE-M3 默认 1024 维
    return 1024;
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  // ==================== 私有方法 ====================

  /**
   * 统一错误处理
   */
  private handleError(error: any, method: string): void {
    const isAxiosError = axios.isAxiosError(error);
    
    if (isAxiosError) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // 服务器返回错误
        this.logger.error(
          `[${method}] Python AI Service error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
        );
      } else if (axiosError.request) {
        // 请求未收到响应
        this.logger.error(`[${method}] Python AI Service no response: ${axiosError.message}`);
        this.isHealthy = false;
      } else {
        // 请求配置错误
        this.logger.error(`[${method}] Python AI Service request error: ${axiosError.message}`);
      }
    } else {
      this.logger.error(`[${method}] Python AI Service error: ${error.message}`);
    }
  }
}
