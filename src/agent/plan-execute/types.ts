// src/agent/plan-execute/types.ts
/**
 * Plan-and-Execute Agent 类型定义
 */

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * 计划任务 (PlanTask)
 * 
 * 基于 LLMCompiler 和 ReWOO 理念设计
 * - 支持依赖关系 (Dependencies)
 * - 支持变量引用 (Variable Reference)
 * - 支持输出数据传递 (Output Data)
 */
export interface PlanTask {
  /** 唯一标识符，如 "task_1" */
  id: string;
  
  /** 任务描述（人类可读，可包含变量引用如 ${task_1.flightNumber}） */
  description: string;
  
  /** 工具类别（可选，提示 Executor 应该加载哪类工具） */
  toolCategory?: string;
  
  /** [关键] 依赖的任务 ID 列表，如 ["task_0"] */
  dependencies: string[];
  
  /** 当前状态 */
  status: TaskStatus;
  
  /** 执行结果摘要（可选） */
  result?: string;
  
  /** 详细结果数据（用于上下文传递和变量引用） */
  outputData?: any;
  
  /** 错误信息（如果失败） */
  error?: string;
  
  /** 执行时间戳 */
  startedAt?: Date;
  completedAt?: Date;
  
  /** 元数据（用于存储额外信息） */
  metadata?: Record<string, any>;
}

/**
 * 兼容性：PlanStep 作为 PlanTask 的别名
 */
export type PlanStep = PlanTask;
export type PlanStepStatus = TaskStatus;

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 结果摘要（用于重规划器） */
  summary: string;
  
  /** 完整数据（存储在 memory 中） */
  fullData: any;
  
  /** 是否成功 */
  success: boolean;
  
  /** 错误信息（如果失败） */
  error?: string;
  
  /** 是否应该触发重规划 */
  shouldReplan?: boolean;
}

/**
 * 重规划结果
 */
export interface ReplanResult {
  /** 是否有更新 */
  hasUpdates: boolean;
  
  /** 新的计划 */
  newPlan: PlanStep[];
  
  /** 重规划原因 */
  reasoning?: string;
  
  /** 变更统计 */
  changes?: {
    added: number;
    removed: number;
    modified: number;
  };
}

/**
 * 执行状态
 */
export interface ExecutionState {
  /** 任务列表 */
  tasks: PlanTask[];
  
  /** 内存：KV 存储 taskId -> outputData */
  memory: Record<string, any>;
  
  /** 上下文摘要 */
  contextSummary: string;
}

/**
 * 编排器运行结果
 */
export interface OrchestrationResult {
  /** 最终状态 */
  status: 'done' | 'failed' | 'timeout' | 'deadlock';
  
  /** 最终计划 */
  plan: PlanTask[];
  
  /** 执行内存（所有任务的完整结果） */
  memory: Record<string, any>;
  
  /** 最终摘要 */
  summary?: string;
  
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 上下文摘要
 */
export interface ContextSummary {
  /** 线程 ID */
  threadId: string;
  
  /** 用户目标 */
  userGoal: string;
  
  /** 当前状态摘要 */
  currentState: string;
  
  /** 已完成的关键步骤 */
  completedSteps: string[];
  
  /** 已知约束 */
  constraints: Record<string, any>;
  
  /** 预算信息 */
  budget?: {
    total: number;
    spent: number;
    remaining: number;
  };
}
