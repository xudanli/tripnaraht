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
   * 从描述中提取工具名称
   * 
   * 优先级：
   * 1. 从反引号中提取工具名（如 "使用 `webbrowse.browse` 查询..."）
   * 2. 从 ActionRegistry 中查找匹配的工具
   * 3. 使用模式匹配（向后兼容）
   */
  private extractToolName(description: string): string {
    // 1. 优先从反引号中提取工具名（Planner 会在描述中明确指定工具）
    // 例如："使用 `webbrowse.browse` 查询..." -> "webbrowse.browse"
    const backtickMatch = description.match(/`([a-z_]+\.[a-z_]+)`/);
    if (backtickMatch && backtickMatch[1]) {
      const toolName = backtickMatch[1];
      // 验证工具是否存在
      if (this.actionRegistry && this.actionRegistry.has(toolName)) {
        return toolName;
      }
      // 如果工具不存在，记录警告但继续尝试其他方法
      this.logger.warn(`描述中提到的工具 ${toolName} 不存在，尝试其他方法`);
    }

    // 2. 从 ActionRegistry 中查找匹配的工具（基于描述关键词）
    if (this.actionRegistry) {
      const availableActions = this.actionRegistry.list();
      
      // 根据描述中的关键词匹配工具
      const keywords = description.toLowerCase();
      
      // 按匹配度排序：完全匹配 > 部分匹配
      const matchedActions = availableActions
        .map(action => {
          const actionNameLower = action.name.toLowerCase();
          const descriptionLower = action.description.toLowerCase();
          
          // 计算匹配分数
          let score = 0;
          
          // 如果工具名或描述包含关键词，增加分数
          if (keywords.includes('天气') || keywords.includes('weather')) {
            if (actionNameLower.includes('weather') || descriptionLower.includes('天气')) {
              score += 10;
            }
          }
          if (keywords.includes('汇率') || keywords.includes('exchange') || keywords.includes('currency')) {
            if (actionNameLower.includes('currency') || descriptionLower.includes('汇率')) {
              score += 10;
            }
          }
          if (keywords.includes('地点') || keywords.includes('place') || keywords.includes('poi')) {
            if (actionNameLower.includes('place') || descriptionLower.includes('地点')) {
              score += 10;
            }
          }
          if (keywords.includes('浏览') || keywords.includes('browse') || keywords.includes('网页')) {
            if (actionNameLower.includes('browse') || descriptionLower.includes('浏览')) {
              score += 10;
            }
          }
          if (keywords.includes('行程') || keywords.includes('trip')) {
            if (actionNameLower.includes('trip') || descriptionLower.includes('行程')) {
              score += 5;
            }
          }
          
          return { action, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);
      
      if (matchedActions.length > 0) {
        const bestMatch = matchedActions[0].action;
        this.logger.debug(`从描述中匹配到工具: ${bestMatch.name} (分数: ${matchedActions[0].score})`);
        return bestMatch.name;
      }
    }

    // 3. 向后兼容：使用简单的模式匹配（仅当上述方法都失败时）
    const patterns: Record<string, string> = {
      '查询.*天气': 'webbrowse.browse', // 改为使用 webbrowse.browse 而不是不存在的 weather.query
      '预订.*酒店': 'webbrowse.browse',
      '搜索.*地点': 'places.resolve_entities',
      '获取.*信息': 'webbrowse.browse',
      '查询.*汇率': 'webbrowse.browse', // 改为使用 webbrowse.browse
    };

    for (const [pattern, toolName] of Object.entries(patterns)) {
      if (new RegExp(pattern).test(description)) {
        // 验证工具是否存在
        if (this.actionRegistry && this.actionRegistry.has(toolName)) {
          return toolName;
        }
        // 如果模式匹配的工具不存在，继续尝试下一个模式
      }
    }

    // 4. 最后的降级方案：如果 ActionRegistry 可用，返回第一个可用工具（不推荐，但比报错好）
    if (this.actionRegistry) {
      const availableActions = this.actionRegistry.list();
      if (availableActions.length > 0) {
        this.logger.warn(`无法从描述中提取工具名，使用降级方案: ${availableActions[0].name}`);
        return availableActions[0].name;
      }
    }

    // 5. 如果所有方法都失败，抛出错误而不是返回不存在的工具
    throw new Error(`无法从描述中提取工具名: "${description}"。请确保描述中包含工具名称（如 "使用 \`webbrowse.browse\` ..."）`);
  }

  /**
   * 从描述中提取输入参数（简化实现）
   */
  private extractInput(
    description: string,
    memory: Record<string, any>,
    context: any,
  ): any {
    // 从 context 中提取 tripId（如果存在）
    const tripId = context?.tripId || context?.trip?.trip_id || context?.trip_id;
    
    // 简单的参数提取
    // 实际应该使用 LLM 来解析
    const input: any = {
      description,
      context: {
        memory,
        ...context,
      },
    };
    
    // 如果找到了 tripId，添加到 input 中（优先使用）
    if (tripId) {
      input.trip_id = tripId;
      input.tripId = tripId; // 同时支持两种命名
    }
    
    return input;
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
