// src/rag/services/llm-extraction.service.ts
/**
 * LLM 提取服务（辅助服务）
 * 
 * 提供通用的 LLM 调用方法，用于从文本中提取结构化数据
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createOpenAIHttp } from '../../llm/utils/openai-http.factory';
import { retryWithBackoff } from '../../llm/utils/retry-with-backoff';

@Injectable()
export class LlmExtractionService {
  private readonly logger = new Logger(LlmExtractionService.name);
  private readonly openaiHttp: AxiosInstance;
  private readonly apiKey?: string;

  constructor(@Optional() private configService?: ConfigService) {
    this.apiKey = this.configService?.get<string>('OPENAI_API_KEY');
    const baseUrl = this.configService?.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    this.openaiHttp = createOpenAIHttp(baseUrl, this.logger);
  }

  /**
   * 从文本中提取结构化数据
   */
  async extractStructured<T>(
    prompt: string,
    schema: any
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const model = this.configService?.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // 降低温度以提高准确性
    };

    // 使用 structured outputs（如果支持）
    const supportsJsonSchema = model.includes('gpt-4o') || model.includes('gpt-4-turbo');
    if (supportsJsonSchema && schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'extraction_response',
          strict: true,
          schema: schema,
        },
      };
    } else if (schema) {
      // 降级到 json_object 格式
      body.response_format = { type: 'json_object' };
      body.messages[0].content += '\n\n请以 JSON 格式返回结果，符合以下 schema：\n' + JSON.stringify(schema, null, 2);
    }

    try {
      const response = await retryWithBackoff(
        () => this.openaiHttp.post('/chat/completions', body),
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
        }
      );

      const data = response.data as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI API returned empty content');
      }

      // 尝试解析 JSON（可能包含 markdown 代码块）
      let jsonText = content;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      return JSON.parse(jsonText) as T;
    } catch (error: any) {
      this.logger.error(`LLM 提取失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

