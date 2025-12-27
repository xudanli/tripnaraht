// src/trips/decision/tot/tot-evaluator.interface.ts

/**
 * ToT (Tree of Thoughts) 评分器接口
 * 
 * 用于评估候选思路的质量，支持硬门控和软评分
 */

import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult, PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanningPolicy } from '../../../planning-policy/interfaces/planning-policy.interface';
import { ToTScoreResult } from './score-result';

/**
 * 评分输入（最小集合）
 */
export interface ThoughtInput {
  /** 世界状态 */
  world: TripWorldState;
  /** 候选计划 */
  plan: TripPlan;
  /** 优化结果（可选，有则更准） */
  optimizationResult?: OptimizationResult;
  /** 规划策略（可选，用于获取权重参数） */
  planningPolicy?: PlanningPolicy;
  /** 规划请求（可选，用于获取目标权重） */
  planRequest?: PlanRequest;
}

/**
 * 搜索节点（ToT 扩展用）
 * 
 * 包含搜索树的结构信息，用于日志和回溯
 */
export interface ThoughtNode extends ThoughtInput {
  /** 节点 ID */
  id: string;
  /** 父节点 ID */
  parentId?: string;
  /** 深度 */
  depth: number;
  /** 生成此节点的操作 */
  operator?: 'RD_ENUM' | 'DRDRE_SCHEDULE' | 'NEPTUNE_REPAIR' | 'MIXED' | string;
  /** 生成理由 */
  rationale?: string;
}

/**
 * 思路评估器接口
 */
export interface ThoughtEvaluator {
  /**
   * 评估思路节点
   */
  evaluate(input: ThoughtInput): Promise<ToTScoreResult>;
}

