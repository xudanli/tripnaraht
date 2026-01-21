// src/agent/training/interfaces/product.interface.ts

/**
 * 产品化相关接口定义
 */

/**
 * Reward权重配置
 */
export interface RewardWeights {
  success_rate: number; // 成功率权重
  satisfaction: number; // 满意度权重
  cost: number; // 成本权重（负权重，成本越低越好）
  compliance_rate: number; // 合规率权重
}

/**
 * Reward函数配置
 */
export interface RewardFunctionConfig {
  weights: RewardWeights;
  normalization: {
    success_rate_range: [number, number];
    satisfaction_range: [number, number];
    cost_range: [number, number];
    compliance_rate_range: [number, number];
  };
}

/**
 * Reward计算结果
 */
export interface RewardCalculationResult {
  total_reward: number;
  component_rewards: {
    success_rate_reward: number;
    satisfaction_reward: number;
    cost_reward: number;
    compliance_rate_reward: number;
  };
  metadata: {
    calculation_time: string;
    config_version: string;
  };
}

/**
 * 用户行为类型
 */
export type UserActionType = 'ADOPT' | 'EDIT' | 'EXPORT' | 'ABANDON' | 'FEEDBACK';

/**
 * 用户行为追踪记录
 */
export interface UserActionTracking {
  action_id: string;
  user_id?: string;
  request_id: string;
  plan_id?: string;
  decision_id?: string;
  action_type: UserActionType;
  timestamp: string;
  metadata: Record<string, any>;
}

/**
 * 用户反馈
 */
export interface UserFeedback {
  feedback_id: string;
  user_id?: string;
  request_id: string;
  plan_id?: string;
  satisfaction?: number; // 1-5
  comments?: string;
  issues?: string[];
  timestamp: string;
  metadata: Record<string, any>;
}

/**
 * 反馈分析结果
 */
export interface FeedbackAnalysis {
  period_start: string;
  period_end: string;
  total_feedbacks: number;
  avg_satisfaction: number;
  action_distribution: Record<UserActionType, number>;
  common_issues: Array<{
    issue: string;
    count: number;
    percentage: number;
  }>;
  trends: {
    satisfaction_trend: 'INCREASING' | 'DECREASING' | 'STABLE';
    adoption_rate_trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  };
}

/**
 * A/B实验配置
 */
export interface ABTestExperiment {
  experiment_id: string;
  name: string;
  description: string;
  variants: Array<{
    variant_id: string;
    name: string;
    model_version: string;
    traffic_percentage: number;
  }>;
  start_date: string;
  end_date?: string;
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  success_metrics: string[];
  created_at: string;
}

/**
 * A/B实验分配结果
 */
export interface ABTestAssignment {
  experiment_id: string;
  variant_id: string;
  user_id?: string;
  request_id: string;
  assignment_method: 'CONSISTENT_HASH' | 'RANDOM';
  timestamp: string;
}

/**
 * A/B实验结果
 */
export interface ABTestResult {
  experiment_id: string;
  variant_results: Array<{
    variant_id: string;
    sample_size: number;
    success_rate: number;
    avg_reward: number;
    avg_latency_ms: number;
    error_rate: number;
  }>;
  statistical_significance: {
    p_value: number;
    is_significant: boolean;
    winner_variant_id?: string;
  };
  analysis_date: string;
}

/**
 * 灰度阶段配置
 */
export interface GradualRolloutPhase {
  phase: number;
  traffic_percentage: number;
  duration_days: number;
  success_criteria: {
    min_success_rate?: number;
    max_error_rate?: number;
    min_avg_reward?: number;
    max_avg_latency_ms?: number;
  };
}

/**
 * 可解释输出格式
 */
export interface ExplainableOutput {
  summary: string; // 摘要
  decision_process: {
    steps: Array<{
      step_name: string;
      decision: string;
      reasoning: string;
      confidence: number;
    }>;
  };
  evidence_chain: Array<{
    evidence_id: string;
    evidence_type: string;
    evidence_content: string;
    relevance: number;
  }>;
  visualization?: {
    type: 'DECISION_TREE' | 'EVIDENCE_GRAPH' | 'TIMELINE';
    data: Record<string, any>;
  };
  metadata: {
    model_version: string;
    trace_id: string;
    generated_at: string;
  };
}
