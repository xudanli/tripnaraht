// src/decision-draft/services/decision-draft-observability.service.ts

/**
 * Decision Draft Observability Service
 * 
 * P1: 实现 Trace 记录和 Metrics 计算
 * 用于可观测性和性能分析
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionDraft,
  LLMCall,
  SkillCall,
  PerformanceMetrics,
  DecisionDebugInfo,
} from '../interfaces/decision-draft.interface';

/**
 * Trace 记录
 */
export interface DecisionDraftTrace {
  trace_id: string;
  draft_id: string;
  plan_id: string;
  request_id: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  stages: TraceStage[];
  llm_calls: LLMCall[];
  skill_calls: SkillCall[];
  errors?: Array<{
    stage: string;
    error: string;
    timestamp: string;
  }>;
}

/**
 * Trace 阶段
 */
export interface TraceStage {
  stage_name: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  decision_steps_generated?: number;
  step_drafts_generated?: number;
  llm_call_ids?: string[];
  skill_call_ids?: string[];
}

/**
 * Metrics 聚合
 */
export interface DecisionDraftMetrics {
  // 性能指标
  performance: {
    total_generation_time_ms: number;
    avg_step_generation_time_ms: number;
    llm_calls_count: number;
    skill_calls_count: number;
    total_cost_usd: number;
    total_tokens: number;
  };
  
  // 质量指标
  quality: {
    decision_steps_count: number;
    avg_confidence: number;
    evidence_coverage: number; // 有证据的决策步骤比例
    guardian_review_coverage: number; // 有三人格评审的决策步骤比例
  };
  
  // 成功率指标
  success: {
    success_rate: number; // 0-1
    fallback_rate: number; // 降级使用率
    error_rate: number; // 错误率
  };
}

@Injectable()
export class DecisionDraftObservabilityService {
  private readonly logger = new Logger(DecisionDraftObservabilityService.name);
  
  // 内存中的 trace 存储（生产环境应使用持久化存储）
  private traces: Map<string, DecisionDraftTrace> = new Map();
  
  // 当前活动的 trace（用于嵌套调用）
  private activeTraces: Map<string, string> = new Map(); // request_id -> trace_id

  /**
   * 开始 Trace 记录
   */
  startTrace(
    draftId: string,
    planId: string,
    requestId: string,
  ): string {
    const traceId = `trace-${draftId}-${Date.now()}`;
    const trace: DecisionDraftTrace = {
      trace_id: traceId,
      draft_id: draftId,
      plan_id: planId,
      request_id: requestId,
      start_time: new Date().toISOString(),
      stages: [],
      llm_calls: [],
      skill_calls: [],
    };
    
    this.traces.set(traceId, trace);
    this.activeTraces.set(requestId, traceId);
    
    this.logger.debug(`[Observability] 开始 Trace: trace_id=${traceId}, draft_id=${draftId}`);
    
    return traceId;
  }

  /**
   * 结束 Trace 记录
   */
  endTrace(traceId: string, success: boolean = true): DecisionDraftTrace | null {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return null;
    }

    trace.end_time = new Date().toISOString();
    trace.duration_ms = new Date(trace.end_time).getTime() - new Date(trace.start_time).getTime();
    
    // 清理活动 trace
    this.activeTraces.delete(trace.request_id);
    
    this.logger.debug(`[Observability] 结束 Trace: trace_id=${traceId}, duration=${trace.duration_ms}ms, success=${success}`);
    
    return trace;
  }

  /**
   * 记录 Trace 阶段
   */
  startStage(traceId: string, stageName: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return;
    }

    const stage: TraceStage = {
      stage_name: stageName,
      start_time: new Date().toISOString(),
    };
    
    trace.stages.push(stage);
    this.logger.debug(`[Observability] 开始阶段: trace_id=${traceId}, stage=${stageName}`);
  }

  /**
   * 结束 Trace 阶段
   */
  endStage(traceId: string, stageName: string, metadata?: {
    decision_steps_generated?: number;
    step_drafts_generated?: number;
    llm_call_ids?: string[];
    skill_call_ids?: string[];
  }): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return;
    }

    const stage = trace.stages.find(s => s.stage_name === stageName && !s.end_time);
    if (!stage) {
      this.logger.warn(`[Observability] 阶段不存在或已结束: trace_id=${traceId}, stage=${stageName}`);
      return;
    }

    stage.end_time = new Date().toISOString();
    stage.duration_ms = new Date(stage.end_time).getTime() - new Date(stage.start_time).getTime();
    
    if (metadata) {
      stage.decision_steps_generated = metadata.decision_steps_generated;
      stage.step_drafts_generated = metadata.step_drafts_generated;
      stage.llm_call_ids = metadata.llm_call_ids;
      stage.skill_call_ids = metadata.skill_call_ids;
    }
    
    this.logger.debug(`[Observability] 结束阶段: trace_id=${traceId}, stage=${stageName}, duration=${stage.duration_ms}ms`);
  }

  /**
   * 记录 LLM 调用
   */
  recordLLMCall(
    traceId: string,
    call: {
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
      duration_ms: number;
      prompt?: string;
      response?: string;
    },
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return '';
    }

    const callId = `llm-${traceId}-${Date.now()}`;
    const llmCall: LLMCall = {
      call_id: callId,
      model: call.model,
      prompt_tokens: call.prompt_tokens,
      completion_tokens: call.completion_tokens,
      cost_usd: call.cost_usd,
      duration_ms: call.duration_ms,
      timestamp: new Date().toISOString(),
      prompt: call.prompt,
      response: call.response,
    };
    
    trace.llm_calls.push(llmCall);
    
    this.logger.debug(`[Observability] 记录 LLM 调用: trace_id=${traceId}, call_id=${callId}, model=${call.model}, cost=$${call.cost_usd.toFixed(4)}`);
    
    return callId;
  }

  /**
   * 记录 Skill 调用
   */
  recordSkillCall(
    traceId: string,
    skillName: string,
    durationMs: number,
    success: boolean,
    parameters?: any,
    response?: any,
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return '';
    }

    // 查找是否已有该 skill 的调用记录
    let skillCall = trace.skill_calls.find(sc => sc.skill_name === skillName);
    
    if (!skillCall) {
      skillCall = {
        skill_name: skillName,
        call_count: 0,
        total_duration_ms: 0,
        errors: 0,
        parameters,
        response,
      };
      trace.skill_calls.push(skillCall);
    }
    
    skillCall.call_count++;
    skillCall.total_duration_ms += durationMs;
    if (!success) {
      skillCall.errors++;
    }
    
    this.logger.debug(`[Observability] 记录 Skill 调用: trace_id=${traceId}, skill=${skillName}, duration=${durationMs}ms, success=${success}`);
    
    return skillCall.skill_name;
  }

  /**
   * 记录错误
   */
  recordError(traceId: string, stage: string, error: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn(`[Observability] Trace 不存在: trace_id=${traceId}`);
      return;
    }

    if (!trace.errors) {
      trace.errors = [];
    }
    
    trace.errors.push({
      stage,
      error,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.warn(`[Observability] 记录错误: trace_id=${traceId}, stage=${stage}, error=${error}`);
  }

  /**
   * 获取 Trace
   */
  getTrace(traceId: string): DecisionDraftTrace | null {
    return this.traces.get(traceId) || null;
  }

  /**
   * 获取活跃 Trace ID（通过 request_id）
   */
  getActiveTraceId(requestId: string): string | null {
    return this.activeTraces.get(requestId) || null;
  }

  /**
   * 计算 Metrics
   */
  calculateMetrics(
    trace: DecisionDraftTrace,
    decisionDraft: DecisionDraft,
  ): DecisionDraftMetrics {
    // 性能指标
    const performance: PerformanceMetrics = {
      generation_time_ms: trace.duration_ms || 0,
      execution_time_ms: 0, // TODO: 从 execution result 获取
      success_rate: trace.errors && trace.errors.length > 0 ? 0 : 1,
      total_cost_usd: trace.llm_calls.reduce((sum, call) => sum + call.cost_usd, 0),
      total_tokens: trace.llm_calls.reduce(
        (sum, call) => sum + call.prompt_tokens + call.completion_tokens,
        0,
      ),
    };

    const avgStepGenerationTime =
      trace.stages.length > 0
        ? trace.stages.reduce((sum, stage) => sum + (stage.duration_ms || 0), 0) / trace.stages.length
        : 0;

    // 质量指标
    const decisionSteps = decisionDraft.decision_steps;
    const avgConfidence =
      decisionSteps.length > 0
        ? decisionSteps.reduce((sum, step) => sum + step.confidence, 0) / decisionSteps.length
        : 0;

    const evidenceCoverage =
      decisionSteps.length > 0
        ? decisionSteps.filter(step => step.evidence.length > 0).length / decisionSteps.length
        : 0;

    const guardianReviewCoverage =
      decisionSteps.length > 0
        ? decisionSteps.filter(step => step.guardian_review).length / decisionSteps.length
        : 0;

    // 成功率指标
    const fallbackRate = trace.errors && trace.errors.length > 0 ? trace.errors.length / trace.stages.length : 0;
    const errorRate = trace.errors ? trace.errors.length / (trace.stages.length || 1) : 0;

    return {
      performance: {
        total_generation_time_ms: performance.generation_time_ms,
        avg_step_generation_time_ms: avgStepGenerationTime,
        llm_calls_count: trace.llm_calls.length,
        skill_calls_count: trace.skill_calls.length,
        total_cost_usd: performance.total_cost_usd,
        total_tokens: performance.total_tokens,
      },
      quality: {
        decision_steps_count: decisionSteps.length,
        avg_confidence: avgConfidence,
        evidence_coverage: evidenceCoverage,
        guardian_review_coverage: guardianReviewCoverage,
      },
      success: {
        success_rate: performance.success_rate,
        fallback_rate: fallbackRate,
        error_rate: errorRate,
      },
    };
  }

  /**
   * 构建 Debug Info（Studio 模式）
   */
  buildDebugInfo(
    trace: DecisionDraftTrace,
    metrics: DecisionDraftMetrics,
  ): DecisionDebugInfo {
    return {
      llm_calls: trace.llm_calls,
      skill_calls: trace.skill_calls,
      performance_metrics: {
        generation_time_ms: metrics.performance.total_generation_time_ms,
        execution_time_ms: metrics.performance.total_generation_time_ms, // TODO: 从 execution 获取
        success_rate: metrics.success.success_rate,
        total_cost_usd: metrics.performance.total_cost_usd,
        total_tokens: metrics.performance.total_tokens,
      },
      execution_trace: trace, // 完整的 trace 信息
    };
  }
}
