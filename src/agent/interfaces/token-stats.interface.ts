// src/agent/interfaces/token-stats.interface.ts

/**
 * Token使用统计相关接口定义
 */

import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SubAgentType, OrchestrationStep } from './trip-plan.interface';

/**
 * LLM调用Token数据
 */
export interface LLMCallTokenData {
  // 请求信息
  request_id: string;
  trace_id: string;
  span_id: string;
  
  // Sub-Agent信息
  sub_agent: SubAgentType;
  state_machine_step: OrchestrationStep;
  task_type: string;
  
  // 提供商信息
  provider: LlmProvider;
  model: string; // 具体模型名称
  
  // Token使用
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  
  // 延迟
  duration_ms: number;
  
  // 状态
  success: boolean;
  error?: string;
  
  // 时间戳
  timestamp: string;
}

/**
 * Sub-Agent级别Token统计
 */
export interface SubAgentTokenStats {
  sub_agent: SubAgentType;
  
  // Token统计
  tokens: {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    avg_prompt_tokens: number;
    avg_completion_tokens: number;
    avg_total_tokens: number;
    max_tokens: number;
    min_tokens: number;
  };
  
  // 调用统计
  calls: {
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    success_rate: number;
  };
  
  // 延迟统计
  latency: {
    avg_latency_ms: number;
    p50_latency_ms: number;
    p90_latency_ms: number;
    p99_latency_ms: number;
    max_latency_ms: number;
  };
  
  // 时间范围
  time_range: {
    start_time: string;
    end_time: string;
    duration_hours: number;
  };
}

/**
 * 任务类型级别Token统计
 */
export interface TaskTypeTokenStats {
  task_type: string;
  state_machine_step: OrchestrationStep;
  
  // Token统计（同SubAgentTokenStats）
  tokens: {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    avg_prompt_tokens: number;
    avg_completion_tokens: number;
    avg_total_tokens: number;
    max_tokens: number;
    min_tokens: number;
  };
  
  // 调用统计
  calls: {
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    success_rate: number;
  };
  
  // 延迟统计
  latency: {
    avg_latency_ms: number;
    p50_latency_ms: number;
    p90_latency_ms: number;
    p99_latency_ms: number;
    max_latency_ms: number;
  };
  
  // 时间范围
  time_range: {
    start_time: string;
    end_time: string;
    duration_hours: number;
  };
}

/**
 * 时间序列Token统计
 */
export interface TimeSeriesTokenStats {
  time_bucket: string; // '2025-01-14T10:00:00Z'
  time_granularity: 'hour' | 'day' | 'week' | 'month';
  
  // Token统计
  tokens: {
    total_tokens: number;
    avg_tokens: number;
  };
  
  // 调用统计
  calls: {
    total_calls: number;
    successful_calls: number;
  };
  
  // 成本统计（如果已计算）
  cost?: {
    total_cost: number;
    avg_cost: number;
  };
}

/**
 * 提供商级别Token统计
 */
export interface ProviderTokenStats {
  provider: LlmProvider;
  
  // Token统计
  tokens: {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    avg_prompt_tokens: number;
    avg_completion_tokens: number;
    avg_total_tokens: number;
    max_tokens: number;
    min_tokens: number;
  };
  
  // 调用统计
  calls: {
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    success_rate: number;
  };
  
  // 延迟统计
  latency: {
    avg_latency_ms: number;
    p50_latency_ms: number;
    p90_latency_ms: number;
    p99_latency_ms: number;
    max_latency_ms: number;
  };
  
  // 成本统计（如果已计算）
  cost?: {
    total_cost: number;
    avg_cost_per_1k_tokens: number;
  };
  
  // 时间范围
  time_range: {
    start_time: string;
    end_time: string;
    duration_hours: number;
  };
}

/**
 * Token统计查询过滤器
 */
export interface TokenStatsFilters {
  sub_agent?: SubAgentType;
  task_type?: string;
  provider?: LlmProvider;
  start_time?: Date;
  end_time?: Date;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}
