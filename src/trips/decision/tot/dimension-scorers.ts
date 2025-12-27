// src/trips/decision/tot/dimension-scorers.ts

/**
 * 五维度评分函数实现
 * 
 * 每个维度都归一化到 [0, 1]，并输出可解释的 metrics
 */

import { TripWorldState } from '../world-model';
import { TripPlan, PlanSlot } from '../plan-model';
import { OptimizationResult, DropReasonCode } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { ActivityCandidate, RiskLevel } from '../world-model';
import { extractActivityCandidatesFromPlan, getAllActivityCandidates } from './candidate-helper';
import { COST_CONSTANTS, RISK_CONSTANTS, PREF_CONSTANTS, TIME_CONSTANTS, REQ_CONSTANTS, HARD_GATE_CONSTANTS } from './scoring-constants';

// clamp01 已移至 score-result.ts，这里保留以保持向后兼容
// 实际应该从 score-result.ts 导入
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 工具函数：将值限制在 [min, max] 区间
 */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/**
 * 成本得分 S_cost
 * 
 * 核心：预算利用率 + 超预算惩罚 + 时间-金钱 tradeoff
 */
export function scoreCost(
  world: TripWorldState,
  plan: TripPlan,
  optimizationResult?: OptimizationResult,
  valueOfTimePerMin: number = 0
): { score: number; metrics: Record<string, number> } {
  const metrics: Record<string, number> = {};

  // 1. 计算总成本
  let totalCost = plan.metrics?.estTotalCost ?? 0;
  if (totalCost === 0) {
    // 如果没有预估成本，从计划中的活动计算
    const activityMap = extractActivityCandidatesFromPlan(world, plan);
    for (const { candidate } of activityMap.values()) {
      if (candidate.cost?.amount) {
        // 简单累加，实际可能需要考虑单位（per_person vs per_booking）
        totalCost += candidate.cost.amount;
      }
    }
  }

  const budget = world.context.budget?.amount;
  const budgetStyle = world.context.budget?.style ?? 'medium';

  // 2. 时间价值换算（隐性成本）
  const travelMin = plan.metrics?.estTravelMinutes ?? 0;
  const waitMin = optimizationResult?.summary.total_wait_min ?? 0;
  const timeCost = valueOfTimePerMin * (travelMin + waitMin);
  const effectiveCost = totalCost + timeCost;

  metrics.cost = totalCost;
  metrics.effectiveCost = effectiveCost;
  metrics.timeCost = timeCost;
  metrics.travelMin = travelMin;
  metrics.waitMin = waitMin;

  // 3. 计算预算占比
  if (!budget) {
    // 没有预算时，用参考成本估算
    const days = world.context.durationDays;
    const refCostPerDay = budgetStyle === 'low' ? 50 : budgetStyle === 'high' ? 300 : 150;
    const refCost = refCostPerDay * days;
    const ratio = effectiveCost / refCost;
    metrics.costRatio = ratio;
    metrics.overBudgetPenalty = 0;
    // 成本越低越好（但不要太低，可能牺牲体验）
    const score = clamp01(1 - ratio * 0.3);
    return { score, metrics };
  }

  const ratio = effectiveCost / budget;
  metrics.costRatio = ratio;
  metrics.budget = budget;

  // 4. 分段惩罚（使用常量）
  let score: number;
  if (ratio <= COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN) {
    // 太省钱略扣（可能牺牲体验）
    score = 1.0 - COST_CONSTANTS.TOO_SAVE_PENALTY * ((COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN - ratio) / COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN);
    metrics.overBudgetPenalty = 0;
  } else if (ratio <= COST_CONSTANTS.IDEAL_BUDGET_RATIO_MAX) {
    // 理想区间缓慢下降
    const range = COST_CONSTANTS.IDEAL_BUDGET_RATIO_MAX - COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN;
    score = 1.0 - COST_CONSTANTS.IDEAL_DECLINE_FACTOR * ((ratio - COST_CONSTANTS.IDEAL_BUDGET_RATIO_MIN) / range);
    metrics.overBudgetPenalty = 0;
  } else {
    // 超预算指数惩罚
    const overRatio = ratio - 1.0;
    score = Math.exp(-COST_CONSTANTS.OVER_BUDGET_PENALTY_K * overRatio);
    metrics.overBudgetPenalty = overRatio;
  }

  return { score: clamp01(score), metrics };
}

/**
 * 风险得分 S_risk
 * 
 * 违约风险 + 鲁棒性
 */
export function scoreRisk(
  world: TripWorldState,
  plan: TripPlan,
  optimizationResult?: OptimizationResult
): { score: number; metrics: Record<string, number> } {
  const metrics: Record<string, number> = {};

  // (A) 活动级风险
  const activityRisks: number[] = [];
  const activityMap = extractActivityCandidatesFromPlan(world, plan);
  
  for (const { candidate } of activityMap.values()) {
    const riskLevel = candidate.riskLevel;
    const weatherSensitivity = candidate.weatherSensitivity;
    const inventoryRisk = candidate.inventoryRisk;
    const bookingDifficulty = candidate.bookingDifficulty;
    const requiresBooking = candidate.requiresBooking;

    if (riskLevel || weatherSensitivity !== undefined || inventoryRisk !== undefined) {
      const riskLevelScore = riskLevel === 'low' ? 0.2 : riskLevel === 'medium' ? 0.5 : riskLevel === 'high' ? 0.85 : 0.5;
      const weatherScore = (weatherSensitivity ?? 0) / 3;
      const inventoryScore = inventoryRisk ? (inventoryRisk - 1) / 4 : 0;
      const bookingScore = bookingDifficulty ? (bookingDifficulty - 1) / 4 : 0;
      const bookingPressure = requiresBooking && (inventoryRisk ?? 0) >= 4 ? 0.2 : 0;

      const activityRisk = 0.4 * riskLevelScore +
        0.25 * weatherScore +
        0.2 * inventoryScore +
        0.1 * bookingScore +
        0.05 * bookingPressure;
      activityRisks.push(activityRisk);
    }
  }

  const avgActivityRisk = activityRisks.length > 0
    ? activityRisks.reduce((a, b) => a + b, 0) / activityRisks.length
    : 0.3; // 默认中等风险

  metrics.avgActivityRisk = avgActivityRisk;

  // (B) 计划级风险（紧张度）
  let tightness = 0.5; // 默认中等紧张
  let slackMin = 60; // 默认 slack

  if (optimizationResult) {
    const top3Slack = optimizationResult.robustness?.top3_min_slack_nodes ?? [];
    if (top3Slack.length > 0) {
      slackMin = Math.min(...top3Slack.map((n: { slack_min: number }) => n.slack_min));
    }

    const criticalWindows = optimizationResult.diagnostics?.critical_windows ?? [];
    if (criticalWindows.length > 0) {
      const minSlackClose = Math.min(...criticalWindows.map((w: { slack_to_close_min: number }) => w.slack_to_close_min));
      slackMin = Math.min(slackMin, minSlackClose);
    }

    // slack < 30 线性变差（使用常量）
    tightness = clamp01((RISK_CONSTANTS.SLACK_THRESHOLD_MIN - slackMin) / RISK_CONSTANTS.SLACK_THRESHOLD_MIN);
  }

  metrics.slackMin = slackMin;
  metrics.tightness = tightness;

  // (C) 鲁棒性风险等级
  const robustnessRiskLevel = optimizationResult?.robustness?.risk_level;
  const robustRiskScore = robustnessRiskLevel === 'low' ? 0.2 :
    robustnessRiskLevel === 'medium' ? 0.5 : 0.85;

  metrics.robustRiskScore = robustRiskScore;

  // (D) 合成风险指数（使用常量权重）
  const riskIndex = RISK_CONSTANTS.ACTIVITY_RISK_WEIGHT * avgActivityRisk +
    RISK_CONSTANTS.TIGHTNESS_WEIGHT * tightness +
    RISK_CONSTANTS.ROBUST_RISK_WEIGHT * robustRiskScore +
    RISK_CONSTANTS.BOOKING_PRESSURE_WEIGHT * 0.3; // bookingPressure 简化

  metrics.riskIndex = riskIndex;

  // (E) 根据用户风险容忍度调整
  const userRiskTolerance = world.context.preferences.riskTolerance;
  const mult = userRiskTolerance === 'low' ? 1.25 :
    userRiskTolerance === 'high' ? 0.85 : 1.0;

  let sRiskBase = clamp01(1 - mult * riskIndex);
  metrics.sRiskBase = sRiskBase;

  // (F) 鲁棒性加成
  const buffer = optimizationResult?.robustness?.total_buffer_minutes ?? 0;
  const robustnessScore = plan.metrics?.robustnessScore ?? 0.5;

  const sRobust = clamp01(0.6 * robustnessScore + 0.4 * (1 - Math.exp(-buffer / RISK_CONSTANTS.BUFFER_HALF_LIFE_MIN)));

  metrics.buffer = buffer;
  metrics.robustnessScore = robustnessScore;
  metrics.sRobust = sRobust;

  // 最终合成（使用常量权重）
  const score = RISK_CONSTANTS.RISK_BASE_WEIGHT * sRiskBase + RISK_CONSTANTS.ROBUST_BOOST_WEIGHT * sRobust;

  return { score: clamp01(score), metrics };
}

/**
 * 偏好得分 S_pref
 * 
 * 意图匹配 + 体验质量 + 多样性惩罚
 */
export function scorePref(
  world: TripWorldState,
  plan: TripPlan,
  tagAffinity: Record<string, number> = {},
  diversityPenalty: number = 0.1,
  mustSeeBoost: number = 1.5
): { score: number; metrics: Record<string, number> } {
  const metrics: Record<string, number> = {};

  const userIntents = world.context.preferences.intents;
  const dislikeTags = world.context.preferences.dislikeTags ?? [];

  // (A) 意图匹配
  const intentMatches: number[] = [];
  let dislikeHitCount = 0;
  let totalSlots = 0;

  const activityMap = extractActivityCandidatesFromPlan(world, plan);
  
  for (const { candidate, slot } of activityMap.values()) {
    if (slot.type !== 'transport' && slot.type !== 'rest') {
      totalSlots++;
      const intentTags = candidate.intentTags ?? [];
      const qualityScore = candidate.qualityScore;
      const uniquenessScore = candidate.uniquenessScore;
      const mustSee = candidate.mustSee;

      // 检查 dislike tags
      const hasDislike = intentTags.some(tag => dislikeTags.includes(tag));
      if (hasDislike) {
        dislikeHitCount++;
      }

      // 计算意图匹配度
      let matchSum = 0;
      let intentSum = 0;
      for (const tag of intentTags) {
        const userWeight = userIntents[tag] ?? 0;
        const affinity = tagAffinity[tag] ?? 1.0;
        matchSum += userWeight * affinity;
        intentSum += userWeight;
      }
      const intentMatch = intentSum > 0 ? matchSum / intentSum : 0.5;
      intentMatches.push(intentMatch);
    }
  }

  const avgIntentMatch = intentMatches.length > 0
    ? intentMatches.reduce((a, b) => a + b, 0) / intentMatches.length
    : 0.5;

  const dislikeHitRate = totalSlots > 0 ? dislikeHitCount / totalSlots : 0;

  metrics.avgIntentMatch = avgIntentMatch;
  metrics.dislikeHitRate = dislikeHitRate;

  const sIntent = clamp01(avgIntentMatch - PREF_CONSTANTS.DISLIKE_PENALTY * dislikeHitRate);
  metrics.sIntent = sIntent;

  // (B) 体验质量
  const qualityScores: number[] = [];
  const uniquenessScores: number[] = [];
  let mustSeeCount = 0;
  let mustSeeTotal = 0;

  // 从候选池统计
  for (const { candidate } of activityMap.values()) {
    if (candidate.qualityScore !== undefined) {
      qualityScores.push(candidate.qualityScore);
    }
    if (candidate.uniquenessScore !== undefined) {
      uniquenessScores.push(candidate.uniquenessScore);
    }
    if (candidate.mustSee) {
      mustSeeCount++;
    }
    // 统计所有 mustSee 候选（包括未选中的）
    // 这里简化处理，只统计已选中的
  }

  // 统计所有 mustSee 候选（从所有候选池）
  for (const date in world.candidatesByDate) {
    const candidates = world.candidatesByDate[date];
    for (const candidate of candidates) {
      if (candidate.mustSee) {
        mustSeeTotal++;
      }
    }
  }

  const avgQuality = qualityScores.length > 0
    ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
    : 0.6;
  const avgUniqueness = uniquenessScores.length > 0
    ? uniquenessScores.reduce((a, b) => a + b, 0) / uniquenessScores.length
    : 0.5;

  const sQuality = clamp01(PREF_CONSTANTS.QUALITY_SCORE_WEIGHT * avgQuality + PREF_CONSTANTS.UNIQUENESS_SCORE_WEIGHT * avgUniqueness);
  metrics.sQuality = sQuality;

  const mustSeeCoveredRatio = mustSeeTotal > 0 ? mustSeeCount / mustSeeTotal : 1.0;
  const sMust = clamp01(mustSeeCoveredRatio);
  metrics.mustSeeCoveredRatio = mustSeeCoveredRatio;

  // (C) 合成偏好得分（使用常量权重）
  let sPref = clamp01(PREF_CONSTANTS.INTENT_WEIGHT * sIntent + PREF_CONSTANTS.QUALITY_WEIGHT * sQuality + PREF_CONSTANTS.MUST_SEE_WEIGHT * sMust);

  // (D) 多样性惩罚
  // 统计 tags 分布
  const tagCounts: Record<string, number> = {};
  for (const { candidate } of activityMap.values()) {
    const tags = candidate.intentTags ?? [];
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  const totalTagCount = Object.values(tagCounts).reduce((a, b) => a + b, 0);
  const maxTagShare = totalTagCount > 0
    ? Math.max(...Object.values(tagCounts)) / totalTagCount
    : 0;

  const divPenalty = diversityPenalty * Math.max(0, (maxTagShare - PREF_CONSTANTS.DIVERSITY_THRESHOLD) / PREF_CONSTANTS.DIVERSITY_PENALTY_DENOM);
  sPref = clamp01(sPref - divPenalty);

  metrics.maxTagShare = maxTagShare;
  metrics.divPenalty = divPenalty;

  return { score: clamp01(sPref), metrics };
}

/**
 * 时间窗得分 S_time
 * 
 * 利用率 + 等待/旅行惩罚 + 关键时间窗紧张度
 */
export function scoreTime(
  world: TripWorldState,
  plan: TripPlan,
  optimizationResult?: OptimizationResult,
  travelWeight: number = 1.0,
  waitWeight: number = 1.5
): { score: number; metrics: Record<string, number> } {
  const metrics: Record<string, number> = {};

  if (!optimizationResult) {
    // 如果没有优化结果，使用计划的预估值
    const travelMin = plan.metrics?.estTravelMinutes ?? 0;
    const activeMin = plan.metrics?.estActiveMinutes ?? 0;
    const dayStart = world.policies?.dayStart ?? '08:00';
    const dayEnd = world.policies?.dayEnd ?? '22:00';

    // 简化计算（使用常量）
    const dayMin = HARD_GATE_CONSTANTS.DEFAULT_DAY_DURATION_MIN;
    const util = activeMin / dayMin;
    const sUtil = clamp01((util - TIME_CONSTANTS.UTIL_THRESHOLD_MIN) / TIME_CONSTANTS.UTIL_THRESHOLD_MIN);
    const sFlow = clamp01(1 - (travelMin / dayMin) * travelWeight);
    const sWindow = 0.8; // 默认值

    metrics.travelMin = travelMin;
    metrics.activeMin = activeMin;
    metrics.util = util;
    metrics.sUtil = sUtil;
    metrics.sFlow = sFlow;
    metrics.sWindow = sWindow;

    const score = TIME_CONSTANTS.UTIL_WEIGHT * sUtil + TIME_CONSTANTS.FLOW_WEIGHT * sFlow + TIME_CONSTANTS.WINDOW_WEIGHT * sWindow;
    return { score: clamp01(score), metrics };
  }

  const summary = optimizationResult.summary;
  const travel = summary.total_travel_min;
  const wait = summary.total_wait_min;
  const service = summary.total_service_min;
  const day = summary.total_day_min;

  metrics.travelMin = travel;
  metrics.waitMin = wait;
  metrics.serviceMin = service;
  metrics.dayMin = day;

  // (A) 利用率（使用常量）
  const util = day > 0 ? service / day : 0;
  const sUtil = clamp01((util - TIME_CONSTANTS.UTIL_THRESHOLD_MIN) / TIME_CONSTANTS.UTIL_THRESHOLD_MIN); // util>=0.70 得分接近1
  metrics.util = util;
  metrics.sUtil = sUtil;

  // (B) 等待/旅行惩罚
  const travelRatio = day > 0 ? travel / day : 0;
  const waitRatio = day > 0 ? wait / day : 0;
  const pen = travelWeight * travelRatio + waitWeight * waitRatio;
  const sFlow = clamp01(1 - pen);
  metrics.travelRatio = travelRatio;
  metrics.waitRatio = waitRatio;
  metrics.sFlow = sFlow;

  // (C) 关键时间窗紧张度
  const criticalWindows = optimizationResult.diagnostics?.critical_windows ?? [];
  let slackCloseMin = 60; // 默认值
  if (criticalWindows.length > 0) {
    slackCloseMin = Math.min(...criticalWindows.map((w: { slack_to_close_min: number }) => w.slack_to_close_min));
  }
  const sWindow = clamp01(slackCloseMin / TIME_CONSTANTS.CRITICAL_WINDOW_SLACK_MIN); // >=30min => 1
  metrics.slackCloseMin = slackCloseMin;
  metrics.sWindow = sWindow;

  // 合成（使用常量权重）
  const score = TIME_CONSTANTS.UTIL_WEIGHT * sUtil + TIME_CONSTANTS.FLOW_WEIGHT * sFlow + TIME_CONSTANTS.WINDOW_WEIGHT * sWindow;

  return { score: clamp01(score), metrics };
}

/**
 * 必达点得分 S_req
 * 
 * 覆盖率 + 丢弃惩罚 & 奖励 + 优先级保护
 */
export function scoreReq(
  world: TripWorldState,
  plan: TripPlan,
  optimizationResult?: OptimizationResult,
  dropPenaltyWeight: number = 1.0,
  rewardWeight: number = 1.0
): { score: number; metrics: Record<string, number> } {
  const metrics: Record<string, number> = {};

  // (A) 硬节点覆盖率
  // 统计计划中的硬节点
  let visitedHard = 0;
  let totalHard = 0;
  let visitedLocked = 0;
  let totalLocked = 0;
  let visitedCore = 0;
  let totalCore = 0;

  // 从计划中统计
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.locked) {
        totalLocked++;
        if (slot.poiId) {
          visitedLocked++;
        }
      }
      if (slot.priorityTag === 'anchor' || slot.priorityTag === 'core') {
        if (slot.priorityTag === 'anchor') {
          totalHard++;
          if (slot.poiId) {
            visitedHard++;
          }
        } else {
          totalCore++;
          if (slot.poiId) {
            visitedCore++;
          }
        }
      }
    }
  }

  // 从 anchors 统计
  const anchors = world.context.anchors;
  if (anchors) {
    const fixedEvents = anchors.fixedEvents ?? [];
    totalHard += fixedEvents.length;
    // 检查计划中是否包含这些固定事件（简化处理）
  }

  const hardCovered = totalHard > 0 ? visitedHard / totalHard : 1.0;
  metrics.hardCovered = hardCovered;
  metrics.visitedHard = visitedHard;
  metrics.totalHard = totalHard;

  // (B) 丢弃惩罚 & 奖励
  let loss = 0;
  let gain = 0;

  if (optimizationResult) {
    const dropped = optimizationResult.dropped ?? [];
    for (const node of dropped) {
      loss += node.penalty * dropPenaltyWeight;
    }

    // 从 route 中统计奖励（简化处理）
    // 实际应该从 PlanNode.constraints.reward 获取
  }

  // 归一化 scale（避免奖励爆炸，使用常量）
  const scale = Math.max(REQ_CONSTANTS.NORMALIZE_SCALE_MIN, loss + gain);
  const sValue = clamp01((gain - loss) / scale + 0.5);

  metrics.dropLoss = loss;
  metrics.rewardGain = gain;
  metrics.sValue = sValue;

  // (C) 优先级保护
  let priorityLoss = 0;
  if (optimizationResult) {
    const dropped = optimizationResult.dropped ?? [];
    // 从 dropped 节点的 explanation.facts 中尝试获取优先级信息
    // 或者从原始 PlanNode 中获取（需要传入原始请求）
    // 这里简化处理：如果 dropped 节点有高 penalty，认为可能是高优先级
    let droppedPriority12 = 0;
    let totalPriority12 = 0;
    
    // 统计计划中的高优先级节点（priority <= 2）
    // 简化：假设 locked 或 anchor 都是高优先级
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (slot.locked || slot.priorityTag === 'anchor') {
          totalPriority12++;
        }
      }
    }
    
    // 检查 dropped 节点中是否有高优先级
    for (const node of dropped) {
      // 如果 penalty 很高，可能是高优先级（使用常量）
      if (node.penalty > REQ_CONSTANTS.HIGH_PENALTY_THRESHOLD) {
        droppedPriority12++;
      }
    }
    
    priorityLoss = totalPriority12 > 0 ? droppedPriority12 / totalPriority12 : 0;
  }

  metrics.priorityLoss = priorityLoss;

  // 合成（使用常量权重）
  const score = clamp01(REQ_CONSTANTS.COVERAGE_WEIGHT * hardCovered + REQ_CONSTANTS.VALUE_WEIGHT * sValue - REQ_CONSTANTS.PRIORITY_LOSS_WEIGHT * priorityLoss);

  return { score: clamp01(score), metrics };
}

