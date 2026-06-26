/**
 * 智能推断服务
 * 根据用户输入推断默认值，并返回置信度
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { LLMTraceService } from './llm-trace.service';
import { LLMCacheService } from './llm-cache.service';
import { FeatureFlagService } from './feature-flag.service';

export interface InferredValue<T> {
  value: T;
  confidence: number; // 0-1
  source: 'user_explicit' | 'intent_inferred' | 'market_default' | 'system_default';
  reason?: string;
}

export interface InferenceResult {
  destination: InferredValue<string>;
  days: InferredValue<number>;
  date_range: InferredValue<{ start_date?: string; end_date?: string }>;
  transport: InferredValue<'car' | 'transit' | 'walk'>;
  style: InferredValue<'nature' | 'culture' | 'food' | 'citywalk' | 'photography' | 'adventure'>;
  intensity: InferredValue<'relaxed' | 'balanced' | 'intense'>;
  unresolved_slots: string[];
  overallConfidence: number;
}

@Injectable()
export class SmartInferenceService {
  private readonly logger = new Logger(SmartInferenceService.name);

  constructor(private readonly llmService: LlmService) {}

  /**
   * 推断默认值（带置信度）
   */
  async inferDefaults(userInput: string, existingRequest?: Partial<TripPlanRequest>): Promise<InferenceResult> {
    const startTime = Date.now();

    // 1. 如果已有部分信息，优先使用
    const partialResult = this.inferFromExisting(existingRequest);

    // 2. LLM推断缺失信息
    const llmResult = await this.inferFromLLM(userInput, partialResult);

    // 3. 合并结果
    const merged = this.mergeInferenceResults(partialResult, llmResult);

    // 4. 计算未解决槽位
    const unresolved = this.identifyUnresolvedSlots(merged);

    // 5. 计算整体置信度
    const overallConfidence = this.calculateOverallConfidence(merged);

    this.logger.log(`智能推断完成，耗时${Date.now() - startTime}ms，整体置信度${overallConfidence}`);

    return {
      ...merged,
      unresolved_slots: unresolved,
      overallConfidence,
    };
  }

  /**
   * 从已有请求推断
   */
  private inferFromExisting(request?: Partial<TripPlanRequest>): Partial<InferenceResult> {
    if (!request) return {};

    const result: Partial<InferenceResult> = {};

    if (request.destination) {
      result.destination = {
        value: typeof request.destination === 'string' ? request.destination : 'unknown',
        confidence: 1.0,
        source: 'user_explicit',
        reason: '用户明确指定',
      };
    }

    if (request.days) {
      result.days = {
        value: request.days,
        confidence: 1.0,
        source: 'user_explicit',
        reason: '用户明确指定',
      };
    }

    if (request.date_range) {
      result.date_range = {
        value: request.date_range,
        confidence: 1.0,
        source: 'user_explicit',
        reason: '用户明确指定',
      };
    }

    // transport/style/intensity 不在 TripPlanRequest 中，跳过
    // 这些字段可能在其他上下文中使用

    return result;
  }

  /**
   * 从LLM推断
   */
  private async inferFromLLM(
    userInput: string,
    existing: Partial<InferenceResult>,
  ): Promise<Partial<InferenceResult>> {
    const prompt = `
根据用户输入推断旅行参数。用户输入："${userInput}"

已有信息：
${this.formatExistingInfo(existing)}

请推断缺失的参数，并给出置信度（0-1）。

返回JSON格式：
{
  "destination": {"value": "国家代码", "confidence": 0.95, "reason": "推断原因"},
  "days": {"value": 7, "confidence": 0.8, "reason": "推断原因"},
  "date_range": {"value": {"start_date": "2026-06-01", "end_date": "2026-06-07"}, "confidence": 0.6, "reason": "推断原因"},
  "transport": {"value": "car", "confidence": 0.9, "reason": "推断原因"},
  "style": {"value": "nature", "confidence": 0.85, "reason": "推断原因"},
  "intensity": {"value": "balanced", "confidence": 0.7, "reason": "推断原因"}
}

置信度标准：
- 0.9-1.0: 用户明确提及或高度确定
- 0.7-0.9: 可以合理推断
- 0.5-0.7: 基于市场默认值
- <0.5: 不确定，需要澄清

只返回缺失的字段，已有字段不要返回。
`;

    const schema = {
      type: 'object',
      properties: {
        destination: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
        days: {
          type: 'object',
          properties: {
            value: { type: 'number' },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
        date_range: {
          type: 'object',
          properties: {
            value: {
              type: 'object',
              properties: {
                start_date: { type: 'string' },
                end_date: { type: 'string' },
              },
            },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
        transport: {
          type: 'object',
          properties: {
            value: { type: 'string', enum: ['car', 'transit', 'walk'] },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
        style: {
          type: 'object',
          properties: {
            value: { type: 'string', enum: ['nature', 'culture', 'food', 'citywalk', 'photography', 'adventure'] },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
        intensity: {
          type: 'object',
          properties: {
            value: { type: 'string', enum: ['relaxed', 'balanced', 'intense'] },
            confidence: { type: 'number' },
            reason: { type: 'string' },
          },
        },
      },
    };

    try {
      const responseString = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt,
        schema,
      );

      // LLM 返回可能是字符串或已解析的对象
      const parsed = typeof responseString === 'string' ? JSON.parse(responseString) : responseString;
      const result: Partial<InferenceResult> = {};

      if (parsed.destination) {
        result.destination = {
          ...parsed.destination,
          source: 'intent_inferred',
        };
      }

      if (parsed.days) {
        result.days = {
          ...parsed.days,
          source: 'intent_inferred',
        };
      }

      if (parsed.date_range) {
        result.date_range = {
          ...parsed.date_range,
          source: 'intent_inferred',
        };
      }

      if (parsed.transport) {
        result.transport = {
          ...parsed.transport,
          source: 'intent_inferred',
        };
      }

      if (parsed.style) {
        result.style = {
          ...parsed.style,
          source: 'intent_inferred',
        };
      }

      if (parsed.intensity) {
        result.intensity = {
          ...parsed.intensity,
          source: 'intent_inferred',
        };
      }

      return result;
    } catch (error) {
      this.logger.error(`LLM推断失败: ${error}`);
      // 降级到市场默认值
      return this.getMarketDefaults();
    }
  }

  /**
   * 获取市场默认值
   */
  private getMarketDefaults(): Partial<InferenceResult> {
    return {
      days: {
        value: 7,
        confidence: 0.5,
        source: 'market_default',
        reason: '市场默认7天',
      },
      transport: {
        value: 'transit',
        confidence: 0.5,
        source: 'market_default',
        reason: '市场默认公共交通',
      },
      style: {
        value: 'nature',
        confidence: 0.5,
        source: 'market_default',
        reason: '市场默认自然风光',
      },
      intensity: {
        value: 'balanced',
        confidence: 0.5,
        source: 'market_default',
        reason: '市场默认均衡强度',
      },
    };
  }

  /**
   * 合并推断结果
   */
  private mergeInferenceResults(
    existing: Partial<InferenceResult>,
    llm: Partial<InferenceResult>,
  ): InferenceResult {
    const merged = {
      destination: existing.destination ?? llm.destination ?? this.getSystemDefault('destination'),
      days: existing.days ?? llm.days ?? this.getSystemDefault('days'),
      date_range: existing.date_range ?? llm.date_range ?? this.getSystemDefault('date_range'),
      transport: existing.transport ?? llm.transport ?? this.getSystemDefault('transport'),
      style: existing.style ?? llm.style ?? this.getSystemDefault('style'),
      intensity: existing.intensity ?? llm.intensity ?? this.getSystemDefault('intensity'),
    };

    // 计算未解决槽位
    const unresolved: string[] = [];
    if (merged.destination.confidence < 0.5) unresolved.push('destination');
    if (merged.days.confidence < 0.5) unresolved.push('days');
    if (merged.date_range.confidence < 0.5) unresolved.push('date_range');
    if (merged.transport.confidence < 0.5) unresolved.push('transport');
    if (merged.style.confidence < 0.5) unresolved.push('style');
    if (merged.intensity.confidence < 0.5) unresolved.push('intensity');

    // 计算整体置信度
    const fields = [
      merged.destination.confidence,
      merged.days.confidence,
      merged.date_range.confidence,
      merged.transport.confidence,
      merged.style.confidence,
      merged.intensity.confidence,
    ];
    const overallConfidence = fields.reduce((a, b) => a + b, 0) / fields.length;

    return {
      ...merged,
      unresolved_slots: unresolved,
      overallConfidence,
    };
  }

  /**
   * 获取系统默认值
   */
  private getSystemDefault<T>(field: string): InferredValue<T> {
    const defaults: Record<string, any> = {
      destination: { value: 'JP', confidence: 0.3, source: 'system_default' as const },
      days: { value: 7, confidence: 0.3, source: 'system_default' as const },
      date_range: { value: {}, confidence: 0.3, source: 'system_default' as const },
      transport: { value: 'transit', confidence: 0.3, source: 'system_default' as const },
      style: { value: 'balanced', confidence: 0.3, source: 'system_default' as const },
      intensity: { value: 'balanced', confidence: 0.3, source: 'system_default' as const },
    };
    return defaults[field];
  }

  /**
   * 识别未解决的槽位
   */
  private identifyUnresolvedSlots(result: InferenceResult): string[] {
    const unresolved: string[] = [];

    if (result.destination.confidence < 0.5) unresolved.push('destination');
    if (result.days.confidence < 0.5) unresolved.push('days');
    if (result.date_range.confidence < 0.5) unresolved.push('date_range');
    if (result.transport.confidence < 0.5) unresolved.push('transport');
    if (result.style.confidence < 0.5) unresolved.push('style');
    if (result.intensity.confidence < 0.5) unresolved.push('intensity');

    return unresolved;
  }

  /**
   * 计算整体置信度
   */
  private calculateOverallConfidence(result: InferenceResult): number {
    const fields = [
      result.destination.confidence,
      result.days.confidence,
      result.date_range.confidence,
      result.transport.confidence,
      result.style.confidence,
      result.intensity.confidence,
    ];

    return fields.reduce((a, b) => a + b, 0) / fields.length;
  }

  /**
   * 格式化已有信息
   */
  private formatExistingInfo(existing: Partial<InferenceResult>): string {
    const parts: string[] = [];

    if (existing.destination) {
      parts.push(`目的地: ${existing.destination.value} (置信度: ${existing.destination.confidence})`);
    }
    if (existing.days) {
      parts.push(`天数: ${existing.days.value} (置信度: ${existing.days.confidence})`);
    }
    if (existing.date_range) {
      parts.push(`日期: ${JSON.stringify(existing.date_range.value)} (置信度: ${existing.date_range.confidence})`);
    }
    if (existing.transport) {
      parts.push(`交通: ${existing.transport.value} (置信度: ${existing.transport.confidence})`);
    }
    if (existing.style) {
      parts.push(`风格: ${existing.style.value} (置信度: ${existing.style.confidence})`);
    }
    if (existing.intensity) {
      parts.push(`强度: ${existing.intensity.value} (置信度: ${existing.intensity.confidence})`);
    }

    return parts.length > 0 ? parts.join('\n') : '无';
  }
}
