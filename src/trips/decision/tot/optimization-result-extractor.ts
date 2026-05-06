// src/trips/decision/tot/optimization-result-extractor.ts

/**
 * 从 OptimizationResult 中提取 PlanRequest 信息
 * 
 * 用于增强评分器，当没有直接提供 PlanRequest 时，从优化结果中推断
 */

import { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { TripWorldState } from '../world-model';

/**
 * 从 OptimizationResult 中提取 PlanRequest 的权重信息
 * 
 * 注意：这是推断性的，实际应该从原始 PlanRequest 获取
 * 但如果没有，可以从 OptimizationResult 中提取一些信息
 */
export function extractPlanRequestFromResult(
  optimizationResult: OptimizationResult,
  _world: TripWorldState
): Partial<PlanRequest> {
  const extracted: Partial<PlanRequest> = {};

  // 1. 从 diagnostics 提取日界信息（如果有）
  const diagnostics = optimizationResult.diagnostics;
  if (diagnostics?.assumptions) {
    // 可以从 assumptions 中提取一些信息
    // 但日界通常需要从 world.policies 获取
  }

  // 2. 从 summary 提取时间统计（用于验证）
  const summary = optimizationResult.summary;
  if (summary) {
    // 这些信息已经在 dimension-scorers 中使用
    // 这里主要是为了完整性
  }

  // 3. 从 robustness 提取缓冲信息
  const robustness = optimizationResult.robustness;
  if (robustness) {
    // 缓冲信息已经在 risk 评分中使用
  }

  // 4. 从 dropped 节点提取 drop_penalty 信息
  const dropped = optimizationResult.dropped ?? [];
  if (dropped.length > 0) {
    // 可在此用 dropped 的 penalty 分布推断 objective_weights（当前返回空 Partial）
  }

  // 5. 从 route 提取 travel/wait 信息
  const route = optimizationResult.route ?? [];
  if (route.length > 0) {
    // travel 和 wait 信息已经在 summary 中
    // 这里可以用于验证或补充信息
  }

  return extracted;
}

/**
 * 从 OptimizationResult 中提取目标权重（推断）
 * 
 * 这是一个辅助函数，用于在没有 PlanRequest 时推断权重
 * 实际使用中应该优先使用真实的 PlanRequest
 */
export function inferObjectiveWeights(
  optimizationResult: OptimizationResult,
  _world: TripWorldState
): PlanRequest['objective_weights'] {
  const weights: PlanRequest['objective_weights'] = {};

  // 1. 从 dropped 节点推断 drop_penalty 权重
  const dropped = optimizationResult.dropped ?? [];
  if (dropped.length > 0) {
    const avgPenalty = dropped.reduce((sum, node) => sum + (node.penalty || 0), 0) / dropped.length;
    
    // 如果平均 penalty 很高（> 50），说明 drop_penalty 权重可能较高
    if (avgPenalty > 50) {
      weights.drop_penalty = 1.5; // 推断为较高权重
    } else if (avgPenalty > 20) {
      weights.drop_penalty = 1.2;
    } else {
      weights.drop_penalty = 1.0; // 默认
    }
  }

  // 2. 从 summary 推断 travel/wait 权重
  const summary = optimizationResult.summary;
  if (summary) {
    const travelRatio = summary.total_day_min > 0 
      ? summary.total_travel_min / summary.total_day_min 
      : 0;
    const waitRatio = summary.total_day_min > 0 
      ? summary.total_wait_min / summary.total_day_min 
      : 0;

    // 如果 travel 占比很高，说明 travel 权重可能较低（允许更多旅行）
    // 如果 wait 占比很高，说明 wait 权重可能较高（惩罚等待）
    if (waitRatio > 0.15) {
      weights.wait = 2.0; // 高等待，提高权重
    } else if (waitRatio > 0.10) {
      weights.wait = 1.5; // 默认
    } else {
      weights.wait = 1.0; // 低等待，降低权重
    }

    if (travelRatio > 0.30) {
      weights.travel = 0.8; // 高旅行，降低权重（允许更多旅行）
    } else {
      weights.travel = 1.0; // 默认
    }
  }

  // 3. 从 robustness 推断 reward 权重
  const robustness = optimizationResult.robustness;
  if (robustness) {
    const bufferRatio = summary && summary.total_day_min > 0
      ? robustness.total_buffer_minutes / summary.total_day_min
      : 0;

    // 如果缓冲时间占比高，说明可能更重视 reward（奖励访问更多节点）
    if (bufferRatio > 0.20) {
      weights.reward = 1.5; // 高缓冲，提高 reward 权重
    } else {
      weights.reward = 1.0; // 默认
    }
  }

  return weights;
}

/**
 * 从 OptimizationResult 中提取诊断信息（用于日志和调试）
 */
export function extractDiagnostics(
  optimizationResult: OptimizationResult
): {
  criticalWindows: Array<{ node_id: number; slack_to_close_min: number }>;
  minSlack: number;
  riskLevel: 'low' | 'medium' | 'high' | undefined;
  totalBuffer: number;
} {
  const diagnostics = optimizationResult.diagnostics;
  const robustness = optimizationResult.robustness;

  const criticalWindows = diagnostics?.critical_windows ?? [];
  const slackNodes = robustness?.top3_min_slack_nodes;
  const minSlack =
    slackNodes && slackNodes.length > 0
      ? Math.min(...slackNodes.map(n => n.slack_min))
      : 60; // 默认值

  return {
    criticalWindows,
    minSlack,
    riskLevel: robustness?.risk_level,
    totalBuffer: robustness?.total_buffer_minutes ?? 0,
  };
}

