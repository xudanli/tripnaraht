// src/places/services/embedding.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Embedding 服务
 * 
 * 支持多种 embedding 模型：
 * 1. OpenAI text-embedding-3-small（推荐用于生产）
 * 2. multilingual-e5-large（开源，推荐用于开发/测试）
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;
  private readonly openaiApiKey?: string;
  private readonly huggingfaceApiKey?: string;

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get<string>('EMBEDDING_PROVIDER') || 'openai';
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.huggingfaceApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
  }

  /**
   * 生成文本的 embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('文本不能为空');
    }

    try {
      switch (this.provider.toLowerCase()) {
        case 'openai':
          return await this.generateOpenAIEmbedding(text);
        case 'huggingface':
        case 'e5':
          return await this.generateE5Embedding(text);
        default:
          this.logger.warn(`不支持的 embedding 提供商: ${this.provider}，使用 OpenAI`);
          return await this.generateOpenAIEmbedding(text);
      }
    } catch (error: any) {
      this.logger.error(`生成 embedding 失败: ${error.message}`);
      throw error;
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
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: 'text-embedding-3-small',
          input: text,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      }

      throw new Error('OpenAI API 返回格式错误');
    } catch (error: any) {
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

      const response = await axios.post(
        'https://api-inference.huggingface.co/pipeline/feature-extraction/intfloat/multilingual-e5-large',
        {
          inputs: queryText,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.huggingfaceApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // E5 模型可能需要更长时间
        }
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }

      throw new Error('Hugging Face API 返回格式错误');
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Hugging Face API 错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
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
  getEmbeddingDimension(): number {
    switch (this.provider.toLowerCase()) {
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

