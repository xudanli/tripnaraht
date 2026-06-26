/**
 * LLM调用链埋点服务
 * 用于监控和优化LLM调用性能
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

export interface LLMCallTrace {
  traceId: string;
  provider: LlmProvider;
  prompt: string;
  promptLength: number;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  cacheHit: boolean;
  context: {
    component: string;
    operation: string;
    metadata?: Record<string, any>;
  };
}

export interface LLMCallMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  cacheHits: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  byComponent: Record<string, {
    count: number;
    avgDuration: number;
  }>;
}

@Injectable()
export class LLMTraceService {
  private readonly logger = new Logger(LLMTraceService.name);
  private traces: LLMCallTrace[] = [];
  private readonly MAX_TRACES = 1000; // 内存中保留最近1000条

  /**
   * 记录LLM调用开始
   */
  startTrace(
    provider: LlmProvider,
    prompt: string,
    context: { component: string; operation: string; metadata?: Record<string, any> },
    cacheHit: boolean = false,
  ): string {
    const traceId = this.generateTraceId();
    const trace: LLMCallTrace = {
      traceId,
      provider,
      prompt: this.truncatePrompt(prompt),
      promptLength: prompt.length,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      success: false,
      cacheHit,
      context,
    };
    this.traces.push(trace);

    // 保持内存限制
    if (this.traces.length > this.MAX_TRACES) {
      this.traces.shift();
    }

    return traceId;
  }

  /**
   * 记录LLM调用结束
   */
  endTrace(traceId: string, success: boolean, error?: string): void {
    const trace = this.traces.find(t => t.traceId === traceId);
    if (!trace) {
      this.logger.warn(`Trace not found: ${traceId}`);
      return;
    }

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.success = success;
    trace.error = error;

    // 记录慢调用
    if (trace.duration > 3000) {
      this.logger.warn(
        `Slow LLM call: ${trace.context.component}.${trace.context.operation} took ${trace.duration}ms`,
      );
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): LLMCallMetrics {
    if (this.traces.length === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        cacheHits: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        byComponent: {},
      };
    }

    const successful = this.traces.filter(t => t.success);
    const durations = successful.map(t => t.duration).sort((a, b) => a - b);

    const byComponent: Record<string, { count: number; avgDuration: number }> = {};
    for (const trace of this.traces) {
      const key = `${trace.context.component}.${trace.context.operation}`;
      if (!byComponent[key]) {
        byComponent[key] = { count: 0, avgDuration: 0 };
      }
      byComponent[key].count++;
      byComponent[key].avgDuration += trace.duration;
    }

    for (const key in byComponent) {
      byComponent[key].avgDuration /= byComponent[key].count;
    }

    return {
      totalCalls: this.traces.length,
      successfulCalls: successful.length,
      failedCalls: this.traces.length - successful.length,
      cacheHits: this.traces.filter(t => t.cacheHit).length,
      averageDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
      byComponent,
    };
  }

  /**
   * 获取最近的调用记录
   */
  getRecentTraces(limit: number = 50): LLMCallTrace[] {
    return this.traces.slice(-limit);
  }

  /**
   * 清空追踪记录
   */
  clearTraces(): void {
    this.traces = [];
  }

  private generateTraceId(): string {
    return `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private truncatePrompt(prompt: string, maxLength: number = 500): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}
