// src/places/services/embedding.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import dns from 'node:dns';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createOpenAIHttp } from '../../llm/utils/openai-http.factory';
import { retryWithBackoff } from '../../llm/utils/retry-with-backoff';

/**
 * Embedding 服务
 * 
 * 支持多种 embedding 模型：
 * 1. OpenAI text-embedding-3-small（推荐用于生产）
 * 2. multilingual-e5-large（开源，推荐用于开发/测试）
 * 3. 自动降级：如果主提供商失败，自动尝试备用提供商
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;
  private readonly openaiApiKey?: string;
  private readonly huggingfaceApiKey?: string;
  private readonly fallbackProviders: string[]; // 备用提供商列表
  // OpenAI HTTP 客户端（使用统一的工厂函数，确保代理配置一致）
  private readonly openaiHttp: AxiosInstance;

  constructor(@Optional() private configService?: ConfigService) {
    // 强制 IPv4 优先（解决 IPv6 连接失败问题）
    dns.setDefaultResultOrder('ipv4first');
    
    this.provider = this.configService?.get<string>('EMBEDDING_PROVIDER') || 'openai';
    this.openaiApiKey = this.configService?.get<string>('OPENAI_API_KEY');
    this.huggingfaceApiKey = this.configService?.get<string>('HUGGINGFACE_API_KEY');
    
    // 配置备用提供商（按优先级排序）
    // 如果主提供商是 openai，则尝试 e5；如果主提供商是 e5，则尝试 openai
    this.fallbackProviders = this.provider.toLowerCase() === 'openai' 
      ? ['e5', 'huggingface'] 
      : ['openai'];
    
    // 使用统一的工厂函数创建 OpenAI HTTP 客户端（与 LlmService 使用相同配置）
    const baseUrl = this.configService?.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    this.openaiHttp = createOpenAIHttp(baseUrl, this.logger);
  }

  /**
   * 生成文本的 embedding
   * 
   * 如果主提供商失败，自动尝试备用提供商
   * 如果所有提供商都失败，返回空向量（降级策略），让流程能继续
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    // 尝试主提供商
    try {
      return await this.generateEmbeddingWithProvider(text, this.provider);
    } catch (error: any) {
      this.logger.warn(`主提供商 ${this.provider} 失败: ${error.message}，尝试备用提供商...`);
      
      // 尝试备用提供商
      for (const fallbackProvider of this.fallbackProviders) {
        try {
          this.logger.log(`尝试备用提供商: ${fallbackProvider}`);
          return await this.generateEmbeddingWithProvider(text, fallbackProvider);
        } catch (fallbackError: any) {
          this.logger.warn(`备用提供商 ${fallbackProvider} 也失败: ${fallbackError.message}`);
          continue;
        }
      }
      
      // 所有提供商都失败，返回零向量
      this.logger.error(`所有 embedding 提供商都失败，返回零向量`);
      const dimension = this.getEmbeddingDimension();
      this.logger.warn(`Embedding 失败，返回零向量（维度: ${dimension}），将降级到关键词搜索`);
      return new Array(dimension).fill(0);
    }
  }

  /**
   * 使用指定提供商生成 embedding
   */
  private async generateEmbeddingWithProvider(text: string, provider: string): Promise<number[]> {
    switch (provider.toLowerCase()) {
      case 'openai':
        return await this.generateOpenAIEmbedding(text);
      case 'huggingface':
      case 'e5':
        return await this.generateE5Embedding(text);
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
   * 使用 multilingual-e5-large 生成 embedding
   */
  private async generateE5Embedding(text: string): Promise<number[]> {
    // 使用 Hugging Face Inference API
    if (!this.huggingfaceApiKey) {
      throw new Error('HUGGINGFACE_API_KEY 未配置');
    }

    try {
      // E5 模型需要在输入前添加 "query: " 前缀（用于查询）或 "passage: " 前缀（用于文档）
      const queryText = `query: ${text}`;

      // 创建 HTTPS Agent（如果配置了代理则使用代理，否则直接连接）
      // 注意：如果服务器无法直接访问外网，需要通过代理访问 HuggingFace
      const proxyUrl =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;
      
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent<string>(proxyUrl)
        : new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            timeout: 60000,
            family: 4, // 强制 IPv4
          });
      
      if (proxyUrl) {
        this.logger.debug(`[EmbeddingService] E5 使用代理: ${proxyUrl}`);
      }

      // HuggingFace Inference API 首次调用可能需要等待模型加载（cold start）
      // 使用重试机制，增加超时时间
      const response = await retryWithBackoff(
        () => axios.post(
          'https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large',
          {
            inputs: queryText,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.huggingfaceApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120000, // 120秒超时（首次调用模型加载可能需要60-90秒）
            httpsAgent, // 使用直接连接的 HTTPS Agent
            proxy: false, // 明确禁用代理
          }
        ),
        {
          maxRetries: 3,
          initialDelayMs: 5000, // 首次重试等待5秒（模型可能正在加载）
          maxDelayMs: 30000, // 最大延迟30秒
          factor: 2,
          jitter: true,
          // 对于 503 错误（模型加载中），增加重试次数
          retryCondition: (error: any) => {
            // 503 表示模型正在加载，应该重试
            if (error?.response?.status === 503) {
              this.logger.warn('[EmbeddingService] HuggingFace 模型正在加载中，等待后重试...');
              return true;
            }
            // 网络错误也应该重试
            return !error?.response || error?.response?.status >= 500;
          },
        }
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }

      throw new Error('Hugging Face API 返回格式错误');
    } catch (error: any) {
      // 详细错误日志
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 503) {
          // 模型正在加载
          this.logger.warn(`[EmbeddingService] HuggingFace 模型正在加载中，请稍后重试`);
          throw new Error(`Hugging Face API 模型加载中 (503): 首次使用或长时间未使用后需要等待 30-60 秒加载模型`);
        } else if (status === 401) {
          // 认证失败
          this.logger.error(`[EmbeddingService] HuggingFace API Key 无效`);
          throw new Error(`Hugging Face API 认证失败 (401): 请检查 HUGGINGFACE_API_KEY 是否正确`);
        } else if (status === 429) {
          // 速率限制
          this.logger.warn(`[EmbeddingService] HuggingFace API 速率限制`);
          throw new Error(`Hugging Face API 速率限制 (429): 请稍后重试`);
        } else {
          throw new Error(`Hugging Face API 错误 (${status}): ${JSON.stringify(data)}`);
        }
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        this.logger.error(`[EmbeddingService] HuggingFace API 请求超时: ${error.message}`);
        throw new Error(`Hugging Face API 请求超时: 首次调用可能需要等待模型加载（60-90秒），请稍后重试`);
      } else {
        this.logger.error(`[EmbeddingService] HuggingFace API 调用失败: ${error.message}`);
        throw error;
      }
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
    const effectiveProvider = provider || this.provider;
    switch (effectiveProvider.toLowerCase()) {
      case 'openai':
        return 1536; // text-embedding-3-small
      case 'huggingface':
      case 'e5':
        return 1024; // multilingual-e5-large
      default:
        return 1536;
    }
  }
}

