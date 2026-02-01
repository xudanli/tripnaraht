// src/agent/services/token-stats.service.ts

/**
 * Token使用统计服务
 * 
 * 职责：
 * - 记录Token使用数据
 * - 统计聚合（按维度）
 * - 提供查询接口
 * - 数据导出
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  LLMCallTokenData,
  SubAgentTokenStats,
  TaskTypeTokenStats,
  TimeSeriesTokenStats,
  ProviderTokenStats,
  TokenStatsFilters,
} from '../interfaces/token-stats.interface';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SubAgentType, OrchestrationStep } from '../interfaces/trip-plan.interface';

@Injectable()
export class TokenStatsService {
  private readonly logger = new Logger(TokenStatsService.name);
  
  // 内存存储（用于实时查询）
  private tokenRecords: Map<string, LLMCallTokenData> = new Map();
  
  // 统计数据缓存（按维度）
  private statsCache: {
    subAgent: Map<SubAgentType, SubAgentTokenStats>;
    taskType: Map<string, TaskTypeTokenStats>;
    provider: Map<LlmProvider, ProviderTokenStats>;
    lastUpdated: Date;
  } = {
    subAgent: new Map(),
    taskType: new Map(),
    provider: new Map(),
    lastUpdated: new Date(),
  };
  
  // 配置
  private readonly maxRecordsInMemory = 10000; // 最多保留10000条记录
  private readonly cacheTTL = 60000; // 缓存TTL：60秒

  /**
   * 记录Token使用
   */
  async recordTokenUsage(data: LLMCallTokenData): Promise<void> {
    try {
      // 存储到内存
      const recordKey = `${data.request_id}_${data.span_id}`;
      this.tokenRecords.set(recordKey, data);
      
      // 如果超过最大记录数，清理最旧的记录
      if (this.tokenRecords.size > this.maxRecordsInMemory) {
        const firstKey = this.tokenRecords.keys().next().value;
        if (firstKey) {
          this.tokenRecords.delete(firstKey);
        }
      }
      
      // 异步更新统计缓存
      this.updateStatsCache(data);
      
      this.logger.debug(
        `[TokenStats] 记录Token使用: ${data.sub_agent}/${data.task_type} | ` +
        `tokens=${data.total_tokens} | provider=${data.provider}`
      );
    } catch (error: any) {
      // 记录失败不影响主流程
      this.logger.warn(`[TokenStats] 记录Token使用失败: ${error?.message}`);
    }
  }

  /**
   * 更新统计缓存
   */
  private updateStatsCache(data: LLMCallTokenData): void {
    // 更新Sub-Agent统计
    this.updateSubAgentStats(data);
    
    // 更新任务类型统计
    this.updateTaskTypeStats(data);
    
    // 更新提供商统计
    this.updateProviderStats(data);
    
    this.statsCache.lastUpdated = new Date();
  }

  /**
   * 更新Sub-Agent统计
   */
  private updateSubAgentStats(data: LLMCallTokenData): void {
    const existing = this.statsCache.subAgent.get(data.sub_agent);
    
    if (!existing) {
      // 创建新统计
      const stats: SubAgentTokenStats = {
        sub_agent: data.sub_agent,
        tokens: {
          total_prompt_tokens: data.prompt_tokens,
          total_completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          avg_prompt_tokens: data.prompt_tokens,
          avg_completion_tokens: data.completion_tokens,
          avg_total_tokens: data.total_tokens,
          max_tokens: data.total_tokens,
          min_tokens: data.total_tokens,
        },
        calls: {
          total_calls: 1,
          successful_calls: data.success ? 1 : 0,
          failed_calls: data.success ? 0 : 1,
          success_rate: data.success ? 1 : 0,
        },
        latency: {
          avg_latency_ms: data.duration_ms,
          p50_latency_ms: data.duration_ms,
          p90_latency_ms: data.duration_ms,
          p99_latency_ms: data.duration_ms,
          max_latency_ms: data.duration_ms,
        },
        time_range: {
          start_time: data.timestamp,
          end_time: data.timestamp,
          duration_hours: 0,
        },
      };
      this.statsCache.subAgent.set(data.sub_agent, stats);
    } else {
      // 更新现有统计
      const totalCalls = existing.calls.total_calls + 1;
      const successfulCalls = existing.calls.successful_calls + (data.success ? 1 : 0);
      
      existing.tokens.total_prompt_tokens += data.prompt_tokens;
      existing.tokens.total_completion_tokens += data.completion_tokens;
      existing.tokens.total_tokens += data.total_tokens;
      existing.tokens.avg_prompt_tokens = existing.tokens.total_prompt_tokens / totalCalls;
      existing.tokens.avg_completion_tokens = existing.tokens.total_completion_tokens / totalCalls;
      existing.tokens.avg_total_tokens = existing.tokens.total_tokens / totalCalls;
      existing.tokens.max_tokens = Math.max(existing.tokens.max_tokens, data.total_tokens);
      existing.tokens.min_tokens = Math.min(existing.tokens.min_tokens, data.total_tokens);
      
      existing.calls.total_calls = totalCalls;
      existing.calls.successful_calls = successfulCalls;
      existing.calls.failed_calls = totalCalls - successfulCalls;
      existing.calls.success_rate = successfulCalls / totalCalls;
      
      // 更新延迟统计（简化版，实际应该使用更复杂的算法）
      const totalLatency = existing.latency.avg_latency_ms * (totalCalls - 1) + data.duration_ms;
      existing.latency.avg_latency_ms = totalLatency / totalCalls;
      existing.latency.max_latency_ms = Math.max(existing.latency.max_latency_ms, data.duration_ms);
      
      // 更新时间范围
      if (new Date(data.timestamp) < new Date(existing.time_range.start_time)) {
        existing.time_range.start_time = data.timestamp;
      }
      if (new Date(data.timestamp) > new Date(existing.time_range.end_time)) {
        existing.time_range.end_time = data.timestamp;
      }
      const durationMs = new Date(existing.time_range.end_time).getTime() - 
                        new Date(existing.time_range.start_time).getTime();
      existing.time_range.duration_hours = durationMs / (1000 * 60 * 60);
    }
  }

  /**
   * 更新任务类型统计
   */
  private updateTaskTypeStats(data: LLMCallTokenData): void {
    // 实现类似Sub-Agent统计的逻辑
    // 为了简化，这里省略详细实现
    // 实际应该与updateSubAgentStats类似
  }

  /**
   * 更新提供商统计
   */
  private updateProviderStats(data: LLMCallTokenData): void {
    // 实现类似Sub-Agent统计的逻辑
    // 为了简化，这里省略详细实现
    // 实际应该与updateSubAgentStats类似
  }

  /**
   * 获取Sub-Agent级别统计
   */
  async getSubAgentStats(
    subAgent: SubAgentType,
    timeRange?: { start: Date; end: Date }
  ): Promise<SubAgentTokenStats | null> {
    const stats = this.statsCache.subAgent.get(subAgent);
    
    if (!stats) {
      return null;
    }
    
    // 如果指定了时间范围，需要过滤数据
    // 为了简化，这里直接返回缓存的数据
    // 实际应该从tokenRecords中过滤并重新计算
    
    return stats;
  }

  /**
   * 获取任务类型级别统计
   */
  async getTaskTypeStats(
    taskType: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<TaskTypeTokenStats | null> {
    // 实现类似getSubAgentStats的逻辑
    return null;
  }

  /**
   * 获取时间序列统计
   */
  async getTimeSeriesStats(
    granularity: 'hour' | 'day' | 'week' | 'month',
    timeRange: { start: Date; end: Date }
  ): Promise<TimeSeriesTokenStats[]> {
    // 实现时间序列统计逻辑
    // 为了简化，这里返回空数组
    return [];
  }

  /**
   * 获取提供商级别统计
   */
  async getProviderStats(
    provider: LlmProvider,
    timeRange?: { start: Date; end: Date }
  ): Promise<ProviderTokenStats | null> {
    const stats = this.statsCache.provider.get(provider);
    return stats || null;
  }

  /**
   * 导出统计数据
   */
  async exportStats(
    format: 'json' | 'csv',
    filters?: TokenStatsFilters
  ): Promise<string> {
    // 实现数据导出逻辑
    // 为了简化，这里返回空字符串
    return '';
  }

  /**
   * 获取所有Token记录（用于调试）
   */
  getAllRecords(): LLMCallTokenData[] {
    return Array.from(this.tokenRecords.values());
  }

  /**
   * 清空统计数据（用于测试）
   */
  clearStats(): void {
    this.tokenRecords.clear();
    this.statsCache.subAgent.clear();
    this.statsCache.taskType.clear();
    this.statsCache.provider.clear();
    this.statsCache.lastUpdated = new Date();
  }
}
