// src/agent/plan-execute/context-assembler.service.ts
/**
 * Context Assembler Service
 * 
 * 负责组装和摘要上下文信息，供 Planner 和 Replanner 使用
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentStateService } from '../services/agent-state.service';
import { ContextSummary } from './types';

@Injectable()
export class ContextAssemblerService {
  private readonly logger = new Logger(ContextAssemblerService.name);

  constructor(
    @Optional() private readonly agentStateService?: AgentStateService,
  ) {}

  /**
   * 获取上下文摘要
   */
  async getSummary(threadId: string, userGoal?: string): Promise<ContextSummary> {
    this.logger.debug(`组装上下文摘要: threadId=${threadId}`);

    // 如果 AgentStateService 可用，从 AgentState 获取信息
    if (this.agentStateService) {
      const state = this.agentStateService.get(threadId);
      if (state) {
        return {
          threadId,
          userGoal: userGoal || state.user_input,
          currentState: this.summarizeState(state),
          completedSteps: this.extractCompletedSteps(state),
          constraints: this.extractConstraints(state),
          budget: this.extractBudget(state),
        };
      }
    }

    // 降级：返回基本摘要
    return {
      threadId,
      userGoal: userGoal || '未指定目标',
      currentState: '初始状态',
      completedSteps: [],
      constraints: {},
    };
  }

  /**
   * 从 AgentState 生成状态摘要
   */
  private summarizeState(state: any): string {
    const parts: string[] = [];

    if (state.trip?.trip_id) {
      parts.push(`行程 ID: ${state.trip.trip_id}`);
    }

    if (state.result?.timeline?.length) {
      parts.push(`已规划 ${state.result.timeline.length} 个节点`);
    }

    if (state.memory?.readiness) {
      const readiness = state.memory.readiness;
      parts.push(`准备度: ${readiness.summary?.total_blockers || 0} 个阻塞项`);
    }

    return parts.length > 0 ? parts.join('; ') : '无特殊状态';
  }

  /**
   * 提取已完成的步骤
   */
  private extractCompletedSteps(state: any): string[] {
    const steps: string[] = [];

    if (state.react?.decision_log) {
      state.react.decision_log.forEach((log: any) => {
        if (log.chosen_action) {
          steps.push(log.chosen_action);
        }
      });
    }

    return steps;
  }

  /**
   * 提取约束信息
   */
  private extractConstraints(state: any): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (state.trip) {
      constraints.days = state.trip.days;
      constraints.pacing = state.trip.pacing;
      constraints.lunchBreak = state.trip.lunch_break;
    }

    if (state.memory?.readiness?.constraints) {
      constraints.readiness = state.memory.readiness.constraints;
    }

    return constraints;
  }

  /**
   * 提取预算信息
   */
  private extractBudget(state: any): ContextSummary['budget'] {
    // 从 state 中提取预算信息（如果有）
    // 这里需要根据实际的数据结构来实现
    return undefined;
  }

  /**
   * 更新上下文摘要（基于新的执行结果）
   */
  async updateSummary(
    summary: ContextSummary,
    stepId: string,
    result: any,
  ): Promise<ContextSummary> {
    return {
      ...summary,
      completedSteps: [...summary.completedSteps, stepId],
      currentState: this.mergeStateUpdate(summary.currentState, result),
    };
  }

  /**
   * 合并状态更新
   */
  private mergeStateUpdate(currentState: string, result: any): string {
    // 简单的状态合并逻辑
    // 实际实现可能需要更复杂的逻辑
    if (result?.summary) {
      return `${currentState}; ${result.summary}`;
    }
    return currentState;
  }
}
