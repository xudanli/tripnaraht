// src/trips/decision/tot/weight-computer.ts

/**
 * 权重计算与动态调整
 * 
 * 根据 pacing / riskTolerance / budgetStyle / anchors 动态调整权重
 */

import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { ObjectiveWeights } from '../config/objective-config';
import { PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { WEIGHT_ADJUST_CONSTANTS } from './scoring-constants';

/**
 * 五维度权重
 */
export interface DimensionWeights {
  cost: number;
  risk: number;
  pref: number;
  time: number;
  req: number;
}

/**
 * 计算基础权重（从 ObjectiveWeights 和 PlanRequest 映射）
 */
export function computeBaseWeights(
  objectiveWeights: ObjectiveWeights,
  planRequest?: PlanRequest
): DimensionWeights {
  const dayW = planRequest?.objective_weights ?? {};

  // 映射
  let w: DimensionWeights = {
    pref: objectiveWeights.satisfaction,
    risk: objectiveWeights.violationRisk + 0.5 * objectiveWeights.robustness,
    cost: objectiveWeights.cost,
    time: (dayW.travel ?? 1.0) + (dayW.wait ?? 1.5),
    req: (dayW.drop_penalty ?? 1.0) + 0.5 * (dayW.reward ?? 1.0),
  };

  return w;
}

/**
 * 应用动态调整
 */
export function applyDynamicAdjust(
  baseWeights: DimensionWeights,
  world: TripWorldState,
  plan: TripPlan
): DimensionWeights {
  let w = { ...baseWeights };

  const pace = world.context.preferences.pace;
  const riskTolerance = world.context.preferences.riskTolerance;
  const budgetStyle = world.context.budget?.style ?? 'medium';
  const anchors = world.context.anchors;

  // 1. Pacing 动态调整
  const pacingAdjust = WEIGHT_ADJUST_CONSTANTS.PACING_ADJUST;
  if (pace === 'relaxed') {
    w.pref += pacingAdjust.relaxed.pref;
    w.risk += pacingAdjust.relaxed.risk;
    w.time += pacingAdjust.relaxed.time;
  } else if (pace === 'intense') {
    w.time += pacingAdjust.intense.time;
    w.risk += pacingAdjust.intense.risk;
    w.cost += pacingAdjust.intense.cost;
  }

  // 2. RiskTolerance 动态调整
  const riskAdjust = WEIGHT_ADJUST_CONSTANTS.RISK_TOLERANCE_ADJUST;
  if (riskTolerance === 'low') {
    w.risk += riskAdjust.low.risk;
    w.req += riskAdjust.low.req;
    w.pref += riskAdjust.low.pref;
    w.time += riskAdjust.low.time;
  } else if (riskTolerance === 'high') {
    w.risk += riskAdjust.high.risk;
    w.pref += riskAdjust.high.pref;
    w.time += riskAdjust.high.time;
    w.cost += riskAdjust.high.cost;
  }

  // 3. BudgetStyle 动态调整
  const budgetAdjust = WEIGHT_ADJUST_CONSTANTS.BUDGET_STYLE_ADJUST;
  if (budgetStyle === 'low') {
    w.cost += budgetAdjust.low.cost;
    w.pref += budgetAdjust.low.pref;
    w.time += budgetAdjust.low.time;
  } else if (budgetStyle === 'high') {
    w.cost += budgetAdjust.high.cost;
    w.pref += budgetAdjust.high.pref;
    w.time += budgetAdjust.high.time;
    w.risk += budgetAdjust.high.risk;
  }

  // 4. 必达点强制保护（在归一化之前设置绝对最小值）
  const reqProtection = WEIGHT_ADJUST_CONSTANTS.REQ_PROTECTION;
  const hasAnchors = anchors && (
    (anchors.fixedEvents && anchors.fixedEvents.length > 0) ||
    (anchors.hotelLocationsByDate && Object.keys(anchors.hotelLocationsByDate).length > 0)
  );

  let hardNodeCount = 0;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.locked || slot.priorityTag === 'anchor') {
        hardNodeCount++;
      }
    }
  }

  // 计算当前权重总和（用于设置绝对最小值）
  const currentSum = w.cost + w.risk + w.pref + w.time + w.req;
  
  if (hasAnchors || hardNodeCount > 0) {
    // 设置绝对最小值（基于当前总和）
    const minReqAbsolute = reqProtection.minWeight * currentSum;
    w.req = Math.max(w.req, minReqAbsolute);
    
    if (hardNodeCount >= reqProtection.manyHardNodesThreshold) {
      const minReqManyAbsolute = reqProtection.minWeightWithManyHardNodes * currentSum;
      w.req = Math.max(w.req, minReqManyAbsolute);
    }
  }

  // 确保所有权重非负
  w.cost = Math.max(0, w.cost);
  w.risk = Math.max(0, w.risk);
  w.pref = Math.max(0, w.pref);
  w.time = Math.max(0, w.time);
  w.req = Math.max(0, w.req);

  return w;
}

/**
 * 归一化权重（使总和为 1）
 * 
 * 注意：此函数已移至 score-result.ts，保留此处以保持向后兼容
 * @deprecated 请使用 score-result.ts 中的 normalizeWeights
 */
export function normalizeWeights(weights: DimensionWeights): DimensionWeights {
  const sum = weights.cost + weights.risk + weights.pref + weights.time + weights.req;
  if (sum === 0) {
    // 如果总和为 0，使用均匀权重
    return {
      cost: 0.2,
      risk: 0.2,
      pref: 0.2,
      time: 0.2,
      req: 0.2,
    };
  }

  return {
    cost: weights.cost / sum,
    risk: weights.risk / sum,
    pref: weights.pref / sum,
    time: weights.time / sum,
    req: weights.req / sum,
  };
}

/**
 * 计算最终权重（包含所有调整）
 */
export function computeFinalWeights(
  objectiveWeights: ObjectiveWeights,
  world: TripWorldState,
  plan: TripPlan,
  planRequest?: PlanRequest
): DimensionWeights {
  const base = computeBaseWeights(objectiveWeights, planRequest);
  const adjusted = applyDynamicAdjust(base, world, plan);
  const normalized = normalizeWeights(adjusted);
  return normalized;
}

