// src/agent/infra/telemetry.service.ts
/**
 * TelemetryService - 调用链追踪与性能监控
 * 
 * V2.1 架构核心服务，职责：
 * - 跨服务链路追踪（traceId）
 * - 性能指标收集（延迟、Token 使用、工具调用）
 * - 预算追踪（allocated vs used）
 * - 失败分析
 * - SLA 监控
 * 
 * 架构位置：Agent Infra 层
 */

import { Injectable, Logger } from '@nestjs/common';

// ============== 类型定义 ==============

/**
 * Span 类型
 */
export type SpanType = 
  | 'agent_request'      // 智能体请求
  | 'core_action'        // 核心动作
  | 'sub_agent'          // 子智能体调用
  | 'llm_call'           // LLM 调用
  | 'tool_call'          // 工具调用
  | 'db_query'           // 数据库查询
  | 'external_api';      // 外部 API 调用

/**
 * Span 状态
 */
export type SpanStatus = 'started' | 'success' | 'error' | 'timeout' | 'cancelled';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  durationMs: number;
  llmTokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  toolCalls?: number;
  dbQueries?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

/**
 * 预算追踪
 */
export interface BudgetTracking {
  allocated: {
    durationMs: number;
    llmTokens: number;
    toolCalls: number;
  };
  used: {
    durationMs: number;
    llmTokens: number;
    toolCalls: number;
  };
  exceeded: boolean;
}

/**
 * Span 数据
 */
export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  
  type: SpanType;
  name: string;
  status: SpanStatus;
  
  // 时间
  startTime: string;
  endTime?: string;
  
  // 指标
  metrics?: PerformanceMetrics;
  budget?: BudgetTracking;
  
  // 状态追踪
  stateVersionBefore?: number;
  stateVersionAfter?: number;
  
  // 错误信息
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // 标签
  tags: Record<string, string>;
  
  // 子 Span
  children: Span[];
}

/**
 * Trace 汇总
 */
export interface TraceSummary {
  traceId: string;
  rootSpan: Span;
  
  // 汇总指标
  totalDurationMs: number;
  totalLlmTokens: number;
  totalToolCalls: number;
  totalDbQueries: number;
  
  // 状态
  overallStatus: SpanStatus;
  errorCount: number;
  
  // SLA
  slaBreached: boolean;
  slaTarget?: number;
}

/**
 * SLA 配置
 */
export interface SLAConfig {
  // 规划动作 SLA
  planning: {
    maxDurationMs: number;
    maxLlmTokens: number;
  };
  // 执行动作 SLA
  execution: {
    maxDurationMs: number;
    maxLlmTokens: number;
  };
  // 诊断动作 SLA
  diagnostic: {
    maxDurationMs: number;
    maxLlmTokens: number;
  };
}

// 默认 SLA 配置
const DEFAULT_SLA: SLAConfig = {
  planning: { maxDurationMs: 8000, maxLlmTokens: 4000 },
  execution: { maxDurationMs: 5000, maxLlmTokens: 2000 },
  diagnostic: { maxDurationMs: 2000, maxLlmTokens: 0 },
};

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  
  // 活跃 Trace 存储
  private activeTraces: Map<string, Span> = new Map();
  
  // Span 索引（spanId -> Span）
  private spanIndex: Map<string, Span> = new Map();
  
  // 已完成 Trace 历史（用于分析）
  private completedTraces: TraceSummary[] = [];
  
  // SLA 配置
  private slaConfig: SLAConfig = DEFAULT_SLA;
  
  // 统计数据
  private stats = {
    totalTraces: 0,
    successfulTraces: 0,
    failedTraces: 0,
    slaBreaches: 0,
    totalDurationMs: 0,
    totalLlmTokens: 0,
  };

  constructor() {
    this.logger.log('📊 TelemetryService 已初始化');
  }

  // ============== Trace 管理 ==============

  /**
   * 开始新的 Trace
   */
  startTrace(
    name: string,
    type: SpanType = 'agent_request',
    tags: Record<string, string> = {},
  ): string {
    const traceId = this.generateId('trace');
    const spanId = this.generateId('span');
    
    const rootSpan: Span = {
      spanId,
      traceId,
      type,
      name,
      status: 'started',
      startTime: new Date().toISOString(),
      tags: {
        ...tags,
        'trace.root': 'true',
      },
      children: [],
    };

    this.activeTraces.set(traceId, rootSpan);
    this.spanIndex.set(spanId, rootSpan);
    this.stats.totalTraces++;

    this.logger.debug(`[Telemetry] 开始 Trace: ${traceId} - ${name}`);

    return traceId;
  }

  /**
   * 结束 Trace
   */
  endTrace(
    traceId: string,
    status: SpanStatus = 'success',
    error?: { code: string; message: string; stack?: string },
  ): TraceSummary | null {
    const rootSpan = this.activeTraces.get(traceId);
    if (!rootSpan) {
      this.logger.warn(`[Telemetry] Trace 不存在: ${traceId}`);
      return null;
    }

    // 结束根 Span
    rootSpan.status = status;
    rootSpan.endTime = new Date().toISOString();
    rootSpan.error = error;

    // 计算指标
    const summary = this.calculateTraceSummary(rootSpan);
    
    // 更新统计
    if (status === 'success') {
      this.stats.successfulTraces++;
    } else {
      this.stats.failedTraces++;
    }
    this.stats.totalDurationMs += summary.totalDurationMs;
    this.stats.totalLlmTokens += summary.totalLlmTokens;
    
    if (summary.slaBreached) {
      this.stats.slaBreaches++;
    }

    // 保存到历史
    this.completedTraces.push(summary);
    if (this.completedTraces.length > 1000) {
      this.completedTraces.shift();
    }

    // 清理
    this.activeTraces.delete(traceId);
    this.cleanupSpanIndex(rootSpan);

    this.logger.debug(`[Telemetry] 结束 Trace: ${traceId} - ${status} - ${summary.totalDurationMs}ms`);

    return summary;
  }

  // ============== Span 管理 ==============

  /**
   * 开始新的 Span
   */
  startSpan(
    traceId: string,
    name: string,
    type: SpanType,
    parentSpanId?: string,
    tags: Record<string, string> = {},
  ): string {
    const rootSpan = this.activeTraces.get(traceId);
    if (!rootSpan) {
      this.logger.warn(`[Telemetry] Trace 不存在: ${traceId}`);
      return '';
    }

    const spanId = this.generateId('span');
    const span: Span = {
      spanId,
      traceId,
      parentSpanId: parentSpanId || rootSpan.spanId,
      type,
      name,
      status: 'started',
      startTime: new Date().toISOString(),
      tags,
      children: [],
    };

    // 添加到父 Span
    const parentSpan = parentSpanId ? this.spanIndex.get(parentSpanId) : rootSpan;
    if (parentSpan) {
      parentSpan.children.push(span);
    }

    this.spanIndex.set(spanId, span);

    return spanId;
  }

  /**
   * 结束 Span
   */
  endSpan(
    spanId: string,
    status: SpanStatus = 'success',
    metrics?: Partial<PerformanceMetrics>,
    error?: { code: string; message: string; stack?: string },
  ): void {
    const span = this.spanIndex.get(spanId);
    if (!span) {
      return;
    }

    span.status = status;
    span.endTime = new Date().toISOString();
    span.error = error;

    // 计算持续时间
    const startTime = new Date(span.startTime).getTime();
    const endTime = new Date(span.endTime).getTime();
    const durationMs = endTime - startTime;

    span.metrics = {
      durationMs,
      ...metrics,
    };
  }

  /**
   * 记录 LLM 调用
   */
  recordLlmCall(
    traceId: string,
    parentSpanId: string,
    provider: string,
    promptTokens: number,
    completionTokens: number,
    durationMs: number,
    success: boolean,
    error?: string,
  ): void {
    const spanId = this.startSpan(traceId, `llm:${provider}`, 'llm_call', parentSpanId, {
      'llm.provider': provider,
    });

    this.endSpan(spanId, success ? 'success' : 'error', {
      durationMs,
      llmTokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
    }, error ? { code: 'LLM_ERROR', message: error } : undefined);
  }

  /**
   * 记录工具调用
   */
  recordToolCall(
    traceId: string,
    parentSpanId: string,
    toolName: string,
    durationMs: number,
    success: boolean,
    error?: string,
  ): void {
    const spanId = this.startSpan(traceId, `tool:${toolName}`, 'tool_call', parentSpanId, {
      'tool.name': toolName,
    });

    this.endSpan(spanId, success ? 'success' : 'error', {
      durationMs,
      toolCalls: 1,
    }, error ? { code: 'TOOL_ERROR', message: error } : undefined);
  }

  /**
   * 记录状态版本
   */
  recordStateVersion(
    spanId: string,
    position: 'before' | 'after',
    version: number,
  ): void {
    const span = this.spanIndex.get(spanId);
    if (span) {
      if (position === 'before') {
        span.stateVersionBefore = version;
      } else {
        span.stateVersionAfter = version;
      }
    }
  }

  /**
   * 设置预算追踪
   */
  setBudget(
    spanId: string,
    allocated: { durationMs: number; llmTokens: number; toolCalls: number },
  ): void {
    const span = this.spanIndex.get(spanId);
    if (span) {
      span.budget = {
        allocated,
        used: { durationMs: 0, llmTokens: 0, toolCalls: 0 },
        exceeded: false,
      };
    }
  }

  /**
   * 更新预算使用
   */
  updateBudgetUsage(
    spanId: string,
    used: Partial<{ durationMs: number; llmTokens: number; toolCalls: number }>,
  ): void {
    const span = this.spanIndex.get(spanId);
    if (span?.budget) {
      if (used.durationMs !== undefined) span.budget.used.durationMs += used.durationMs;
      if (used.llmTokens !== undefined) span.budget.used.llmTokens += used.llmTokens;
      if (used.toolCalls !== undefined) span.budget.used.toolCalls += used.toolCalls;
      
      // 检查是否超出预算
      span.budget.exceeded = 
        span.budget.used.durationMs > span.budget.allocated.durationMs ||
        span.budget.used.llmTokens > span.budget.allocated.llmTokens ||
        span.budget.used.toolCalls > span.budget.allocated.toolCalls;
    }
  }

  // ============== 统计与分析 ==============

  /**
   * 获取统计数据
   */
  getStats() {
    return {
      ...this.stats,
      activeTraces: this.activeTraces.size,
      successRate: this.stats.totalTraces > 0
        ? ((this.stats.successfulTraces / this.stats.totalTraces) * 100).toFixed(2) + '%'
        : 'N/A',
      avgDurationMs: this.stats.successfulTraces > 0
        ? Math.round(this.stats.totalDurationMs / this.stats.successfulTraces)
        : 0,
      slaBreachRate: this.stats.totalTraces > 0
        ? ((this.stats.slaBreaches / this.stats.totalTraces) * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  /**
   * 获取最近的 Trace
   */
  getRecentTraces(limit = 10): TraceSummary[] {
    return this.completedTraces.slice(-limit);
  }

  /**
   * 获取 Trace 详情
   */
  getTraceDetail(traceId: string): Span | null {
    return this.activeTraces.get(traceId) || null;
  }

  // ============== 私有方法 ==============

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateTraceSummary(rootSpan: Span): TraceSummary {
    const { totalTokens, totalTools, totalDb, errorCount } =
      this.aggregateMetrics(rootSpan);

    const startTime = new Date(rootSpan.startTime).getTime();
    const endTime = rootSpan.endTime ? new Date(rootSpan.endTime).getTime() : Date.now();
    const totalDurationMs = endTime - startTime;

    // SLA 检查
    const slaTarget = this.getSLATarget(rootSpan.type);
    const slaBreached = totalDurationMs > slaTarget;

    return {
      traceId: rootSpan.traceId,
      rootSpan,
      totalDurationMs,
      totalLlmTokens: totalTokens,
      totalToolCalls: totalTools,
      totalDbQueries: totalDb,
      overallStatus: rootSpan.status,
      errorCount,
      slaBreached,
      slaTarget,
    };
  }

  private aggregateMetrics(span: Span): {
    totalDuration: number;
    totalTokens: number;
    totalTools: number;
    totalDb: number;
    errorCount: number;
  } {
    const totalDuration = span.metrics?.durationMs || 0;
    let totalTokens = span.metrics?.llmTokens?.total || 0;
    let totalTools = span.metrics?.toolCalls || 0;
    let totalDb = span.metrics?.dbQueries || 0;
    let errorCount = span.status === 'error' ? 1 : 0;

    for (const child of span.children) {
      const childMetrics = this.aggregateMetrics(child);
      totalTokens += childMetrics.totalTokens;
      totalTools += childMetrics.totalTools;
      totalDb += childMetrics.totalDb;
      errorCount += childMetrics.errorCount;
    }

    return { totalDuration, totalTokens, totalTools, totalDb, errorCount };
  }

  private getSLATarget(type: SpanType): number {
    switch (type) {
      case 'core_action':
        return this.slaConfig.planning.maxDurationMs;
      case 'agent_request':
        return this.slaConfig.execution.maxDurationMs;
      default:
        return this.slaConfig.diagnostic.maxDurationMs;
    }
  }

  private cleanupSpanIndex(span: Span): void {
    this.spanIndex.delete(span.spanId);
    for (const child of span.children) {
      this.cleanupSpanIndex(child);
    }
  }
}
