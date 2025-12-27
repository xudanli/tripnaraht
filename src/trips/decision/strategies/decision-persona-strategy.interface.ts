// src/trips/decision/strategies/decision-persona-strategy.interface.ts
/**
 * Decision Persona Strategy Contract
 * 
 * 决策人格策略契约
 * 
 * 每个决策人格是一个独立策略（Strategy）
 * 统一输入：WorldModel + RoutePlanDraft
 * 统一输出：DecisionResult
 */

import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult, DecisionPersona } from '../shared/decision-result.types';

/**
 * 决策人格策略接口
 * 
 * 所有决策人格策略必须实现此接口
 */
export interface DecisionPersonaStrategy {
  /** 人格名称（只读） */
  readonly personaName: DecisionPersona;

  /**
   * 评估计划
   * 
   * @param world 世界模型上下文
   * @param plan 路线计划草案
   * @returns 决策结果
   */
  evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult>;
}

