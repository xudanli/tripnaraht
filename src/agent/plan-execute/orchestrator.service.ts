// src/agent/plan-execute/orchestrator.service.ts
/**
 * DAG Orchestrator Service (并行调度引擎)
 * 
 * 基于 LLMCompiler 和 ReWOO 理念：
 * - 拓扑排序与并行调度
 * - 不断扫描哪些任务的依赖已经满足
 * - 并发执行所有可运行任务
 * - 智能上下文注入（只注入依赖任务的结果）
 * - 变量引用解析（ReWOO 优化）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PlannerService } from './planner.service';
import { ReplannerService } from './replanner.service';
import { ExecutorService } from './executor.service';
import { ContextAssemblerService } from './context-assembler.service';
import { AgentStateService } from '../services/agent-state.service';
import { PlanTask, OrchestrationResult, ContextSummary, ExecutionResult } from './types';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { LlmService } from '../../llm/services/llm.service';

@Injectable()
export class DAGOrchestratorService {
  private readonly logger = new Logger(DAGOrchestratorService.name);

  // 配置
  private readonly maxSteps = 50; // 最大步骤数（防止死循环）
  private readonly maxIterations = 100; // 最大迭代次数

  constructor(
    private readonly planner: PlannerService,
    private readonly replanner: ReplannerService,
    private readonly executor: ExecutorService,
    private readonly contextAssembler: ContextAssemblerService,
    @Optional() private readonly agentStateService?: AgentStateService,
    @Optional() private readonly llmService?: LlmService,
  ) {}

  /**
   * 运行 DAG 编排（主入口）
   * 
   * @param threadId 线程 ID
   * @param userGoal 用户目标
   * @returns 编排结果
   */
  async run(
    threadId: string,
    userGoal: string,
  ): Promise<OrchestrationResult> {
    this.logger.log(`[DAG] 开始 DAG 编排: threadId=${threadId}, goal=${userGoal.substring(0, 50)}...`);

    try {
      // 1. 初始化上下文
      const context = await this.contextAssembler.getSummary(threadId, userGoal);
      const contextSummary = context.currentState || '初始状态';

      // 2. 获取 LLM Provider（从 AgentState 中获取）
      const llmProvider = this.getLlmProvider(threadId);

      // 3. 生成初始 DAG 计划
      let tasks = await this.planner.generateDAGPlan(userGoal, contextSummary, llmProvider);
      const memory: Record<string, any> = {};
      let iteration = 0;
      let totalStepsExecuted = 0;

      this.logger.log(`[DAG] Plan generated with ${tasks.length} tasks.`);

      // 3. 调度循环 (The "Ready" Queue Pattern)
      while (true && iteration < this.maxIterations) {
        iteration++;

        // --- 阶段 A: 检查完成情况 ---
        const allCompleted = tasks.every(t => t.status === 'completed');
        if (allCompleted) {
          this.logger.log('[DAG] ✅ All tasks completed');
          break;
        }

        const anyFailed = tasks.some(t => t.status === 'failed');
        if (anyFailed) {
          // 触发 Replanner 尝试修复路径
          this.logger.warn('[DAG] ⚠️ Some tasks failed, triggering replanner');
          const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
          if (replanResult.hasUpdates) {
            this.logger.log('[DAG] 🔄 Plan updated by Replanner');
            tasks = replanResult.newPlan;
            continue;
          } else {
            // 重规划也无法解决
            return {
              status: 'failed',
              plan: tasks,
              memory,
              error: '存在失败步骤且无法通过重规划恢复',
            };
          }
        }

        // --- 阶段 B: 寻找可执行任务 (The "Ready" Queue) ---
        // 条件：状态是 pending 且 所有依赖项都已 completed
        const runnableTasks = this.findRunnableTasks(tasks);

        // --- 阶段 C: 死锁检测 ---
        // 如果还有 pending 任务，但没有一个是 runnable 的，说明死锁了
        const hasPending = tasks.some(t => t.status === 'pending');
        if (runnableTasks.length === 0 && hasPending) {
          const deadlockInfo = this.detectDeadlock(tasks);
          this.logger.error(`[DAG] ⚠️ Deadlock detected: ${deadlockInfo.reason}`);
          this.logger.error(`Remaining pending tasks: ${tasks.filter(t => t.status === 'pending').map(t => t.id).join(', ')}`);
          
          // 触发 Replanner 尝试解开死锁
          const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);
          if (replanResult.hasUpdates) {
            this.logger.log('[DAG] 🔄 Replanner attempted to resolve deadlock');
            tasks = replanResult.newPlan;
            continue;
          }
          
          return {
            status: 'deadlock',
            plan: tasks,
            memory,
            error: `死锁检测: ${deadlockInfo.reason}`,
          };
        }

        // 如果没有可运行任务且没有待处理任务，完成
        if (runnableTasks.length === 0) {
          break;
        }

        // --- 阶段 D: 并行发射 (Parallel Launch) 🚀 ---
        // 检查步骤数限制
        totalStepsExecuted += runnableTasks.length;
        if (totalStepsExecuted > this.maxSteps) {
          this.logger.warn(`[DAG] ⚠️ Max steps limit reached: ${this.maxSteps}`);
          return {
            status: 'timeout',
            plan: tasks,
            memory,
            error: `达到最大步骤数限制: ${this.maxSteps}`,
          };
        }

        // 标记为进行中
        runnableTasks.forEach(t => {
          t.status = 'in_progress';
          t.startedAt = new Date();
        });

        this.logger.log(`[DAG] 🚀 Parallel Batch ${iteration}: ${runnableTasks.map(t => t.id).join(', ')}`);

        // Promise.allSettled 并发执行
        const batchResults = await Promise.allSettled(
          runnableTasks.map(task => this.executeTaskWrapper(task, memory, contextSummary)),
        );

        // --- 阶段 E: 处理结果 ---
        let batchHasFailures = false;
        let shouldReplan = false;

        batchResults.forEach((outcome, index) => {
          const task = runnableTasks[index];
          
          if (outcome.status === 'fulfilled') {
            const execResult = outcome.value;
            
            if (execResult.success) {
              task.status = 'completed';
              task.result = execResult.summary;
              task.outputData = execResult.fullData; // [关键] 存储输出数据
              task.completedAt = new Date();
              memory[task.id] = execResult.fullData; // 存入共享内存

              // 检查是否需要重规划
              if (execResult.shouldReplan) {
                shouldReplan = true;
              }
            } else {
              // 执行失败
              task.status = 'failed';
              task.error = execResult.error || execResult.summary;
              task.completedAt = new Date();
              batchHasFailures = true;
            }
          } else {
            // 执行异常
            const error = outcome.reason;
            this.logger.error(`[DAG] Task ${task.id} failed:`, error);
            task.status = 'failed';
            task.error = error?.message || String(error);
            task.completedAt = new Date();
            batchHasFailures = true;
          }
        });

        // --- 阶段 F: 重规划（如果有失败或需要重规划）---
        if (batchHasFailures || shouldReplan) {
          this.logger.log('[DAG] 🔄 Triggering replanner');
          const replanResult = await this.replanner.replan(userGoal, tasks, memory, llmProvider);

          if (replanResult.hasUpdates) {
            this.logger.log(
              `[DAG] Plan updated: +${replanResult.changes?.added || 0}, ` +
                `-${replanResult.changes?.removed || 0}, ` +
                `~${replanResult.changes?.modified || 0}`,
            );
            tasks = replanResult.newPlan;
          }
        }

        // 本轮结束，立即进入下一轮循环，检查新的 runnableTasks
      }

      // 4. 生成最终摘要
      const summary = this.generateFinalSummary(tasks, memory);

      return {
        status: 'done',
        plan: tasks,
        memory,
        summary,
      };
    } catch (error: any) {
      this.logger.error(`[DAG] 编排失败: ${error.message}`, error.stack);
      return {
        status: 'failed',
        plan: [],
        memory: {},
        error: error.message,
      };
    }
  }

  /**
   * 查找可运行的任务 (The "Ready" Queue)
   * 
   * 条件：状态是 pending 且所有依赖项都已 completed
   */
  private findRunnableTasks(tasks: PlanTask[]): PlanTask[] {
    return tasks.filter(task => {
      if (task.status !== 'pending') {
        return false;
      }

      // 所有依赖必须已完成
      const depsMet = task.dependencies.every(depId => {
        const depTask = tasks.find(t => t.id === depId);
        return depTask && depTask.status === 'completed';
      });

      return depsMet;
    });
  }

  /**
   * 执行任务包装器（ReWOO 优化）
   * 
   * 负责：
   * 1. 解析变量引用（如 ${task_1.flightNumber}）
   * 2. 智能上下文注入（只注入依赖任务的结果，避免污染上下文）
   */
  private async executeTaskWrapper(
    task: PlanTask,
    memory: Record<string, any>,
    globalContext: string,
  ): Promise<any> {
    // 1. 解析变量引用 (Variable Reference Resolution)
    // 例如: "Book seat for ${task_1.flightNumber}" → "Book seat for IC123"
    const resolvedDescription = this.resolveVariableReferences(task.description, memory, task.dependencies);

    // 2. 智能上下文注入 (ReWOO: Relevant Working Objects Only)
    // 只注入依赖任务的结果，避免把无关的 memory 塞进去污染上下文
    const dependencyContext = this.buildDependencyContext(task.dependencies, memory);

    // 3. 构建最终上下文
    const enrichedContext = `${globalContext}\n\nDependency Results:\n${dependencyContext}`;

    // 4. 创建临时任务对象（使用解析后的描述）
    const enrichedTask: PlanTask = {
      ...task,
      description: resolvedDescription,
    };

    // 5. 执行任务
    return this.executor.executeStep(enrichedTask, memory, { context: enrichedContext, globalContext: globalContext });
  }

  /**
   * 解析变量引用 (ReWOO Variable Resolution)
   * 
   * 支持格式：
   * - ${task_id.fieldName}
   * - ${task_id.fieldName.nestedField}
   * 
   * 示例：
   * - "${task_1.flightNumber}" → "IC123"
   * - "${task_2.hotel.name}" → "Vik Hotel"
   */
  private resolveVariableReferences(
    description: string,
    memory: Record<string, any>,
    dependencies: string[],
  ): string {
    let resolved = description;

    // 匹配变量引用模式: ${task_id.fieldPath}
    const variablePattern = /\$\{([^}]+)\}/g;
    const matches = description.matchAll(variablePattern);

    for (const match of matches) {
      const fullMatch = match[0]; // ${task_1.flightNumber}
      const variablePath = match[1]; // task_1.flightNumber

      // 解析路径: task_id.fieldPath
      const pathParts = variablePath.split('.');
      if (pathParts.length < 2) {
        this.logger.warn(`[DAG] 无效的变量引用格式: ${fullMatch}`);
        continue;
      }

      const taskId = pathParts[0]; // task_1
      const fieldPath = pathParts.slice(1).join('.'); // flightNumber 或 hotel.name

      // 检查依赖关系
      if (!dependencies.includes(taskId)) {
        this.logger.warn(
          `[DAG] 变量引用 ${fullMatch} 引用了非依赖任务 ${taskId}`,
        );
        continue;
      }

      // 从 memory 中获取值
      const taskData = memory[taskId];
      if (!taskData) {
        this.logger.warn(`[DAG] 任务 ${taskId} 的数据不存在于 memory`);
        continue;
      }

      // 使用 lodash.get 风格的路径访问
      const value = this.getNestedValue(taskData, fieldPath);
      if (value !== undefined && value !== null) {
        resolved = resolved.replace(fullMatch, String(value));
      } else {
        this.logger.warn(`[DAG] 无法解析变量: ${fullMatch} (字段路径: ${fieldPath})`);
      }
    }

    return resolved;
  }

  /**
   * 获取嵌套值（简单的路径访问实现）
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * 构建依赖上下文 (ReWOO: Relevant Working Objects Only)
   * 
   * 只包含依赖任务的结果，而不是整个 memory
   */
  private buildDependencyContext(
    dependencies: string[],
    memory: Record<string, any>,
  ): string {
    if (dependencies.length === 0) {
      return 'No dependencies.';
    }

    return dependencies
      .map(depId => {
        const depData = memory[depId];
        if (!depData) {
          return `Task ${depId}: (no data)`;
        }

        // 智能摘要：如果数据太大，只取关键字段
        const summary = this.summarizeData(depData);
        return `Task ${depId}:\n${summary}`;
      })
      .join('\n\n');
  }

  /**
   * 摘要数据（避免 context 过大）
   */
  private summarizeData(data: any): string {
    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      // 如果是对象，尝试提取关键字段
      if (data.summary) {
        return data.summary;
      }

      if (data.message) {
        return data.message;
      }

      // 如果对象太大，只取前几个字段
      const keys = Object.keys(data);
      if (keys.length > 5) {
        const limited = keys.slice(0, 5).reduce((acc, key) => {
          acc[key] = data[key];
          return acc;
        }, {} as Record<string, any>);
        return JSON.stringify(limited, null, 2) + '\n... (truncated)';
      }

      return JSON.stringify(data, null, 2);
    }

    return String(data);
  }

  /**
   * 检测死锁
   */
  private detectDeadlock(tasks: PlanTask[]): {
    isDeadlock: boolean;
    reason: string;
  } {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const failedTasks = tasks.filter(t => t.status === 'failed');

    if (pendingTasks.length === 0) {
      return { isDeadlock: false, reason: '' };
    }

    // 检查是否有循环依赖
    const hasCycle = this.detectCycle(tasks);
    if (hasCycle) {
      return {
        isDeadlock: true,
        reason: '检测到循环依赖',
      };
    }

    // 检查是否所有 pending 任务都依赖失败的任务
    const allBlockedByFailed = pendingTasks.every(task => {
      return task.dependencies.some(depId => {
        return failedTasks.some(f => f.id === depId);
      });
    });

    if (allBlockedByFailed) {
      return {
        isDeadlock: false, // 不是死锁，是失败阻断
        reason: '所有待处理任务都被失败任务阻断',
      };
    }

    // 检查是否所有依赖都不存在或都失败
    const allDepsFailedOrMissing = pendingTasks.every(task => {
      return task.dependencies.every(depId => {
        const depTask = tasks.find(t => t.id === depId);
        return !depTask || depTask.status === 'failed';
      });
    });

    if (allDepsFailedOrMissing) {
      return {
        isDeadlock: true,
        reason: '存在待处理任务但所有依赖都失败或不存在',
      };
    }

    return {
      isDeadlock: true,
      reason: '存在待处理任务但无法运行（依赖关系问题）',
    };
  }

  /**
   * 检测循环依赖（DFS）
   */
  private detectCycle(tasks: PlanTask[]): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      if (recStack.has(taskId)) {
        return true; // 发现循环
      }

      if (visited.has(taskId)) {
        return false;
      }

      visited.add(taskId);
      recStack.add(taskId);

      const task = tasks.find(t => t.id === taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (dfs(depId)) {
            return true;
          }
        }
      }

      recStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (dfs(task.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 生成最终摘要
   */
  private generateFinalSummary(
    tasks: PlanTask[],
    memory: Record<string, any>,
  ): string {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const total = tasks.length;

    return `执行完成: ${completed}/${total} 成功, ${failed} 失败`;
  }

  /**
   * 从 AgentState 获取 LLM Provider
   * 
   * @param threadId 线程 ID（对应 AgentState 的 request_id）
   * @returns LLM Provider
   */
  private getLlmProvider(threadId: string): LlmProvider {
    if (this.agentStateService) {
      const state = this.agentStateService.get(threadId);
      if (state?.llm_provider && state.llm_provider !== 'auto') {
        // 转换为 LlmProvider 枚举值
        switch (state.llm_provider) {
          case 'openai':
            return LlmProvider.OPENAI;
          case 'deepseek':
            return LlmProvider.DEEPSEEK;
          case 'gemini':
            return LlmProvider.GEMINI;
          case 'anthropic':
            return LlmProvider.ANTHROPIC;
        }
      }
    }
    
    // 使用系统推荐的默认 provider（'auto' 或未指定时）
    if (this.llmService) {
      return this.llmService.getDefaultProvider();
    }
    
    // 降级：如果没有 LlmService，使用 OpenAI
    return LlmProvider.OPENAI;
  }
}
