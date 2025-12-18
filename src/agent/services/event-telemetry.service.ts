// src/agent/services/event-telemetry.service.ts
import { Injectable, Logger } from '@nestjs/common';

/**
 * Agent 事件类型
 */
export enum AgentEventType {
  ROUTER_DECISION = 'router_decision',
  SYSTEM2_STEP = 'system2_step',
  CRITIC_RESULT = 'critic_result',
  WEBBROWSE_BLOCKED = 'webbrowse_blocked',
  FALLBACK_TRIGGERED = 'fallback_triggered',
  AGENT_COMPLETE = 'agent_complete',
}

/**
 * 事件数据接口
 */
export interface AgentEvent {
  type: AgentEventType;
  request_id: string;
  timestamp: number;
  data: Record<string, any>;
  metadata?: {
    route?: string;
    step?: number;
    latency_ms?: number;
    [key: string]: any;
  };
}

/**
 * Event Telemetry Service
 * 
 * 用于记录和追踪 Agent 的关键事件
 * 
 * 当前实现：记录到日志
 * 未来扩展：可以集成 Prometheus、DataDog 等监控系统
 */
@Injectable()
export class EventTelemetryService {
  private readonly logger = new Logger(EventTelemetryService.name);
  
  // 内存存储（用于调试和测试，生产环境建议使用外部存储）
  private readonly events: AgentEvent[] = [];
  private readonly maxEventsInMemory = 1000;

  /**
   * 记录事件
   */
  recordEvent(event: Omit<AgentEvent, 'timestamp'>): void {
    const fullEvent: AgentEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // 添加到内存存储（限制大小）
    this.events.push(fullEvent);
    if (this.events.length > this.maxEventsInMemory) {
      this.events.shift();
    }

    // 记录到日志
    this.logger.log(`[EVENT] ${event.type} - request_id: ${event.request_id}`, {
      type: event.type,
      request_id: event.request_id,
      data: event.data,
      metadata: event.metadata,
    });

    // TODO: 未来可以在这里发送到监控系统
    // await this.sendToMonitoringSystem(fullEvent);
  }

  /**
   * 记录 Router 决策事件
   */
  recordRouterDecision(
    requestId: string,
    route: string,
    confidence: number,
    reasons: string[],
    latencyMs: number,
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.ROUTER_DECISION,
      request_id: requestId,
      data: {
        route,
        confidence,
        reasons,
        ...additionalData,
      },
      metadata: {
        route,
        latency_ms: latencyMs,
      },
    });
  }

  /**
   * 记录 System2 步骤事件
   */
  recordSystem2Step(
    requestId: string,
    step: number,
    action: string,
    result: any,
    latencyMs?: number,
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.SYSTEM2_STEP,
      request_id: requestId,
      data: {
        step,
        action,
        result,
        ...additionalData,
      },
      metadata: {
        step,
        latency_ms: latencyMs,
      },
    });
  }

  /**
   * 记录 Critic 结果事件
   */
  recordCriticResult(
    requestId: string,
    violations: string[],
    passed: boolean,
    repairActions?: string[],
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.CRITIC_RESULT,
      request_id: requestId,
      data: {
        violations,
        passed,
        repair_actions: repairActions || [],
        ...additionalData,
      },
    });
  }

  /**
   * 记录 WebBrowse 被阻止事件
   */
  recordWebbrowseBlocked(
    requestId: string,
    reason: string,
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.WEBBROWSE_BLOCKED,
      request_id: requestId,
      data: {
        reason,
        ...additionalData,
      },
    });
  }

  /**
   * 记录 Fallback 触发事件
   */
  recordFallbackTriggered(
    requestId: string,
    originalRoute: string,
    fallbackRoute: string,
    reason: string,
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.FALLBACK_TRIGGERED,
      request_id: requestId,
      data: {
        original_route: originalRoute,
        fallback_route: fallbackRoute,
        reason,
        ...additionalData,
      },
    });
  }

  /**
   * 记录 Agent 完成事件
   */
  recordAgentComplete(
    requestId: string,
    status: string,
    latencyMs: number,
    tokenCount?: number,
    costUsd?: number,
    additionalData?: Record<string, any>
  ): void {
    this.recordEvent({
      type: AgentEventType.AGENT_COMPLETE,
      request_id: requestId,
      data: {
        status,
        latency_ms: latencyMs,
        tokens_est: tokenCount,
        cost_est_usd: costUsd,
        ...additionalData,
      },
      metadata: {
        latency_ms: latencyMs,
      },
    });
  }

  /**
   * 获取事件列表（用于调试和测试）
   */
  getEvents(requestId?: string, eventType?: AgentEventType): AgentEvent[] {
    let filtered = this.events;

    if (requestId) {
      filtered = filtered.filter(e => e.request_id === requestId);
    }

    if (eventType) {
      filtered = filtered.filter(e => e.type === eventType);
    }

    return filtered;
  }

  /**
   * 清空事件（用于测试）
   */
  clearEvents(): void {
    this.events.length = 0;
  }

  /**
   * 获取事件统计
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    byRequest: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byRequest: Record<string, number> = {};

    for (const event of this.events) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      byRequest[event.request_id] = (byRequest[event.request_id] || 0) + 1;
    }

    return {
      total: this.events.length,
      byType,
      byRequest,
    };
  }

  /**
   * 未来扩展：发送到监控系统
   * 
   * 可以集成：
   * - Prometheus: 使用 Counter/Histogram metrics
   * - DataDog: 使用 StatsD 客户端
   * - CloudWatch: 使用 AWS SDK
   * - 自定义 API: 发送到内部监控服务
   */
  // private async sendToMonitoringSystem(event: AgentEvent): Promise<void> {
  //   // 示例：发送到 Prometheus
  //   // this.prometheusClient.counter('agent_event_total').inc({
  //   //   type: event.type,
  //   //   route: event.metadata?.route || 'unknown',
  //   // });
  //   
  //   // 示例：发送到 DataDog
  //   // this.datadogClient.increment('agent.event', 1, {
  //   //   type: event.type,
  //   //   request_id: event.request_id,
  //   // });
  // }
}

