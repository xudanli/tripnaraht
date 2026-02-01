// src/decision-draft/services/decision-debug-collector.service.ts

/**
 * Decision Debug Collector Service
 * 
 * 调试信息收集服务
 * 用于收集决策生成和执行过程中的调试信息（LLM Calls、Skill Calls、性能指标等）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionDraft,
  DecisionDebugInfo,
  LLMCall,
  SkillCall,
  PerformanceMetrics,
} from '../interfaces/decision-draft.interface';
import { ChainOfWorkTrace } from '../../chain-of-work/interfaces/chain-of-work.interface';

@Injectable()
export class DecisionDebugCollectorService {
  private readonly logger = new Logger(DecisionDebugCollectorService.name);

  /**
   * 收集完整调试信息
   */
  async collectDebugInfo(
    decisionDraft: DecisionDraft,
    executionTrace?: ChainOfWorkTrace,
  ): Promise<DecisionDebugInfo> {
    this.logger.log(
      `[DecisionDebugCollector] 收集调试信息: draft_id=${decisionDraft.draft_id}`,
    );

    const debugInfo: DecisionDebugInfo = {};

    // 如果有执行追踪，从中提取信息
    if (executionTrace) {
      debugInfo.llm_calls = await this.collectLLMCalls(executionTrace);
      debugInfo.skill_calls = await this.collectSkillCalls(executionTrace);
      debugInfo.performance_metrics = await this.calculatePerformanceMetrics(
        executionTrace,
      );
      debugInfo.execution_trace = executionTrace;
    }

    return debugInfo;
  }

  /**
   * 收集 LLM 调用信息
   */
  async collectLLMCalls(executionTrace: ChainOfWorkTrace): Promise<LLMCall[]> {
    const llmCalls: LLMCall[] = [];

    // 从执行追踪中提取 LLM 调用信息
    // 注意：这里需要根据实际的执行追踪结构来提取
    // 目前 ChainOfWorkTrace 中没有直接的 LLM 调用信息，需要从其他地方获取
    // TODO: 集成实际的 LLM 调用日志系统

    executionTrace.steps.forEach((step, index) => {
      // 如果步骤有成本估算，说明可能调用了 LLM
      if (step.cost_est_usd && step.cost_est_usd > 0) {
        llmCalls.push({
          call_id: `llm-call-${step.step_id}-${index}`,
          model: 'claude-3-5-sonnet', // TODO: 从实际调用中获取
          prompt_tokens: 0, // TODO: 从实际调用中获取
          completion_tokens: 0, // TODO: 从实际调用中获取
          cost_usd: step.cost_est_usd,
          duration_ms: step.duration_ms || 0,
          timestamp: step.start_time,
        });
      }
    });

    this.logger.log(
      `[DecisionDebugCollector] 收集到 ${llmCalls.length} 个 LLM 调用`,
    );
    return llmCalls;
  }

  /**
   * 收集 Skill 调用信息
   */
  async collectSkillCalls(executionTrace: ChainOfWorkTrace): Promise<SkillCall[]> {
    const skillCallMap = new Map<string, SkillCall>();

    // 从执行追踪中提取 Skill 调用信息
    executionTrace.steps.forEach((step) => {
      if (step.skills_called && step.skills_called.length > 0) {
        step.skills_called.forEach((skillName) => {
          const existing = skillCallMap.get(skillName);
          if (existing) {
            existing.call_count += 1;
            existing.total_duration_ms += step.duration_ms || 0;
            if (step.error) {
              existing.errors += 1;
            }
          } else {
            skillCallMap.set(skillName, {
              skill_name: skillName,
              call_count: 1,
              total_duration_ms: step.duration_ms || 0,
              errors: step.error ? 1 : 0,
            });
          }
        });
      }
    });

    const skillCalls = Array.from(skillCallMap.values());
    this.logger.log(
      `[DecisionDebugCollector] 收集到 ${skillCalls.length} 个不同的 Skill 调用`,
    );
    return skillCalls;
  }

  /**
   * 计算性能指标
   */
  async calculatePerformanceMetrics(
    executionTrace: ChainOfWorkTrace,
  ): Promise<PerformanceMetrics> {
    const completedSteps = executionTrace.steps.filter(
      (step) => step.status === 'completed',
    );
    const failedSteps = executionTrace.steps.filter(
      (step) => step.status === 'failed',
    );

    const successRate =
      executionTrace.steps.length > 0
        ? completedSteps.length / executionTrace.steps.length
        : 0;

    const totalCost = executionTrace.steps.reduce(
      (sum, step) => sum + (step.cost_est_usd || 0),
      0,
    );

    // 估算总 Token 数（基于成本，假设 $0.003/1K input tokens, $0.015/1K output tokens）
    // 这是一个粗略估算，实际应该从 LLM 调用中获取
    const estimatedTotalTokens = Math.round(totalCost / 0.00001); // 粗略估算

    const metrics: PerformanceMetrics = {
      generation_time_ms: executionTrace.total_duration_ms,
      execution_time_ms: executionTrace.total_duration_ms,
      success_rate: successRate,
      total_cost_usd: totalCost,
      total_tokens: estimatedTotalTokens,
    };

    this.logger.log(
      `[DecisionDebugCollector] 性能指标: 成功率=${(successRate * 100).toFixed(2)}%, 总成本=$${totalCost.toFixed(4)}`,
    );
    return metrics;
  }

  /**
   * 从现有的调试信息中更新（增量更新）
   */
  async updateDebugInfo(
    existingDebugInfo: DecisionDebugInfo | undefined,
    newExecutionTrace?: ChainOfWorkTrace,
  ): Promise<DecisionDebugInfo> {
    if (!newExecutionTrace) {
      return existingDebugInfo || {};
    }

    const newDebugInfo = await this.collectDebugInfo(
      {} as DecisionDraft, // 不需要完整的 DecisionDraft
      newExecutionTrace,
    );

    // 合并现有和新调试信息
    return {
      ...existingDebugInfo,
      ...newDebugInfo,
      // 合并 LLM Calls（追加）
      llm_calls: [
        ...(existingDebugInfo?.llm_calls || []),
        ...(newDebugInfo.llm_calls || []),
      ],
      // 合并 Skill Calls（合并统计）
      skill_calls: this.mergeSkillCalls(
        existingDebugInfo?.skill_calls || [],
        newDebugInfo.skill_calls || [],
      ),
      // 更新性能指标（使用最新的）
      performance_metrics: newDebugInfo.performance_metrics,
    };
  }

  /**
   * 合并 Skill Calls 统计
   */
  private mergeSkillCalls(
    existing: SkillCall[],
    newCalls: SkillCall[],
  ): SkillCall[] {
    const mergedMap = new Map<string, SkillCall>();

    // 添加现有的
    existing.forEach((call) => {
      mergedMap.set(call.skill_name, { ...call });
    });

    // 合并新的
    newCalls.forEach((call) => {
      const existing = mergedMap.get(call.skill_name);
      if (existing) {
        existing.call_count += call.call_count;
        existing.total_duration_ms += call.total_duration_ms;
        existing.errors += call.errors;
      } else {
        mergedMap.set(call.skill_name, { ...call });
      }
    });

    return Array.from(mergedMap.values());
  }
}
