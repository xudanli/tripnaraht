// src/agent/interfaces/claude-orchestration.interface.ts

/**
 * Claude 编排相关接口定义
 */

import { DecisionLogEntry } from './trip-plan.interface';
import { ErrorType } from './error-types.interface';
import { ClarificationQuestion } from './clarification.interface';
import type { TaskType } from '../utils/orchestration-signals.util';
import type {
  OrchestratorFailureDomain,
  OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';

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
  /** 产品/调试：快慢路径标签（如 FAST≈System1，DEEP≈System2）；亦可由前端 `route.route` 推导 */
  selected_path?: string;
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

    /** PRD I5：失败路径主分类（与 observability.orchestration_failure 对齐） */
    orchestrator_robustness?: OrchestratorRobustnessMetadata;

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
 * AgentService.routeAndRun 在 Recovery 环内再次调用状态机时注入，用于 decision_log.metadata.recovery_context。
 */
export type RecoveryInvocationContext = {
  is_retry: boolean;
  retry_attempt: number;
  previous_failure_domain: OrchestratorFailureDomain;
  elapsed_from_start_ms: number;
  /** 与 observability.recovery_trace 对齐的摘要（可选） */
  trace_summary?: Array<{ attempt: number; backoff_ms: number; failure_code?: string }>;
};

/**
 * Agent 上下文
 */
export interface AgentContext {
  requestId: string;
  userId: string;
  tripId?: string | null;
  /** `trip_runs.id`：AgentService 在编排前创建/续跑注入，供 Planner LangGraph metadata 与 Context writeBack */
  tripRunId?: string | null;
  conversationHistory?: string[];
  userPreferences?: Record<string, any>;
  availableSkills?: string[];
  availableActions?: string[];
  /** 编排外层超时（withTimeout）触发 abort，用于取消昂贵子步骤（如 tools.select embedding） */
  abortSignal?: AbortSignal;
  /** AgentService 注入：与 `signalsFromRequest` 的 taskType 对齐，供动态编排选择轻量路径 */
  routingTaskType?: TaskType;
  /** Phase B+：外层 Recovery 重试进入 SM 时携带，供每条 orchestrator decision_log 打章 */
  recoveryInvocation?: RecoveryInvocationContext;
}
