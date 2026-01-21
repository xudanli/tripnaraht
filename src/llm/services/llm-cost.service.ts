// src/llm/services/llm-cost.service.ts

/**
 * LLM 成本计算服务
 * 
 * 职责：
 * - 计算 LLM 调用的实际成本
 * - 提供成本统计和聚合
 * - 支持按维度（Sub-Agent、Provider、时间）统计成本
 */

import { Injectable, Logger } from '@nestjs/common';
import { TokenStatsService } from '../../agent/services/token-stats.service';
import { LlmProvider } from '../dto/llm-request.dto';
import { SubAgentType } from '../../agent/interfaces/trip-plan.interface';

/**
 * 定价配置（每 1K tokens，单位：美元）
 */
interface PricingConfig {
  provider: LlmProvider;
  model: string;
  promptTokensPer1k: number;
  completionTokensPer1k: number;
}

/**
 * 默认定价配置（2025年1月）
 */
const DEFAULT_PRICING_CONFIG: PricingConfig[] = [
  // OpenAI
  {
    provider: LlmProvider.OPENAI,
    model: 'gpt-4-turbo',
    promptTokensPer1k: 0.01,
    completionTokensPer1k: 0.03,
  },
  {
    provider: LlmProvider.OPENAI,
    model: 'gpt-4o',
    promptTokensPer1k: 0.005,
    completionTokensPer1k: 0.015,
  },
  {
    provider: LlmProvider.OPENAI,
    model: 'gpt-4o-mini',
    promptTokensPer1k: 0.00015,
    completionTokensPer1k: 0.0006,
  },
  {
    provider: LlmProvider.OPENAI,
    model: 'gpt-3.5-turbo',
    promptTokensPer1k: 0.0005,
    completionTokensPer1k: 0.0015,
  },
  // Anthropic
  {
    provider: LlmProvider.ANTHROPIC,
    model: 'claude-3-opus-20240229',
    promptTokensPer1k: 0.015,
    completionTokensPer1k: 0.075,
  },
  {
    provider: LlmProvider.ANTHROPIC,
    model: 'claude-3-sonnet-20240229',
    promptTokensPer1k: 0.003,
    completionTokensPer1k: 0.015,
  },
  {
    provider: LlmProvider.ANTHROPIC,
    model: 'claude-3-haiku-20240307',
    promptTokensPer1k: 0.00025,
    completionTokensPer1k: 0.00125,
  },
  // DeepSeek
  {
    provider: LlmProvider.DEEPSEEK,
    model: 'deepseek-chat',
    promptTokensPer1k: 0.00014,
    completionTokensPer1k: 0.00028,
  },
  {
    provider: LlmProvider.DEEPSEEK,
    model: 'deepseek-coder',
    promptTokensPer1k: 0.00014,
    completionTokensPer1k: 0.00028,
  },
  // Google (Gemini)
  {
    provider: LlmProvider.GEMINI,
    model: 'gemini-pro',
    promptTokensPer1k: 0.0005,
    completionTokensPer1k: 0.0015,
  },
  {
    provider: LlmProvider.GEMINI,
    model: 'gemini-pro-vision',
    promptTokensPer1k: 0.0005,
    completionTokensPer1k: 0.0015,
  },
];

@Injectable()
export class LlmCostService {
  private readonly logger = new Logger(LlmCostService.name);

  constructor(private readonly tokenStatsService: TokenStatsService) {}

  /**
   * 获取定价配置
   */
  private getPricingConfig(provider: LlmProvider, model: string): PricingConfig | null {
    // 精确匹配
    const exactMatch = DEFAULT_PRICING_CONFIG.find(
      (p) => p.provider === provider && p.model === model,
    );
    if (exactMatch) {
      return exactMatch;
    }

    // 按提供商匹配（使用第一个匹配的模型）
    const providerMatch = DEFAULT_PRICING_CONFIG.find((p) => p.provider === provider);
    if (providerMatch) {
      this.logger.warn(
        `未找到精确的定价配置: provider=${provider}, model=${model}，使用提供商默认配置`,
      );
      return providerMatch;
    }

    // 使用 DeepSeek 作为默认（最便宜的）
    const defaultConfig = DEFAULT_PRICING_CONFIG.find((p) => p.provider === LlmProvider.DEEPSEEK);
    this.logger.warn(
      `未找到定价配置: provider=${provider}, model=${model}，使用默认配置（DeepSeek）`,
    );
    return defaultConfig || null;
  }

  /**
   * 计算单次调用的成本
   */
  calculateCost(
    provider: LlmProvider,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    const pricing = this.getPricingConfig(provider, model);
    if (!pricing) {
      return 0;
    }

    const promptCost = (promptTokens / 1000) * pricing.promptTokensPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionTokensPer1k;

    return promptCost + completionCost;
  }

  /**
   * 获取成本统计
   */
  async getCostStats(options: {
    subAgent?: SubAgentType;
    provider?: LlmProvider;
    timeRange?: { start: Date; end: Date };
  }): Promise<{
    totalCost: number;
    currency: string;
    byProvider?: Record<string, number>;
    bySubAgent?: Record<string, number>;
    timeRange?: { start: string; end: string };
    breakdown: Array<{
      provider: string;
      model: string;
      calls: number;
      tokens: number;
      cost: number;
    }>;
  }> {
    const allRecords = this.tokenStatsService.getAllRecords();
    let filteredRecords = allRecords;

    // 按时间范围过滤
    if (options.timeRange) {
      filteredRecords = filteredRecords.filter(
        (r) =>
          new Date(r.timestamp) >= options.timeRange!.start &&
          new Date(r.timestamp) <= options.timeRange!.end,
      );
    }

    // 按 Sub-Agent 过滤
    if (options.subAgent) {
      filteredRecords = filteredRecords.filter((r) => r.sub_agent === options.subAgent);
    }

    // 按 Provider 过滤
    if (options.provider) {
      filteredRecords = filteredRecords.filter((r) => r.provider === options.provider);
    }

    // 计算成本
    let totalCost = 0;
    const byProvider: Record<string, number> = {};
    const bySubAgent: Record<string, number> = {};
    const breakdownMap: Record<string, { provider: string; model: string; calls: number; tokens: number; cost: number }> = {};

    for (const record of filteredRecords) {
      const cost = this.calculateCost(
        record.provider,
        record.model || 'unknown',
        record.prompt_tokens,
        record.completion_tokens,
      );

      totalCost += cost;

      // 按提供商聚合
      const providerKey = record.provider;
      byProvider[providerKey] = (byProvider[providerKey] || 0) + cost;

      // 按 Sub-Agent 聚合
      const subAgentKey = record.sub_agent;
      bySubAgent[subAgentKey] = (bySubAgent[subAgentKey] || 0) + cost;

      // 按 Provider+Model 聚合（用于 breakdown）
      const breakdownKey = `${record.provider}:${record.model || 'unknown'}`;
      if (!breakdownMap[breakdownKey]) {
        breakdownMap[breakdownKey] = {
          provider: record.provider,
          model: record.model || 'unknown',
          calls: 0,
          tokens: 0,
          cost: 0,
        };
      }
      breakdownMap[breakdownKey].calls += 1;
      breakdownMap[breakdownKey].tokens += record.total_tokens;
      breakdownMap[breakdownKey].cost += cost;
    }

    const breakdown = Object.values(breakdownMap);

    const result: any = {
      totalCost: parseFloat(totalCost.toFixed(6)),
      currency: 'USD',
      breakdown,
    };

    if (Object.keys(byProvider).length > 0) {
      result.byProvider = byProvider;
    }

    if (Object.keys(bySubAgent).length > 0) {
      result.bySubAgent = bySubAgent;
    }

    if (options.timeRange) {
      result.timeRange = {
        start: options.timeRange.start.toISOString(),
        end: options.timeRange.end.toISOString(),
      };
    }

    return result;
  }
}
