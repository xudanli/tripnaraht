// src/places/services/embedding.service.ts
import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import dns from 'node:dns';
import { createOpenAIHttp } from '../../llm/utils/openai-http.factory';
import { retryWithBackoff } from '../../llm/utils/retry-with-backoff';
import { EmbeddingCacheService } from '../../rag/services/embedding-cache.service';
import { PythonAIService } from '../../llm/services/python-ai.service';

/**
 * Embedding 提供商类型
 */
export type EmbeddingProvider = 'python' | 'openai';

/**
 * Embedding 服务
 * 
 * 使用 BGE-M3 (1024维) - 通过 Python AI 服务，本地部署，零成本
 * 
 * 注意：已移除OpenAI支持，统一使用1024维（BGE-M3）
 * 
 * 失败处理:
 * - Python AI 服务失败时返回错误（不再降级到OpenAI）
 * - 所有提供商失败时返回零向量（最终降级）
 * 
 * 缓存优化：使用Redis缓存查询embedding，减少API调用和延迟
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: EmbeddingProvider;
  private readonly openaiApiKey?: string;
  private readonly embeddingDimension: number;
  // OpenAI HTTP 客户端（使用统一的工厂函数，确保代理配置一致）
  private readonly openaiHttp: AxiosInstance;
  
  // 并发请求去重：避免同时生成相同文本的 embedding
  private readonly inFlightRequests = new Map<string, Promise<number[]>>();

  constructor(
    @Optional() private configService?: ConfigService,
    @Optional() private embeddingCacheService?: EmbeddingCacheService,
    @Optional() @Inject(forwardRef(() => PythonAIService)) private pythonAIService?: PythonAIService,
  ) {
    // 强制 IPv4 优先（解决 IPv6 连接失败问题）
    dns.setDefaultResultOrder('ipv4first');
    
    // 读取配置的提供商（默认 python，因为成本更低）
    const configuredProvider = this.configService?.get<string>('EMBEDDING_PROVIDER') || 'python';
    this.provider = configuredProvider as EmbeddingProvider;
    
    // 读取 embedding 维度配置
    // python (BGE-M3): 1024 维
    // openai (text-embedding-3-small): 1536 维
    const configuredDimension = this.configService?.get<number>('EMBEDDING_DIMENSION');
    this.embeddingDimension = configuredDimension || (this.provider === 'python' ? 1024 : 1536);
    
    this.openaiApiKey = this.configService?.get<string>('OPENAI_API_KEY');
    
    // 使用统一的工厂函数创建 OpenAI HTTP 客户端（与 LlmService 使用相同配置）
    // 注意：禁用代理，因为代理服务器可能未运行，会导致连接错误
    const baseUrl = this.configService?.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const disableProxy = this.configService?.get<string>('OPENAI_DISABLE_PROXY') === 'true' || true; // 默认禁用代理
    this.openaiHttp = createOpenAIHttp(baseUrl, this.logger, { disableProxy });
    
    this.logger.log(`Embedding 服务初始化: provider=${this.provider}, dimension=${this.embeddingDimension}`);
  }

  /**
   * 生成文本的 embedding
   * 
   * 使用 BGE-M3 (1024维) - Python AI 服务
   * 
   * 注意：已移除OpenAI降级，只使用Python AI服务
   * 
   * 失败处理：
   * - Python AI 服务失败时返回错误（不再降级到OpenAI）
   * - 所有提供商失败时返回零向量（最终降级）
   * 
   * 缓存优化：优先从缓存获取，未命中时生成并缓存
   * 并发去重：如果多个请求同时请求相同文本，复用同一个生成任务
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    // 标准化文本（用于缓存键和去重）
    const normalizedText = text.trim().toLowerCase();

    // 1. 尝试从缓存获取
    if (this.embeddingCacheService) {
      const cached = await this.embeddingCacheService.get(text);
      if (cached) {
        this.logger.debug(`✅ 使用缓存的embedding: ${text.substring(0, 50)}...`);
        return cached;
      }
    }

    // 2. 检查是否有正在进行的相同请求（并发去重）
    const inFlightRequest = this.inFlightRequests.get(normalizedText);
    if (inFlightRequest) {
      this.logger.debug(`🔄 复用正在进行的embedding生成: ${text.substring(0, 50)}...`);
      return inFlightRequest;
    }

    // 3. 创建新的生成任务
    const embeddingPromise = this.generateEmbeddingInternal(text, normalizedText);
    
    // 4. 将任务添加到进行中的请求映射
    this.inFlightRequests.set(normalizedText, embeddingPromise);

    try {
      const embedding = await embeddingPromise;
      return embedding;
    } finally {
      // 5. 完成后从映射中移除
      this.inFlightRequests.delete(normalizedText);
    }
  }

  /**
   * 获取当前使用的提供商
   */
  getCurrentProvider(): EmbeddingProvider {
    // 如果配置为 python 且 Python 服务可用，返回 python
    if (this.provider === 'python' && this.pythonAIService?.isAvailable()) {
      return 'python';
    }
    // 否则降级到 openai
    return 'openai';
  }

  /**
   * 内部方法：实际生成 embedding
   * 
   * 路由策略：
   * 1. 配置为 python 时，优先尝试 Python AI 服务
   * 2. Python 失败或不可用时，降级到 OpenAI
   * 3. 所有提供商失败时，返回零向量
   */
  private async generateEmbeddingInternal(text: string, normalizedText: string): Promise<number[]> {
    let embedding: number[] | null = null;
    let usedProvider: EmbeddingProvider = this.provider;

    // 策略1：优先尝试 Python AI 服务（如果配置为 python）
    if (this.provider === 'python' && this.pythonAIService) {
      if (this.pythonAIService.isAvailable()) {
        try {
          embedding = await this.pythonAIService.generateEmbedding(text);
          usedProvider = 'python';
          this.logger.debug(`✅ Python AI (BGE-M3) embedding 生成成功: ${text.substring(0, 50)}...`);
        } catch (error: any) {
          this.logger.warn(`Python AI 服务失败: ${error.message}，降级到 OpenAI...`);
        }
      } else {
        this.logger.debug(`Python AI 服务不可用，降级到 OpenAI`);
      }
    }

    // 策略2：降级到 OpenAI（如果 Python 失败或配置为 openai）
    if (!embedding) {
      try {
        embedding = await this.generateOpenAIEmbedding(text);
        usedProvider = 'openai';
        this.logger.debug(`✅ OpenAI embedding 生成成功: ${text.substring(0, 50)}...`);
      } catch (error: any) {
        this.logger.error(`OpenAI embedding 也失败: ${error.message}`);
      }
    }

    // Python AI 服务失败，返回零向量（最终降级）
    if (!embedding) {
      const dimension = 1024; // BGE-M3 固定1024维
      this.logger.error(`Python AI 服务失败，返回零向量（维度: ${dimension}）`);
      return new Array(dimension).fill(0);
    }

    // 缓存生成的 embedding（不缓存零向量）
    if (this.embeddingCacheService && embedding.some(v => v !== 0)) {
      await this.embeddingCacheService.set(text, embedding).catch(err => {
        this.logger.warn(`缓存 embedding 失败: ${err.message}`);
      });
    }

    return embedding;
  }

  /**
   * 使用 OpenAI API 生成 embedding
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY 未配置');
    }

    try {
      // 使用统一的 OpenAI HTTP 客户端（与 LlmService 使用相同配置，包括代理设置），带重试机制
      const response = await retryWithBackoff(
        () => this.openaiHttp.post(
          '/embeddings',
          {
            model: 'text-embedding-3-small',
            input: text,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
            },
          }
        ),
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
          factor: 2,
          jitter: true,
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      }

      throw new Error('OpenAI API 返回格式错误');
    } catch (error: any) {
      // 输出底层错误信息
      const errorDetails = {
        message: error?.message,
        code: error?.code,
        errno: error?.errno,
        syscall: error?.syscall,
        address: error?.address,
        port: error?.port,
        cause: error?.cause?.message ?? error?.cause,
        errors: error?.errors?.map((e: any) => ({
          message: e?.message,
          code: e?.code,
          errno: e?.errno,
          syscall: e?.syscall,
        })),
      };
      this.logger.error(`OpenAI Embedding API error details: ${JSON.stringify(errorDetails, null, 2)}`);
      
      if (error.response) {
        const errorMsg = error.response.data?.error?.message || error.response.statusText || 'Unknown error';
        throw new Error(`OpenAI API 错误 (${error.response.status}): ${errorMsg}`);
      }
      if (error.message) {
        throw new Error(`OpenAI API 调用失败: ${error.message}`);
      }
      throw new Error(`OpenAI API 调用失败: ${error.toString()}`);
    }
  }

  /**
   * 批量生成 embedding（带重试机制）
   */
  async generateEmbeddingsBatch(
    texts: string[],
    batchSize: number = 10,
    retries: number = 3
  ): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      for (const text of batch) {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            const embedding = await this.generateEmbedding(text);
            results.push(embedding);
            break;
          } catch (error: any) {
            lastError = error;
            if (attempt < retries - 1) {
              // 指数退避
              await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
          }
        }
        
        if (lastError && results.length === i) {
          throw lastError;
        }
      }
      
      // 批次间延迟，避免 API 限流
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * 获取 embedding 维度
   * 
   * 维度说明：
   * - python (BGE-M3): 1024 维
   * - openai (text-embedding-3-small): 1536 维
   * 
   * 注意：当前实际使用的维度取决于 getCurrentProvider() 返回的提供商
   */
  getEmbeddingDimension(provider?: EmbeddingProvider): number {
    const effectiveProvider = provider || this.getCurrentProvider();
    
    switch (effectiveProvider) {
      case 'python':
        return 1024;  // BGE-M3
      case 'openai':
        return 1536;  // text-embedding-3-small
      default:
        return this.embeddingDimension;
    }
  }

  /**
   * 获取配置的默认维度
   * 
   * 固定返回1024维（BGE-M3）
   */
  getConfiguredDimension(): number {
    return 1024; // 固定1024维，忽略配置
  }

  /**
   * 检查 Python AI 服务是否可用
   */
  isPythonAIAvailable(): boolean {
    return this.pythonAIService?.isAvailable() ?? false;
  }
}

