// src/agent/utils/agent-metrics.util.ts

function skipMetricsConsole(): boolean {
  return process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
}

/**
 * Agent API Metrics 定义
 * 
 * 用于监控和观察智能体统一入口的使用情况
 */

/**
 * 入口来源类型
 */
export type EntryPoint = 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';

/**
 * 重定向原因类型
 */
export type RedirectReason = 
  | 'READONLY_MODE_RESTRICTION'
  | 'PLANNING_REQUEST_DETECTED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'FEATURE_MIGRATED'
  | 'MISSING_TRIP_ID';

/**
 * Metrics 定义
 */
export const AgentMetrics = {
  /**
   * 入口来源分布
   * 
   * 指标名：agent_entry_point_distribution
   * 标签：entry_point
   */
  entryPointDistribution: {
    name: 'agent_entry_point_distribution',
    labels: ['entry_point'] as const,
    description: '不同入口来源的请求分布',
  },

  /**
   * 只读模式使用率
   * 
   * 指标名：agent_readonly_mode_usage_rate
   */
  readonlyModeUsage: {
    name: 'agent_readonly_mode_usage_rate',
    description: '只读模式使用率',
  },

  /**
   * 重定向触发率
   * 
   * 指标名：agent_redirect_trigger_rate
   * 标签：redirect_reason, entry_point
   */
  redirectTriggerRate: {
    name: 'agent_redirect_trigger_rate',
    labels: ['redirect_reason', 'entry_point'] as const,
    description: '重定向触发率',
  },

  /**
   * 澄清消息触发率
   * 
   * 指标名：agent_clarification_trigger_rate
   * 标签：error_type
   */
  clarificationTriggerRate: {
    name: 'agent_clarification_trigger_rate',
    labels: ['error_type'] as const,
    description: '澄清消息触发率',
  },

  /**
   * 决策日志完整性
   * 
   * 指标名：agent_decision_log_completeness
   */
  decisionLogCompleteness: {
    name: 'agent_decision_log_completeness',
    description: '决策日志完整性（包含 evidence_refs 的占比）',
  },

  /**
   * 编排模式分布
   * 
   * 指标名：agent_orchestration_mode_distribution
   * 标签：mode (LEGACY | CLAUDE_DYNAMIC | CLAUDE_SM)
   */
  orchestrationModeDistribution: {
    name: 'agent_orchestration_mode_distribution',
    labels: ['mode'] as const,
    description: '编排模式分布',
  },

  /**
   * 风险级别分布
   * 
   * 指标名：agent_risk_distribution
   * 标签：risk (LOW | MEDIUM | HIGH | CRITICAL)
   */
  riskDistribution: {
    name: 'agent_risk_distribution',
    labels: ['risk'] as const,
    description: '风险级别分布',
  },
} as const;

/**
 * 从 Trace 信息中提取 Metrics
 */
export interface TraceMetrics {
  entry_point?: EntryPoint;
  readonly_mode?: boolean;
  redirect_reason?: RedirectReason;
  error_type?: string;
  orchestration_mode?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
  risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  decision_log_completeness?: number; // 0-1，包含 evidence_refs 的决策日志占比
}

/**
 * 从响应中提取 Metrics
 */
export function extractMetricsFromResponse(response: any): TraceMetrics {
  const metrics: TraceMetrics = {};

  // 从 trace 中提取
  if (response.observability?.trace) {
    const trace = response.observability.trace;
    
    // 入口来源（从 flags.options 中提取）
    if (trace.orchestration?.flags?.options?.entry_point) {
      metrics.entry_point = trace.orchestration.flags.options.entry_point;
    }
    
    // 只读模式
    if (trace.orchestration?.flags?.options?.readonly_mode !== undefined) {
      metrics.readonly_mode = trace.orchestration.flags.options.readonly_mode;
    }
    
    // 编排模式
    if (trace.orchestration_mode) {
      metrics.orchestration_mode = trace.orchestration_mode;
    }
    
    // 风险级别
    if (trace.risk) {
      metrics.risk = trace.risk;
    }
  }

  // 从 result 中提取重定向原因
  if (response.result?.status === 'REDIRECT_REQUIRED' && response.result?.payload?.redirectInfo) {
    metrics.redirect_reason = response.result.payload.redirectInfo.redirect_reason as RedirectReason;
  }

  // 从 payload 中提取错误类型
  if (response.result?.payload?.errorType) {
    metrics.error_type = response.result.payload.errorType;
  }

  // 计算决策日志完整性
  if (response.explain?.decision_log) {
    const decisionLog = response.explain.decision_log;
    const withEvidence = decisionLog.filter((entry: any) => 
      entry.evidence_refs && entry.evidence_refs.length > 0
    ).length;
    metrics.decision_log_completeness = decisionLog.length > 0 
      ? withEvidence / decisionLog.length 
      : 0;
  }

  return metrics;
}

/**
 * 记录 Metrics（示例实现）
 * 
 * 实际使用时，应该接入 Prometheus/DataDog 等监控系统
 */
export class MetricsRecorder {
  /**
   * 记录入口来源分布
   */
  static recordEntryPoint(entryPoint: EntryPoint | undefined) {
    if (!entryPoint) return;
    
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordCounter(AgentMetrics.entryPointDistribution.name, {
    //   entry_point: entryPoint,
    // });

    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.entryPointDistribution.name}: ${entryPoint}`);
    }
  }

  /**
   * 记录只读模式使用
   */
  static recordReadonlyMode(readonlyMode: boolean) {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordGauge(AgentMetrics.readonlyModeUsage.name, readonlyMode ? 1 : 0);

    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.readonlyModeUsage.name}: ${readonlyMode}`);
    }
  }

  /**
   * 记录重定向触发
   */
  static recordRedirect(redirectReason: RedirectReason, entryPoint?: EntryPoint) {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordCounter(AgentMetrics.redirectTriggerRate.name, {
    //   redirect_reason: redirectReason,
    //   entry_point: entryPoint || 'unknown',
    // });

    if (!skipMetricsConsole()) {
      console.log(
        `[Metrics] ${AgentMetrics.redirectTriggerRate.name}: ${redirectReason} (entry_point: ${entryPoint})`,
      );
    }
  }

  /**
   * 记录澄清消息触发
   */
  static recordClarification(errorType: string) {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordCounter(AgentMetrics.clarificationTriggerRate.name, {
    //   error_type: errorType,
    // });
    
    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.clarificationTriggerRate.name}: ${errorType}`);
    }
  }

  /**
   * 记录决策日志完整性
   */
  static recordDecisionLogCompleteness(completeness: number) {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordGauge(AgentMetrics.decisionLogCompleteness.name, completeness);
    
    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.decisionLogCompleteness.name}: ${completeness}`);
    }
  }

  /**
   * 记录编排模式分布
   */
  static recordOrchestrationMode(mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM') {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordCounter(AgentMetrics.orchestrationModeDistribution.name, {
    //   mode: mode,
    // });
    
    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.orchestrationModeDistribution.name}: ${mode}`);
    }
  }

  /**
   * 记录风险级别分布
   */
  static recordRisk(risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
    // TODO: 接入实际的 Metrics 系统
    // prometheus.recordCounter(AgentMetrics.riskDistribution.name, {
    //   risk: risk,
    // });
    
    if (!skipMetricsConsole()) {
      console.log(`[Metrics] ${AgentMetrics.riskDistribution.name}: ${risk}`);
    }
  }
}
