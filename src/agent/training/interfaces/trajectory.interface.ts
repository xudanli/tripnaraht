// src/agent/training/interfaces/trajectory.interface.ts

import { GateResult, Itinerary, DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';

/**
 * ComplianceResult（合规检查结果）
 */
export interface ComplianceResult {
  risk_warnings: Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
    message: string;
    requires_user_confirmation: boolean;
  }>;
  disclaimers: string[];
  required_confirmations: string[];
}

/**
 * ExecutionResult（执行结果）
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 轨迹验证结果
 */
export interface TrajectoryValidationResult {
  isValid: boolean;
  score: number; // 0..1
  reasons: string[];
}

/**
 * Reward信号
 */
export interface RewardSignal {
  type: 'USER_APPROVAL' | 'PLAN_COMMIT' | 'DECISION_ALIGNMENT' | 'EXECUTION_SUCCESS' | 'EXECUTION_FAILURE';
  value: number; // reward值
  timestamp: string; // ISO 8601
  metadata?: Record<string, any>;
}

/**
 * 轨迹收集数据
 */
export interface TrajectoryCollectionData {
  requestId: string;
  tripId?: string;
  plan: Itinerary;
  decisionTrace: DecisionLogEntry[];
  researchData: Record<string, any>;
  gateResult: GateResult;
  complianceResult: ComplianceResult;
  modelVersion?: string;
  countryCode?: string;
}

/**
 * 轨迹更新数据（用于更新已有轨迹）
 */
export interface TrajectoryUpdateData {
  userApproval?: ApprovalStatus;
  executionResult?: ExecutionResult;
}

/**
 * RL轨迹格式（s,a,r,s'）
 * 
 * 用于强化学习训练的标准化轨迹格式
 */

/**
 * State（状态）- 规划请求的上下文
 */
export interface RLState {
  request_id: string;
  trip_id?: string;
  user_request: string; // 用户原始请求
  origin?: string | { lat: number; lng: number };
  destination?: string | { lat: number; lng: number };
  date_range?: {
    start_date: string;
    end_date: string;
  };
  constraints?: Record<string, any>; // 用户约束（预算、时间窗口等）
  preferences?: Record<string, any>; // 用户偏好
  research_data?: Record<string, any>; // 研究数据
  gate_result?: GateResult; // Gate结果
  compliance_result?: ComplianceResult; // 合规结果
  current_itinerary?: Itinerary; // 当前行程状态
  decision_history?: DecisionLogEntry[]; // 历史决策
  metadata?: {
    country_code?: string;
    model_version?: string;
    timestamp?: string;
  };
}

/**
 * Action（动作）- Agent的决策动作
 */
export interface RLAction {
  action_type: 'PLAN_GENERATE' | 'ROUTE_ADJUST' | 'PACE_ADJUST' | 'BUDGET_ADJUST' | 'TRANSPORT_SELECT' | 'POI_SELECT' | 'GATE_CHECK' | 'COMPLIANCE_CHECK' | 'USER_CLARIFICATION';
  action_params: Record<string, any>; // 动作参数
  reasoning?: string; // 决策推理
  decision_point?: string; // 决策点标识
  actor?: string; // 执行者（Abu/Dr.Dre/Neptune）
  alternatives_considered?: Array<{
    option: any;
    score?: number;
    reason?: string;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Reward（奖励）- 用户反馈和验证结果
 */
export interface RLReward {
  total_reward: number; // 总奖励值（归一化到0-1）
  reward_signals: RewardSignal[]; // 奖励信号列表
  validation_score?: number; // 验证分数（0-1）
  user_approval?: ApprovalStatus; // 用户审批状态
  execution_success?: boolean; // 执行是否成功
  metadata?: Record<string, any>;
}

/**
 * RL轨迹步骤（s,a,r,s'）
 */
export interface RLTrajectoryStep {
  step_index: number; // 步骤索引
  state: RLState; // 当前状态
  action: RLAction; // 执行的动作
  reward: RLReward; // 获得的奖励
  next_state?: RLState; // 下一状态（如果存在）
  timestamp: string; // ISO 8601
}

/**
 * RL轨迹（完整轨迹）
 */
export interface RLTrajectory {
  trajectory_id: string;
  request_id: string;
  trip_id?: string;
  steps: RLTrajectoryStep[]; // 轨迹步骤序列
  metadata: {
    model_version: string;
    country_code?: string;
    created_at: string;
    updated_at: string;
    validation_status: 'VALIDATED' | 'REJECTED' | 'PENDING';
    validation_score?: number;
    total_reward: number;
  };
}

/**
 * ETL提取选项
 */
export interface TrajectoryETLOptions {
  trajectory_ids?: string[]; // 指定轨迹ID列表
  request_ids?: string[]; // 指定请求ID列表
  min_validation_score?: number; // 最小验证分数
  min_total_reward?: number; // 最小总奖励
  model_version?: string; // 模型版本过滤
  country_code?: string; // 国家代码过滤
  date_range?: {
    start: string; // ISO 8601
    end: string; // ISO 8601
  };
  limit?: number; // 限制数量
  offset?: number; // 偏移量
}

/**
 * ETL导出格式
 */
export type ETLExportFormat = 'jsonl' | 'parquet' | 'json';

/**
 * ETL导出结果
 */
export interface ETLExportResult {
  format: ETLExportFormat;
  file_path: string;
  record_count: number;
  file_size_bytes: number;
  metadata: {
    exported_at: string;
    trajectory_ids: string[];
    stats: {
      total_steps: number;
      avg_reward: number;
      avg_validation_score: number;
    };
  };
}
