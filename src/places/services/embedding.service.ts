// src/places/services/embedding.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import dns from 'node:dns';
import { createOpenAIHttp } from '../../llm/utils/openai-http.factory';
import { retryWithBackoff } from '../../llm/utils/retry-with-backoff';
import { EmbeddingCacheService } from '../../rag/services/embedding-cache.service';

/**
 * Embedding 服务
 * 
 * 支持 OpenAI text-embedding-3-small（1536维）
 * 自动降级：如果主提供商失败，自动尝试备用提供商
 * 缓存优化：使用Redis缓存查询embedding，减少API调用和延迟
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;
  private readonly openaiApiKey?: string;
  private readonly fallbackProviders: string[]; // 备用提供商列表
  // OpenAI HTTP 客户端（使用统一的工厂函数，确保代理配置一致）
  private readonly openaiHttp: AxiosInstance;

  constructor(
    @Optional() private configService?: ConfigService,
    @Optional() private embeddingCacheService?: EmbeddingCacheService,
  ) {
    // 强制 IPv4 优先（解决 IPv6 连接失败问题）
    dns.setDefaultResultOrder('ipv4first');
    
    this.provider = this.configService?.get<string>('EMBEDDING_PROVIDER') || 'openai';
    this.openaiApiKey = this.configService?.get<string>('OPENAI_API_KEY');
    
    // 配置备用提供商（目前仅支持 OpenAI）
    this.fallbackProviders = [];
    
    // 使用统一的工厂函数创建 OpenAI HTTP 客户端（与 LlmService 使用相同配置）
    const baseUrl = this.configService?.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    this.openaiHttp = createOpenAIHttp(baseUrl, this.logger);
  }

  /**
   * 生成文本的 embedding
   * 
   * 缓存优化：优先从缓存获取，未命中时生成并缓存
   * 如果主提供商失败，自动尝试备用提供商
   * 如果所有提供商都失败，返回空向量（降级策略），让流程能继续
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    // 1. 尝试从缓存获取
    if (this.embeddingCacheService) {
      const cached = await this.embeddingCacheService.get(text);
      if (cached) {
        this.logger.debug(`✅ 使用缓存的embedding: ${text.substring(0, 50)}...`);
        return cached;
      }
    }

    // 2. 缓存未命中，生成新的embedding
    let embedding: number[];
    try {
      embedding = await this.generateEmbeddingWithProvider(text, this.provider);
    } catch (error: any) {
      this.logger.warn(`主提供商 ${this.provider} 失败: ${error.message}，尝试备用提供商...`);
      
      // 尝试备用提供商
      let found = false;
      for (const fallbackProvider of this.fallbackProviders) {
        try {
          this.logger.log(`尝试备用提供商: ${fallbackProvider}`);
          embedding = await this.generateEmbeddingWithProvider(text, fallbackProvider);
          found = true;
          break;
        } catch (fallbackError: any) {
          this.logger.warn(`备用提供商 ${fallbackProvider} 也失败: ${fallbackError.message}`);
          continue;
        }
      }
      
      if (!found) {
        // 所有提供商都失败，返回零向量
        this.logger.error(`所有 embedding 提供商都失败，返回零向量`);
        const dimension = this.getEmbeddingDimension();
        this.logger.warn(`Embedding 失败，返回零向量（维度: ${dimension}），将降级到关键词搜索`);
        return new Array(dimension).fill(0);
      }
    }

    // 3. 缓存生成的embedding（不缓存零向量）
    if (this.embeddingCacheService && embedding.some(v => v !== 0)) {
      await this.embeddingCacheService.set(text, embedding).catch(err => {
        this.logger.warn(`缓存embedding失败: ${err.message}`);
      });
    }

    return embedding;
  }

  /**
   * 使用指定提供商生成 embedding
   */
  private async generateEmbeddingWithProvider(text: string, provider: string): Promise<number[]> {
    switch (provider.toLowerCase()) {
      case 'openai':
        return await this.generateOpenAIEmbedding(text);
      default:
        throw new Error(`不支持的 embedding 提供商: ${provider}`);
    }
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
   */
  getEmbeddingDimension(provider?: string): number {
    // 统一使用 OpenAI text-embedding-3-small（1536维）
    return 1536;
  }
}

