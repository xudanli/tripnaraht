// src/agent/interfaces/decision-node.interface.ts

/**
 * Decision Node - AI-Native 决策系统的最小原子单元
 * 
 * 每个决策点都包含：Context、Constraints、Preferences、Options、Trade-off 逻辑、Confidence/Uncertainty
 */

/**
 * 约束类型
 */
export type ConstraintType = 
  | 'REACHABILITY'      // 可达性约束
  | 'SAFETY_CRITICAL'   // 安全关键约束
  | 'PHYSICAL_LIMIT'    // 物理极限约束
  | 'LEGAL'             // 法律约束
  | 'DATA_CRITICAL'     // 数据关键约束
  | 'PREFERENCE'        // 偏好约束
  | 'COMFORT'           // 舒适度约束
  | 'EXPERIENCE'        // 体验约束
  | 'COST';             // 成本约束

/**
 * 约束硬度
 */
export type ConstraintHardness = 'HARD' | 'SOFT';

/**
 * 约束定义
 */
export interface Constraint {
  id: string;
  type: ConstraintType;
  hardness: ConstraintHardness;
  description: string;
  value?: any;
  threshold?: any;
  violation_action: 'BLOCK' | 'ADJUST_REQUIRED' | 'NEED_USER_CONFIRM' | 'WARNING';
  evidence_refs?: string[];
}

/**
 * Trade-off 维度
 */
export type TradeoffDimension = 'TIME' | 'COST' | 'EXPERIENCE' | 'RISK';

/**
 * Trade-off 模型
 */
export interface TradeoffModel {
  dimension: TradeoffDimension;
  weight: number;           // 权重 (0-1)
  current_value: number;    // 当前值
  optimal_value: number;    // 最优值
  acceptable_range: { min: number; max: number };
  loss_function: string;    // 损失函数描述
}

/**
 * 不确定性概况
 */
export interface UncertaintyProfile {
  confidence: number;       // 置信度 (0-1)
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  uncertainty_sources: Array<{
    source: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    mitigation?: string;
  }>;
  risk_distribution?: {
    optimistic: number;
    expected: number;
    pessimistic: number;
  };
}

/**
 * 决策选项
 */
export interface DecisionOption {
  id: string;
  name: string;
  description: string;
  
  // Trade-off 分析
  tradeoffs: {
    time: { value: number; unit: string; impact: string };
    cost: { value: number; currency: string; impact: string };
    experience: { value: number; description: string };
    risk: { value: number; factors: string[] };
  };
  
  // 不确定性
  uncertainty: UncertaintyProfile;
  
  // 证据
  evidence_refs: string[];
  
  // 约束满足情况
  constraint_satisfaction: Array<{
    constraint_id: string;
    satisfied: boolean;
    violation_severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    repair_suggestion?: string;
  }>;
  
  // 综合评分
  score: number;
  ranking?: number;
}

/**
 * Decision Node - 决策节点
 */
export interface DecisionNode {
  id: string;
  type: 'ROOT' | 'BRANCH' | 'LEAF';
  name: string;
  description: string;
  
  // 上下文
  context: {
    destination?: string;
    date_range?: { start: string; end: string };
    travelers?: { count: number; profile: string };
    current_phase: string;
    parent_node_id?: string;
  };
  
  // 约束系统
  constraints: {
    hard: Constraint[];
    soft: Constraint[];
  };
  
  // 偏好
  preferences: {
    pace: 'SLOW' | 'BALANCED' | 'FAST';
    priority: TradeoffDimension;
    risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    custom?: Record<string, any>;
  };
  
  // 选项
  options: DecisionOption[];
  
  // Trade-off 模型
  tradeoff_model: TradeoffModel[];
  
  // 不确定性
  overall_uncertainty: UncertaintyProfile;
  
  // 决策结果
  decision?: {
    selected_option_id: string;
    reasoning: string;
    alternatives_considered: string[];
    user_judgment_required?: Array<{
      question: string;
      options: string[];
      default?: string;
      impact: string;
    }>;
  };
  
  // 子节点
  children?: DecisionNode[];
  
  // 元数据
  metadata: {
    created_at: string;
    updated_at: string;
    decided_at?: string;
    decided_by?: 'SYSTEM' | 'USER';
    version: number;
  };
}

/**
 * 决策树
 */
export interface DecisionTree {
  root: DecisionNode;
  total_nodes: number;
  decided_nodes: number;
  pending_nodes: number;
  blocked_nodes: number;
  requires_user_input: boolean;
  user_judgment_points: Array<{
    node_id: string;
    question: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

/**
 * 多方案比较矩阵
 */
export interface ComparisonMatrix {
  plans: Array<{
    plan_id: string;
    name: string;
    summary: string;
  }>;
  dimensions: TradeoffDimension[];
  matrix: Array<{
    dimension: TradeoffDimension;
    values: Array<{
      plan_id: string;
      value: number;
      display: string;
      is_best: boolean;
    }>;
  }>;
  recommendation: {
    plan_id: string;
    confidence: number;
    reasoning: string;
  };
}

/**
 * 决策输出
 */
export interface DecisionOutput {
  decision_node: DecisionNode;
  ranked_plans: Array<{
    plan: DecisionOption;
    rank: number;
    uncertainty: UncertaintyProfile;
    tradeoffs: Record<TradeoffDimension, { value: number; impact: string }>;
    what_you_pay_for: string;
    what_you_get: string;
  }>;
  comparison: ComparisonMatrix;
  user_judgment_required: Array<{
    question: string;
    context: string;
    options: Array<{ id: string; label: string; impact: string }>;
    recommendation?: string;
  }>;
  evidence_summary: {
    total_evidence: number;
    verified: number;
    unverified: number;
    assumptions: number;
  };
}
