// src/agent/training/interfaces/product.interface.ts

/**
 * 产品化相关接口定义
 * 
 * TripNARA RL 框架 v2.0 - 门控型奖励系统
 */

/**
 * [Legacy] Reward权重配置 - 保留兼容性
 */
export interface RewardWeights {
  success_rate: number; // 成功率权重
  satisfaction: number; // 满意度权重
  cost: number; // 成本权重（负权重，成本越低越好）
  compliance_rate: number; // 合规率权重
}

/**
 * [Legacy] Reward函数配置 - 保留兼容性
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
 * [Legacy] Reward计算结果 - 保留兼容性
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

// ============================================================================
// TripNARA Gated Reward System v2.0
// ============================================================================

/**
 * 门控层配置 - 安全 > 合规 > 可执行
 * 任一门控失败直接返回负分，轨迹标记为不可训练
 */
export interface GateConfig {
  /** 安全门控：天气/地形/道路风险 */
  safety_gate: {
    threshold: number;  // 默认 0.9
    penalty: number;    // 默认 -2.0
    description: string;
  };
  /** 合规门控：法律/签证/许可 */
  compliance_gate: {
    threshold: number;  // 默认 0.95
    penalty: number;    // 默认 -1.5
    description: string;
  };
  /** 可执行门控：交通/时间/物理可达 */
  feasibility_gate: {
    threshold: number;  // 默认 0.8
    penalty: number;    // 默认 -1.0
    description: string;
  };
}

/**
 * 体验层权重配置 - 只有门控通过后才计算
 */
export interface ExperienceWeights {
  satisfaction: number;      // 用户满意度 (默认 0.4)
  diversity: number;         // 行程多样性 (默认 0.25)
  cost_efficiency: number;   // 成本效率 (默认 0.2)
  novelty: number;           // 新颖度 (默认 0.15)
}

/**
 * TripNARA 门控型奖励配置
 */
export interface GatedRewardConfig {
  /** 门控层配置 */
  gates: GateConfig;
  /** 体验层权重 */
  experience: ExperienceWeights;
  /** 配置版本 */
  version: string;
}

/**
 * 门控型奖励输入指标
 */
export interface GatedRewardMetrics {
  // 门控层指标 (0-1)
  safety_score: number;       // 安全评分
  compliance_score: number;   // 合规评分
  feasibility_score: number;  // 可执行评分
  
  // 体验层指标 (0-1)
  satisfaction: number;       // 用户满意度
  diversity: number;          // 行程多样性
  cost_efficiency: number;    // 成本效率
  novelty: number;            // 新颖度
  
  // 附加信息
  evidence_coverage?: number; // 证据覆盖率
  risk_disclosure?: boolean;  // 风险是否披露
}

/**
 * 门控失败类型
 */
export type GateFailureType = 'SAFETY_GATE' | 'COMPLIANCE_GATE' | 'FEASIBILITY_GATE' | null;

/**
 * 奖励类型
 */
export type RewardType = 
  | 'GATE_FAILURE'      // 门控失败
  | 'USER_REJECTED'     // 系统通过但用户拒绝
  | 'FULL_SUCCESS';     // 完全成功

/**
 * DPO 偏好标签
 */
export type PreferenceLabel = 'POSITIVE' | 'NEGATIVE' | null;

/**
 * TripNARA 门控型奖励计算结果
 */
export interface GatedRewardResult {
  /** 总奖励值 (-2 ~ 1) */
  total_reward: number;
  
  /** 门控是否通过 */
  gate_passed: boolean;
  
  /** 门控失败类型（如果失败） */
  gate_failure?: GateFailureType;
  
  /** 是否可用于 DPO 训练 */
  trainable_for_dpo: boolean;
  
  /** 是否可用于 PPO 训练 */
  trainable_for_ppo: boolean;
  
  /** 奖励类型 */
  reward_type: RewardType;
  
  /** DPO 偏好标签 */
  preference_label?: PreferenceLabel;
  
  /** 原因说明 */
  reason: string;
  
  /** 体验分解（仅门控通过时有值） */
  experience_breakdown?: {
    satisfaction: number;
    diversity: number;
    cost_efficiency: number;
    novelty: number;
    base_score: number;
    preference_bonus?: number;
  };
  
  /** 门控分数记录 */
  gate_scores?: {
    safety: number;
    compliance: number;
    feasibility: number;
  };
  
  /** 元数据 */
  metadata: {
    calculation_time: string;
    config_version: string;
  };
}

/**
 * TripNARA 审批信号 - 拆分系统真值和用户偏好
 */
export interface TripNARAApprovalSignals {
  /** 系统真值门控（由规则/审计/外部事实决定） */
  system_approval: {
    safety_pass: boolean;           // 安全门控通过
    compliance_pass: boolean;       // 合规门控通过
    feasibility_pass: boolean;      // 可执行性通过
    evidence_sufficient: boolean;   // 证据充分
    system_approved: boolean;       // 系统整体审批
    rejection_reasons?: string[];   // 拒绝原因
  };
  
  /** 用户偏好标签（用于 DPO 训练） */
  user_preference: {
    user_approved: boolean;         // 用户是否采纳
    satisfaction_rating?: number;   // 满意度评分 1-5
    preference_factors?: {
      route_appeal: number;         // 路线吸引力 0-1
      pacing_comfort: number;       // 节奏舒适度 0-1
      poi_interest: number;         // POI 兴趣度 0-1
      cost_acceptability: number;   // 成本可接受度 0-1
    };
    feedback_text?: string;         // 用户反馈文本
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
