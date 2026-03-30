// src/chain-of-work/interfaces/chain-of-work.interface.ts

/**
 * Chain-of-Work 引擎接口定义
 * 
 * 参考：src/agent/interfaces/trip-plan.interface.ts
 */

import {
  TripPlanRequest,
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
  GuardianType,
  GateResult,
  DecisionLogEntry,
} from '../../agent/interfaces/trip-plan.interface';

/**
 * 步骤草案
 */
export interface TripNARAStepDraft {
  id: string;
  step_type: OrchestrationStep; // 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | ...
  title: string;
  description: string;
  status: 'draft' | 'modified' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  priority: number; // 1-10
  conditions?: string; // 执行条件
  
  // TripNARA Agent 映射
  sub_agent?: SubAgentType;           // 负责执行的 Sub-Agent (Planner/Gatekeeper/CoreDecision/LocalInsight/...)
  guardian?: GuardianType;             // 三人格守护者 ('ABU' | 'DR_DRE' | 'NEPTUNE')
  domain_agents?: string[];            // Domain Agents (GeoAgent/WeatherAgent/CostAgent/ExperienceAgent)
  skills?: SkillMapping[] | string[];  // 需要调用的 Skills
  
  // 输入输出定义
  inputs?: string[];   // 步骤输入
  outputs?: string[];  // 步骤输出
  
  // 决策相关
  gate_result?: GateResult; // GATE_EVAL 步骤的输出
  decision_log_entry?: DecisionLogEntry;
  
  // 证据相关
  evidence_refs?: string[]; // EvidenceRef ID 列表
  
  // 版本相关
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * 工作流草案
 */
export interface TripNARAWorkflowDraft {
  draft_id: string;
  workflow_id: string; // 对应 plan_id
  version: string; // 如 'v1.0'
  
  // 状态机步骤
  steps: TripNARAStepDraft[];
  
  // TripNARA 特定字段
  orchestration_mode: 'CLAUDE_SM' | 'CLAUDE_DYNAMIC' | 'LEGACY';
  trip_plan_request?: TripPlanRequest;
  orchestrator_state?: OrchestratorState;
  
  // 元数据
  metadata: {
    step_count: number;
    skills_count: number;
    sub_agents_count: number;
    last_modified: string;
    created_by: string;
  };
  
  created_at: string;
  updated_at: string;
}

/**
 * Skills 映射
 */
export interface SkillMapping {
  step_id: string;
  skill_name: string; // 如 'transport.search', 'dem.getProfile'
  confidence: number; // 0-1
  matching_reason: string; // 匹配依据
  input_mapping?: Record<string, string>; // 输入字段映射
  output_schema?: any; // 输出 Schema（JSON Schema）
}

/**
 * Sub-Agents 映射
 */
export interface SubAgentMapping {
  step_id: string;
  sub_agent: SubAgentType;
  guardian?: GuardianType; // 'ABU' | 'DR_DRE' | 'NEPTUNE'
  prompt_template: string;
  output_schema?: any; // 输出 Schema（JSON Schema）
}

/**
 * 执行计划
 */
export interface ExecutionPlan {
  draft_id: string;
  workflow_id: string;
  version: string;
  steps: Array<{
    id: string;
    step_type: OrchestrationStep;
    sub_agent?: SubAgentType;
    skills?: string[];
    input_mapping: Record<string, string>;
    output_schema?: any;
    dependencies: string[];
    fallback_strategy?: {
      on_error: 'continue' | 'retry' | 'abort';
      retry_count?: number;
      fallback_skill?: string;
    };
  }>;
  parallel_groups: string[][]; // 可并行执行的步骤组
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  execution_id: string;
  draft_id: string;
  success: boolean;
  steps: Array<{
    step_id: string;
    status: 'completed' | 'failed' | 'skipped';
    output?: any;
    error?: string;
    duration_ms: number;
  }>;
  trace_info: ChainOfWorkTrace;
  total_duration_ms: number;
  total_cost_est_usd: number;
  error_message?: string;
}

/**
 * Chain-of-Work Trace 信息
 */
export interface ChainOfWorkTrace {
  draft_id: string;
  workflow_id: string;
  version: string;
  steps: Array<{
    step_id: string;
    step_type: OrchestrationStep;
    status: 'pending' | 'running' | 'completed' | 'failed';
    start_time: string;
    end_time?: string;
    duration_ms?: number;
    sub_agent?: SubAgentType;
    skills_called?: string[];
    tool_calls?: number;
    cost_est_usd?: number;
    decision_log_entry_id?: string;
    output?: any;
    error?: string;
  }>;
  total_duration_ms: number;
  total_cost_est_usd: number;
  success: boolean;
}

/**
 * 步骤草案生成配置
 */
export interface DraftGenerationConfig {
  model?: 'claude-3-5-sonnet' | 'gpt-4' | 'deepseek';
  temperature?: number; // 0-1, default 0.7
  max_tokens?: number; // 500-4000, default 2000
}

/**
 * 步骤草案验证结果
 */
export interface DraftValidationResult {
  valid: boolean;
  errors: Array<{
    step_id: string;
    error_type: 'MISSING_SKILL' | 'INVALID_MAPPING' | 'ORDER_VIOLATION' | 'SCHEMA_MISMATCH';
    message: string;
    suggestion?: string;
  }>;
  warnings: Array<{
    step_id: string;
    warning_type: 'LOW_CONFIDENCE' | 'MISSING_FALLBACK' | 'PERFORMANCE_RISK';
    message: string;
  }>;
}

/**
 * 版本信息
 */
export interface Version {
  id: string;
  workflow_id: string;
  version: string; // 如 'v1.0'
  draft_data: TripNARAWorkflowDraft;
  status: 'draft' | 'published' | 'archived';
  is_current: boolean;
  creator: string;
  description?: string;
  created_at: string;
}