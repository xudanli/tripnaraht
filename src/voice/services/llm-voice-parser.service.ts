// src/voice/services/llm-voice-parser.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
import { AssistantSuggestion, AssistantAction } from '../../assist/dto/action.dto';
import {
  generateVoiceSuggestionId,
  generateClarificationSuggestionId,
} from '../../common/utils/suggestion-id.util';

/**
 * LLM 提供商类型
 */
type LlmProvider = 'openai' | 'gemini' | 'deepseek';

/**
 * LLM 语音解析服务
 * 
 * 使用 LLM（OpenAI / Gemini / DeepSeek）进行更智能的意图识别和实体提取
 * 使用 Structured Outputs / Response Schema 确保稳定输出
 * 支持强校验和回退机制
 */
@Injectable()
export class LlmVoiceParserService {
  private readonly logger = new Logger(LlmVoiceParserService.name);
  private readonly enabled: boolean;
  private readonly provider?: LlmProvider;
  private readonly apiKey?: string;

  constructor() {
    // 从环境变量读取配置
    this.enabled = process.env.ENABLE_LLM_VOICE_PARSER === 'true';
    
    // 确定使用的提供商（优先级：OpenAI > Gemini > DeepSeek）
    let provider: LlmProvider | undefined;
    let apiKey: string | undefined;
    
    if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      apiKey = process.env.OPENAI_API_KEY;
    } else if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      apiKey = process.env.GEMINI_API_KEY;
    } else if (process.env.DEEPSEEK_API_KEY) {
      provider = 'deepseek';
      apiKey = process.env.DEEPSEEK_API_KEY;
    }

    this.provider = provider!;
    this.apiKey = apiKey;

    if (this.enabled && !this.apiKey) {
      this.logger.warn('LLM voice parser enabled but no API key found');
    }
  }

  /**
   * 使用 LLM 解析语音文本
   * 
   * @param transcript 语音转文字的结果
   * @param schedule 当前行程计划
   * @returns 解析后的动作建议，如果 LLM 未启用或解析失败则返回 null
   */
  async parseWithLlm(
    transcript: string,
    schedule: DayScheduleResult
  ): Promise<AssistantSuggestion[] | null> {
    if (!this.enabled || !this.apiKey) {
      return null;
    }

    try {
      // 构建 prompt 和 schema
      const { prompt, schema } = this.buildPromptAndSchema(transcript, schedule);

      // 调用 LLM API
      const rawResponse = await this.callLlmApi(prompt, schema);

      // 解析和校验 LLM 响应
      const suggestions = this.parseAndValidateResponse(
        rawResponse,
        transcript,
        schedule
      );

      if (suggestions.length === 0) {
        this.logger.warn('LLM returned empty suggestions, falling back to rule-based');
        return null;
      }

      return suggestions;
    } catch (error: any) {
      this.logger.error(`LLM parsing failed: ${error.message}`, error.stack);
      return null; // 失败时返回 null，回退到规则匹配
    }
  }

  /**
   * 构建 prompt 和 JSON Schema
   */
  private buildPromptAndSchema(
    transcript: string,
    schedule: DayScheduleResult
  ): { prompt: string; schema: any } {
    const pois = schedule.stops
      .filter((s) => s.kind === 'POI')
      .map((s) => `- ${s.name} (ID: ${s.id}, 时间: ${this.formatTime(s.startMin)})`)
      .join('\n');

    const prompt = `你是一个智能旅行助手，负责解析用户的语音指令并生成结构化的动作建议。

当前行程中的 POI：
${pois || '（暂无）'}

用户语音指令：${transcript}

请分析用户的意图，并返回符合 JSON Schema 的动作建议。支持的动作类型：
1. QUERY_NEXT_STOP - 查询下一站
2. MOVE_POI_TO_MORNING - 移动 POI 到上午（需要 poiId 和 poiName）
3. ADD_POI_TO_SCHEDULE - 添加 POI 到行程（需要 poiId）

如果信息不足，设置 needsClarification=true 并提供 clarificationOptions。`;

    // 定义 JSON Schema（符合 AssistantSuggestion 结构）
    const schema = {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title', 'confidence'],
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              confidence: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH'],
              },
              action: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['QUERY_NEXT_STOP', 'MOVE_POI_TO_MORNING', 'ADD_POI_TO_SCHEDULE'],
                  },
                  poiId: { type: 'string' },
                  poiName: { type: 'string' },
                  preferredRange: {
                    type: 'string',
                    enum: ['AM', 'PM'],
                  },
                  rebuildTimeline: { type: 'boolean' },
                  insertAfterStopId: { type: 'string' },
                },
                required: ['type'],
              },
              clarification: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        value: { type: 'string' },
                      },
                      required: ['label', 'value'],
                    },
                  },
                },
                required: ['question'],
              },
            },
          },
        },
      },
      required: ['suggestions'],
    };

    return { prompt, schema };
  }

  /**
   * 调用 LLM API（根据提供商选择不同的实现）
   */
  private async callLlmApi(prompt: string, schema: any): Promise<string> {
    if (!this.provider) {
      throw new Error('No LLM provider configured');
    }

    switch (this.provider) {
      case 'openai':
        return this.callOpenAI(prompt, schema);
      case 'gemini':
        return this.callGemini(prompt, schema);
      case 'deepseek':
        return this.callDeepSeek(prompt, schema);
      default:
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  /**
   * 调用 OpenAI API（使用 Structured Outputs）
   */
  private async callOpenAI(prompt: string, schema: any): Promise<string> {
    let baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    
    // 确保使用 HTTPS（OpenAI API 要求）
    if (baseUrl.startsWith('http://')) {
      this.logger.warn(`OPENAI_BASE_URL uses HTTP, converting to HTTPS: ${baseUrl}`);
      baseUrl = baseUrl.replace('http://', 'https://');
    }
    
    // 确保 URL 以 https:// 开头
    if (!baseUrl.startsWith('https://')) {
      throw new Error(`OPENAI_BASE_URL must start with https://, got: ${baseUrl}`);
    }
    
    const url = `${baseUrl}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '你是一个智能旅行助手，负责解析用户的语音指令。严格按照 JSON Schema 返回结果。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'voice_parse_response',
            strict: true,
            schema: schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    return content;
  }

  /**
   * 调用 Gemini API（使用 Response Schema）
   */
  private async callGemini(prompt: string, schema: any): Promise<string> {
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `系统提示：你是一个智能旅行助手，负责解析用户的语音指令。严格按照 JSON Schema 返回结果。\n\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      throw new Error('Gemini API returned empty content');
    }

    return content;
  }

  /**
   * 调用 DeepSeek API（使用 JSON 模式）
   */
  private async callDeepSeek(prompt: string, schema: any): Promise<string> {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是一个智能旅行助手，负责解析用户的语音指令。严格按照以下 JSON Schema 返回结果，只返回 JSON，不要其他文本：\n${JSON.stringify(schema, null, 2)}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('DeepSeek API returned empty content');
    }

    return content;
  }

  /**
   * 解析和校验 LLM 响应
   */
  private parseAndValidateResponse(
    rawResponse: string,
    transcript: string,
    schedule: DayScheduleResult
  ): AssistantSuggestion[] {
    try {
      // 尝试解析 JSON
      let parsed: any;
      try {
        parsed = JSON.parse(rawResponse);
      } catch (parseError) {
        // 尝试提取 JSON（如果被其他文本包裹）
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }

      // 校验结构
      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        this.logger.warn('LLM response missing suggestions array');
        return [];
      }

      // 转换并校验每个建议
      const suggestions: AssistantSuggestion[] = [];
      
      for (const rawSuggestion of parsed.suggestions) {
        try {
          const suggestion = this.validateAndTransformSuggestion(
            rawSuggestion,
            transcript,
            schedule
          );
          
          if (suggestion) {
            suggestions.push(suggestion);
          }
        } catch (error: any) {
          this.logger.warn(`Invalid suggestion skipped: ${error.message}`, rawSuggestion);
          // 继续处理其他建议
        }
      }

      return suggestions;
    } catch (error: any) {
      this.logger.error(`Failed to parse LLM response: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 校验并转换单个建议
   */
  private validateAndTransformSuggestion(
    raw: any,
    transcript: string,
    schedule: DayScheduleResult
  ): AssistantSuggestion | null {
    // 必需字段校验
    if (!raw.id || !raw.title || !raw.confidence) {
      throw new Error('Missing required fields: id, title, or confidence');
    }

    // 置信度枚举校验
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(raw.confidence)) {
      throw new Error(`Invalid confidence: ${raw.confidence}`);
    }

    // 构建建议对象
    const suggestion: AssistantSuggestion = {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      confidence: raw.confidence,
    };

    // 处理 action
    if (raw.action) {
      if (!raw.action.type) {
        throw new Error('Action missing type');
      }

      const actionType = raw.action.type;
      
      // 根据 action 类型构建对应的 action
      switch (actionType) {
        case 'QUERY_NEXT_STOP':
          suggestion.action = { type: 'QUERY_NEXT_STOP' };
          break;
          
        case 'MOVE_POI_TO_MORNING':
          if (!raw.action.poiId) {
            // 如果没有 poiId，可能需要澄清
            suggestion.clarification = {
              question: '要把哪个景点挪到上午？',
              options: schedule.stops
                .filter((s) => s.kind === 'POI')
                .map((s) => ({
                  label: s.name || '未命名',
                  value: s.id,
                })),
            };
            suggestion.action = {
              type: 'MOVE_POI_TO_MORNING',
              preferredRange: raw.action.preferredRange || 'AM',
            };
          } else {
            suggestion.action = {
              type: 'MOVE_POI_TO_MORNING',
              poiId: raw.action.poiId,
              poiName: raw.action.poiName,
              preferredRange: raw.action.preferredRange || 'AM',
              rebuildTimeline: raw.action.rebuildTimeline || false,
            };
          }
          break;
          
        case 'ADD_POI_TO_SCHEDULE':
          if (!raw.action.poiId) {
            throw new Error('ADD_POI_TO_SCHEDULE requires poiId');
          }
          suggestion.action = {
            type: 'ADD_POI_TO_SCHEDULE',
            poiId: raw.action.poiId,
            preferredRange: raw.action.preferredRange,
            insertAfterStopId: raw.action.insertAfterStopId,
          };
          break;
          
        default:
          throw new Error(`Unsupported action type: ${actionType}`);
      }
    }

    // 处理 clarification
    if (raw.clarification) {
      if (!raw.clarification.question) {
        throw new Error('Clarification missing question');
      }
      suggestion.clarification = {
        question: raw.clarification.question,
        options: raw.clarification.options || [],
      };
    }

    // 生成稳定的 suggestion ID（如果 LLM 没有提供或需要覆盖）
    if (suggestion.action) {
      // 只有非 QUERY_NEXT_STOP 类型的 action 才有 poiId
      const poiId = 'poiId' in suggestion.action ? suggestion.action.poiId : undefined;
      const stableId = generateVoiceSuggestionId(
        suggestion.action.type,
        poiId,
        transcript
      );
      suggestion.id = stableId;
    } else if (suggestion.clarification) {
      suggestion.id = generateClarificationSuggestionId('MOVE_POI_TO_MORNING');
    }

    return suggestion;
  }

  /**
   * 格式化时间
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
