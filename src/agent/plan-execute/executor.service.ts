// src/agent/plan-execute/executor.service.ts
/**
 * Executor Service
 * 
 * 负责执行单个计划步骤
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ActionRegistryService } from '../services/action-registry.service';
import { PlanTask, PlanStep, ExecutionResult } from './types';

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);

  constructor(
    @Optional() private readonly actionRegistry?: ActionRegistryService,
  ) {}

  /**
   * 执行单个步骤
   */
  async executeStep(
    step: PlanTask | PlanStep,
    memory: Record<string, any>,
    context: any,
  ): Promise<ExecutionResult> {
    this.logger.debug(`执行步骤: ${step.id} - ${step.description}`);

    try {
      // 1. 解析步骤描述，提取工具名称和参数
      const { toolName, input } = this.parseStepDescription(step.description, memory, context);

      // 2. 查找并执行工具
      if (!this.actionRegistry) {
        throw new Error('ActionRegistryService 未可用');
      }

      const action = this.actionRegistry.get(toolName);
      if (!action) {
        throw new Error(`工具未找到: ${toolName}`);
      }

      // 3. 执行工具
      const result = await action.execute(input, context);

      // 4. 检查是否有 SUSPENDED 信号（HITL）
      if (result?._system_status === 'SUSPENDED') {
        this.logger.warn(`步骤 ${step.id} 需要审批，挂起执行`);
        return {
          summary: `需要用户审批: ${result.message || step.description}`,
          fullData: result,
          success: false,
          shouldReplan: false, // 审批不需要重规划，等待用户决定
        };
      }

      // 5. 检查执行结果
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error(result.error || result.message || '执行失败');
      }

      // 6. 生成摘要
      const summary = this.generateSummary(step, result);

      return {
        summary,
        fullData: result,
        success: true,
        shouldReplan: this.shouldTriggerReplan(step, result),
      };
    } catch (error: any) {
      this.logger.error(`步骤 ${step.id} 执行失败: ${error.message}`, error.stack);
      return {
        summary: `执行失败: ${error.message}`,
        fullData: null,
        success: false,
        error: error.message,
        shouldReplan: true, // 失败需要重规划
      };
    }
  }

  /**
   * 解析步骤描述，提取工具名称和参数
   * 
   * 这是一个简化的实现，实际应该使用 LLM 来解析自然语言描述
   */
  private parseStepDescription(
    description: string,
    memory: Record<string, any>,
    context: any,
  ): { toolName: string; input: any } {
    // 简单的模式匹配（实际应该使用 LLM）
    // 例如："查询北京的天气" -> { toolName: "weather.query", input: { city: "北京" } }
    
    // 这里先返回一个占位符，实际实现需要：
    // 1. 使用 LLM 解析描述
    // 2. 从 memory 中提取上下文信息
    // 3. 构建工具输入参数

    // 临时实现：尝试从描述中提取工具名称
    const toolName = this.extractToolName(description);
    const input = this.extractInput(description, memory, context);

    return { toolName, input };
  }

  /**
   * 从描述中提取工具名称（简化实现）
   */
  private extractToolName(description: string): string {
    // 简单的关键词匹配
    const patterns: Record<string, string> = {
      '查询.*天气': 'weather.query',
      '预订.*酒店': 'booking.bookHotel',
      '搜索.*地点': 'places.search',
      '获取.*信息': 'info.get',
    };

    for (const [pattern, toolName] of Object.entries(patterns)) {
      if (new RegExp(pattern).test(description)) {
        return toolName;
      }
    }

    // 默认返回一个通用工具
    return 'general.execute';
  }

  /**
   * 从描述中提取输入参数（简化实现）
   */
  private extractInput(
    description: string,
    memory: Record<string, any>,
    context: any,
  ): any {
    // 简单的参数提取
    // 实际应该使用 LLM 来解析
    return {
      description,
      context: {
        memory,
        ...context,
      },
    };
  }

  /**
   * 生成执行结果摘要
   */
  private generateSummary(step: PlanTask | PlanStep, result: any): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result?.summary) {
      return result.summary;
    }

    if (result?.message) {
      return result.message;
    }

    return `步骤 ${step.id} 执行完成`;
  }

  /**
   * 判断是否应该触发重规划
   */
  private shouldTriggerReplan(step: PlanTask | PlanStep, result: any): boolean {
    // 如果结果中包含需要重规划的标记
    if (result?.shouldReplan === true) {
      return true;
    }

    // 如果结果包含新信息，可能需要调整后续步骤
    if (result?.newInformation) {
      return true;
    }

    // 默认不触发重规划
    return false;
  }
}
