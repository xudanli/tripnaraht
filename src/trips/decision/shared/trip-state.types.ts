// src/trips/decision/shared/trip-state.types.ts
/**
 * TripState - 全局行程状态（闭环状态机）
 * 
 * 设计原则：
 * - 统一的全局状态管理
 * - 支持闭环优化体系
 * - 记录决策日志和拒绝日志
 */

import { WorldModelContext } from './world-model.types';
import { TripPlan } from '../plan-model';
import { StrategyMode, StrategyParams } from '../strategy/types/strategy-mode.types';
import { PlanningPhase } from '../orchestration/langgraph-orchestrator.interface';
import { TravelReadinessResult } from '../readiness/types/readiness-checklist.types';

/**
 * 决策日志条目
 */
export interface DecisionLogEntry {
  /** 时间戳 */
  timestamp: string;
  
  /** Agent 名称（Abu / Dr.Dre / Neptune） */
  agent: string;
  
  /** 动作类型 */
  action: 'ALLOW' | 'ADJUST' | 'REJECT' | 'REPLACE';
  
  /** 原因代码 */
  reasonCode: string;
  
  /** 详细说明 */
  explanation: string;
  
  /** 相关数据 */
  payload?: Record<string, any>;
}

/**
 * 全局行程状态
 */
export interface TripState {
  /** 用户意图 */
  user_intent: string;
  
  /** 策略模式 */
  strategy_mode?: StrategyMode;
  
  /** 策略参数 */
  strategy_params?: StrategyParams;
  
  /** 世界模型上下文 */
  world: WorldModelContext;
  
  /** 规划阶段 */
  planning_phase: PlanningPhase;
  
  /** 决策日志 */
  decision_log: DecisionLogEntry[];
  
  /** 拒绝日志（Abu 硬违规记录） */
  rejection_log: string[];
  
  /** 计划（如果已生成） */
  plan: TripPlan | null;
  
  /** 准备度检查结果 */
  readiness?: TravelReadinessResult;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 创建初始 TripState
 */
export function createInitialTripState(
  userIntent: string,
  world: WorldModelContext,
  strategyMode?: StrategyMode
): TripState {
  return {
    user_intent: userIntent,
    strategy_mode: strategyMode,
    world,
    planning_phase: 'DRAFTING',
    decision_log: [],
    rejection_log: [],
    plan: null,
  };
}

/**
 * 检查是否可以进入下一个阶段
 */
export function canTransitionToPhase(
  currentPhase: PlanningPhase,
  targetPhase: PlanningPhase
): boolean {
  const phaseOrder: PlanningPhase[] = ['DRAFTING', 'SAFETY_CHECK', 'PACING_ADJUSTMENT', 'FINALIZING'];
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const targetIndex = phaseOrder.indexOf(targetPhase);
  
  // 允许向后回退（Abu 硬违规时）
  if (targetIndex < currentIndex) {
    return true;
  }
  
  // 允许向前推进（按顺序）
  return targetIndex === currentIndex + 1 || targetIndex === currentIndex;
}

