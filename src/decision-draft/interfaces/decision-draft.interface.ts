// src/decision-draft/interfaces/decision-draft.interface.ts

/**
 * Decision Draft 接口定义
 * 
 * Decision-First Agent 引擎的核心数据结构
 * 融合 Chain-of-Work 引擎的步骤草案（Step Draft）
 */

import {
  TripPlanRequest,
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
  GuardianType,
  DecisionLogEntry,
  EvidenceRef,
} from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft } from '../../chain-of-work/interfaces/chain-of-work.interface';

/**
 * 决策类型
 */
export type DecisionType =
  | 'transport-decision' // 是否租车、租什么车
  | 'pace-decision' // 行程节奏判断
  | 'poi-selection' // POI 取舍与优先级
  | 'route-optimization' // 顺路与否、是否绕路
  | 'weather-strategy' // 天气与备选方案
  | 'budget-balance'; // 预算分配策略

/**
 * 决策步骤状态
 */
export type DecisionStepStatus = 'pending' | 'approved' | 'rejected' | 'modified';

/**
 * 决策步骤输入
 */
export interface DecisionStepInput {
  name: string;
  value: any;
  source: 'user' | 'system' | 'inferred';
}

/**
 * 决策步骤输出
 */
export interface DecisionStepOutput {
  name: string;
  value: any;
  confidence: number; // 0-1
}

/**
 * 证据引用（使用统一的 EvidenceRef 格式）
 * 
 * @deprecated 请直接使用 EvidenceRef，此接口保留仅为向后兼容
 */
export type DecisionEvidence = EvidenceRef;

/**
 * 三人格评审（统一使用 GateResult.guardian_results 格式）
 * 
 * 与 GateResult.guardian_results 对齐，使用 verdict 字段
 */
export interface GuardianReview {
  verdict: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE'; // 与 GateResult.guardian_results.verdict 对齐
  evidence: string[]; // 证据 ID 列表，与 GateResult.guardian_results.evidence 对齐
  explanation?: string; // 可选：详细解释
  confidence?: number; // 可选：置信度 0-1
  reason_codes?: string[]; // 可选：原因代码列表
}

/**
 * 用户反馈
 */
export interface UserFeedback {
  action: 'approve' | 'reject' | 'modify';
  reasoning?: string;
  modified_at: string;
}

/**
 * 决策步骤
 * 
 * 业务层的决策抽象，对应 Chain-of-Work 的 Step Drafts（技术层）
 */
export interface DecisionStep {
  id: string;
  title: string;
  description: string;
  type: DecisionType;
  status: DecisionStepStatus;
  confidence: number; // 0-1
  
  // 输入输出
  inputs: DecisionStepInput[];
  outputs: DecisionStepOutput[];
  
  // 证据和决策日志
  evidence: EvidenceRef[]; // 使用统一的 EvidenceRef 格式
  decision_log: DecisionLogEntry[];
  
  // 关联的 Step Drafts（技术层）
  step_draft_ids: string[];
  step_drafts?: any[]; // TripNARAStepDraft[]（Expert 模式可见）
  
  // 步骤依赖关系
  dependencies?: string[]; // 依赖的其他步骤 ID 列表
  
  // 状态机集成字段（P0 新增）
  orchestration_step?: OrchestrationStep; // 关联的状态机步骤（INTAKE/RESEARCH/GATE_EVAL/...）
  sub_agent?: SubAgentType; // 关联的 Sub-Agent（Planner/Gatekeeper/LocalInsight/...）
  skills_used?: string[]; // 使用的 Skills 列表
  
  // 三人格评审（如果适用）
  guardian_review?: {
    abu?: GuardianReview;
    dr_dre?: GuardianReview;
    neptune?: GuardianReview;
  };
  
  // 用户交互
  user_feedback?: UserFeedback;
  
  // 元数据
  created_at: string;
  updated_at: string;
}

/**
 * 决策草案
 * 
 * 包含多个决策步骤（业务层），关联步骤草案（技术层）
 */
export interface DecisionDraft {
  draft_id: string;
  plan_id: string; // 对应 OrchestratorState.plan_id（统一命名）
  plan_version: number; // 对应 OrchestratorState.plan_version（数字版本号）
  workflow_id?: string; // 保留向后兼容，已废弃，请使用 plan_id
  version?: string; // 保留向后兼容，已废弃，请使用 plan_version
  
  // 决策步骤（业务层）
  decision_steps: DecisionStep[];
  
  // 步骤草案（技术层，关联）
  step_draft_id?: string; // 关联的 Step Draft ID
  step_draft?: TripNARAWorkflowDraft; // 完整 Step Draft（Expert 模式）
  
  // 执行结果（可选）
  execution_result_id?: string;
  execution_result?: any; // ExecutionResult（Expert 模式）
  
  // 用户模式
  user_mode: 'toc' | 'expert' | 'studio'; // ToC 模式、Expert 模式或 Studio 模式
  
  // Studio 模式特有字段（调试信息）
  debug_info?: DecisionDebugInfo;
  
  // 元数据
  metadata: {
    decision_count: number;
    step_count: number;
    created_by: string;
    created_at: string;
    updated_at: string;
  };
}

/**
 * 决策草案生成配置
 */
export interface DecisionDraftGenerationConfig {
  model?: 'claude-3-5-sonnet' | 'gpt-4' | 'deepseek';
  temperature?: number; // 0-1, default 0.7
  max_tokens?: number; // 500-4000, default 2000
  user_mode?: 'toc' | 'expert' | 'studio'; // 用户模式
}

/**
 * 决策类型到步骤类型的映射规则
 */
export interface DecisionTypeMappingRule {
  decision_type: DecisionType;
  step_types: string[]; // OrchestrationStep[]
  required_skills: string[];
  sub_agent: string; // SubAgentType
  guardian?: GuardianType;
}

/**
 * 决策草案版本
 */
export interface DecisionDraftVersion {
  version_id: string;
  plan_id: string; // 对应 OrchestratorState.plan_id（统一命名）
  plan_version: number; // 对应 OrchestratorState.plan_version（数字版本号）
  workflow_id?: string; // 保留向后兼容，已废弃，请使用 plan_id
  version?: string; // 保留向后兼容，已废弃，请使用 plan_version
  
  // 决策草案（业务层）
  decision_draft: DecisionDraft;
  
  // 步骤草案（技术层）
  step_draft: TripNARAWorkflowDraft;
  
  // 执行结果（可选）
  execution_result?: any; // ExecutionResult
  
  // 版本差异（用于对比）
  diff?: {
    decision_steps_added: DecisionStep[];
    decision_steps_removed: DecisionStep[];
    decision_steps_modified: DecisionStep[];
    step_drafts_added: any[]; // TripNARAStepDraft[]
    step_drafts_removed: any[]; // TripNARAStepDraft[]
    step_drafts_modified: any[]; // TripNARAStepDraft[]
  };
  
  // 元数据
  created_by: string;
  description?: string;
  created_at: string;
}

/**
 * 决策质量指标
 */
export interface DecisionQualityMetrics {
  evidence_completeness: number; // 0-1
  decision_consistency: number; // 0-1
  user_satisfaction: number; // 0-1
  explanation_click_rate: number; // 0-1
  regeneration_count: number; // 越低越好
}

/**
 * LLM 调用信息（Studio 模式）
 */
export interface LLMCall {
  call_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  duration_ms: number;
  timestamp: string;
  prompt?: string; // Studio 模式可见
  response?: string; // Studio 模式可见
}

/**
 * Skill 调用信息（Studio 模式）
 */
export interface SkillCall {
  skill_name: string;
  call_count: number;
  total_duration_ms: number;
  errors: number;
  parameters?: any; // Studio 模式可见
  response?: any; // Studio 模式可见
}

/**
 * 性能指标（Studio 模式）
 */
export interface PerformanceMetrics {
  generation_time_ms: number;
  execution_time_ms: number;
  success_rate: number;
  total_cost_usd: number;
  total_tokens: number;
}

/**
 * 调试信息（Studio 模式）
 */
export interface DecisionDebugInfo {
  llm_calls?: LLMCall[];
  skill_calls?: SkillCall[];
  performance_metrics?: PerformanceMetrics;
  execution_trace?: any; // ChainOfWorkTrace
}

/**
 * 决策解释（三层可解释性）
 */
export interface DecisionExplanation {
  decision_step: DecisionStep;
  step_drafts: any[]; // TripNARAStepDraft[]
  evidence_chain: EvidenceRef[];
  decision_log: DecisionLogEntry[];
  three_guardians_review?: {
    abu: GuardianReview;
    dr_dre: GuardianReview;
    neptune: GuardianReview;
  };
}

/**
 * Studio 模式解释（完整技术解释）
 */
export interface StudioExplanation extends DecisionExplanation {
  llm_calls?: LLMCall[];
  skill_calls?: SkillCall[];
  performance_metrics?: PerformanceMetrics;
  optimization_suggestions?: string[];
}