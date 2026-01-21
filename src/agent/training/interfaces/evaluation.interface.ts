// src/agent/training/interfaces/evaluation.interface.ts

/**
 * 评测体系相关接口定义
 */

/**
 * 测试用例
 */
export interface TestCase {
  id: string;
  component: 'ROUTER' | 'GATE' | 'ITINERARY';
  input: Record<string, any>;
  expected_output?: Record<string, any>; // 期望输出（如果有ground truth）
  metadata?: {
    country_code?: string;
    season?: string;
    complexity?: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

/**
 * 测试用例结果
 */
export interface TestCaseResult {
  test_case_id: string;
  passed: boolean;
  actual_output: Record<string, any>;
  expected_output?: Record<string, any>;
  metrics: Record<string, number>;
  error?: string;
  latency_ms: number;
}

/**
 * Router评测结果
 */
export interface RouterEvalResult {
  accuracy: number; // 路线选择准确率
  coverage: number; // 覆盖率（能处理的测试用例比例）
  latency_p50: number; // P50延迟（毫秒）
  latency_p95: number; // P95延迟（毫秒）
  latency_p99: number; // P99延迟（毫秒）
  error_rate: number; // 错误率
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  detailed_results: TestCaseResult[];
}

/**
 * Gate评测结果
 */
export interface GateEvalResult {
  precision: number; // 精确率（高风险规划被正确阻止的比例）
  recall: number; // 召回率（高风险规划被识别的比例）
  false_positive_rate: number; // 误报率（低风险规划被错误阻止的比例）
  false_negative_rate: number; // 漏报率（高风险规划未被识别的比例）
  accuracy: number; // 准确率
  latency_p50: number;
  latency_p95: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  detailed_results: TestCaseResult[];
}

/**
 * Itinerary评测结果
 */
export interface ItineraryEvalResult {
  success_rate: number; // 规划成功率
  avg_plan_length: number; // 平均plan长度（天数）
  avg_complexity: number; // 平均复杂度
  executability_score: number; // 可执行性分数（0-1）
  user_satisfaction: number; // 用户满意度（模拟，0-1）
  avg_latency_ms: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  detailed_results: TestCaseResult[];
}

/**
 * 完整流程评测结果
 */
export interface FullPipelineEvalResult {
  router_result: RouterEvalResult;
  gate_result: GateEvalResult;
  itinerary_result: ItineraryEvalResult;
  end_to_end_success_rate: number; // 端到端成功率
  overall_score: number; // 总体分数（0-1）
  total_tests: number;
  passed_tests: number;
}

/**
 * OPE评估结果
 */
export interface OPEResult {
  method: 'IS' | 'DR' | 'WDR';
  estimated_reward: number; // 估计的reward
  confidence_interval: {
    lower: number;
    upper: number;
    confidence_level: number; // 置信水平（如0.95）
  };
  statistical_significance: {
    p_value: number;
    is_significant: boolean; // p < 0.05
  };
  sample_size: number;
  baseline_reward?: number; // baseline的reward（用于对比）
  improvement?: number; // 相对于baseline的改进
  metadata: Record<string, any>;
}

/**
 * OPE报告
 */
export interface OPEReport {
  model_version: string;
  baseline_version?: string;
  evaluation_date: string;
  results: {
    is: OPEResult;
    dr: OPEResult;
    wdr: OPEResult;
  };
  recommendation: {
    should_deploy: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
  };
}

/**
 * 回放对照结果
 */
export interface ReplayComparisonResult {
  baseline_version: string;
  new_policy_version: string;
  comparison_metrics: {
    success_rate: {
      baseline: number;
      new_policy: number;
      improvement: number;
    };
    avg_reward: {
      baseline: number;
      new_policy: number;
      improvement: number;
    };
    avg_latency_ms: {
      baseline: number;
      new_policy: number;
      change: number;
    };
  };
  statistical_significance: {
    p_value: number;
    is_significant: boolean;
  };
  total_trajectories: number;
  detailed_results: Array<{
    trajectory_id: string;
    baseline_result: Record<string, any>;
    new_policy_result: Record<string, any>;
    difference: Record<string, number>;
  }>;
}

/**
 * 回归门槛检查结果
 */
export interface RegressionGateResult {
  passed: boolean;
  checks: Array<{
    metric: string;
    threshold: number;
    actual_value: number;
    passed: boolean;
    message: string;
  }>;
  statistical_significance: {
    p_value: number;
    is_significant: boolean;
  };
  overall_score: number; // 0-1
  recommendation: {
    should_deploy: boolean;
    reasoning: string;
  };
}

/**
 * 回归门槛配置
 */
export interface RegressionGateConfig {
  success_rate_threshold: number; // 新策略 >= baseline * threshold
  avg_reward_threshold: number; // 新策略 >= baseline * threshold
  gate_false_positive_rate_threshold: number; // < threshold
  latency_p95_threshold: number; // <= baseline * threshold
  statistical_significance_level: number; // p < level
}
