// src/agent/interfaces/claude-orchestration.interface.ts

/**
 * Claude 编排相关接口定义
 */

import { DecisionLogEntry } from './trip-plan.interface';
import { ErrorType } from './error-types.interface';
import { ClarificationQuestion } from './clarification.interface';

/**
 * 意图分析结果
 */
export interface IntentAnalysis {
  intentType: 'simple_query' | 'complex_planning' | 'analysis' | 'decision' | 'mixed';
  complexity: 'simple' | 'medium' | 'complex';
  requiredCapabilities: string[];
  confidence: number;
  reasoning: string;
  keywords?: string[];
  entities?: Record<string, any>;
}

/**
 * 路由决策结果
 */
export interface RoutingDecision {
  route: 'SYSTEM1_API' | 'SYSTEM1_RAG' | 'SYSTEM2_REASONING' | 'SYSTEM2_ANALYSIS' | 'SYSTEM2_WEBBROWSE';
  confidence: number;
  reasoning: string;
  budget: {
    max_seconds: number;
    max_steps: number;
    max_browser_steps: number;
  };
  requiredCapabilities?: string[];
  consentRequired?: boolean;
}

/**
 * Skills 选择结果
 */
export interface SkillsPlan {
  selectedSkills: Array<{
    skillName: string;
    reason: string;
    priority: number;
    input: Record<string, any>;
    dependencies?: string[];
  }>;
  executionOrder: string[];
  dependencies: Record<string, string[]>;
}

/**
 * 执行计划步骤
 */
export interface ExecutionStep {
  id: string;
  type: 'skill' | 'action' | 'parallel_group';
  skillName?: string;
  actionName?: string;
  dependencies: string[];
  parallel: boolean;
  input?: Record<string, any>;
  fallback?: {
    onError: 'continue' | 'stop' | 'retry';
    retryCount?: number;
  };
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  steps: ExecutionStep[];
  parallelGroups: string[][];
  fallbackStrategy: {
    onError: 'continue' | 'stop';
    retryCount: number;
  };
  estimatedDuration?: number;
  estimatedCost?: number;
}

/**
 * 编排结果
 */
export interface OrchestrationResult {
  success: boolean;
  result: {
    // 业务结果（成功时）
    [key: string]: any;
    
    // 澄清消息相关字段（失败且需要澄清时）
    needsUserConfirmation?: boolean;
    clarificationMessage?: string; // 向后兼容：简单字符串格式
    clarificationQuestions?: ClarificationQuestion[]; // 新增：结构化问题数组
    missingServices?: string[];
    solutions?: string[];
    errorType?: ErrorType;
  };
  answerText: string;
  stepsExecuted: Array<{
    stepId: string;
    skillName?: string;
    actionName?: string;
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
  }>;
  totalDuration: number;
  totalCost?: number;
  decisionLog?: DecisionLogEntry[];
}

/**
 * Agent 上下文
 */
export interface AgentContext {
  requestId: string;
  userId: string;
  tripId?: string | null;
  conversationHistory?: string[];
  userPreferences?: Record<string, any>;
  availableSkills?: string[];
  availableActions?: string[];
}
