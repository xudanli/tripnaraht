// src/trips/decision/tot/tot-evaluator.service.ts

/**
 * ToT 评分器服务
 * 
 * 实现完整的 ToT 评分逻辑：硬门控 + 软评分
 */

import { Injectable, Logger } from '@nestjs/common';
import { ThoughtInput, ThoughtEvaluator } from './tot-evaluator.interface';
import { ToTScoreResult, createRejectedResult, createAllowedResult } from './score-result';
import { checkHardGate } from './hard-gate';
import { scoreCost, scoreRisk, scorePref, scoreTime, scoreReq } from './dimension-scorers';
import { computeFinalWeights } from './weight-computer';
import { getPolicyProfile } from '../config/objective-config';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult, PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { inferObjectiveWeights, extractDiagnostics } from './optimization-result-extractor';

@Injectable()
export class ToTEvaluatorService implements ThoughtEvaluator {
  private readonly logger = new Logger(ToTEvaluatorService.name);

  /**
   * 评估思路节点
   */
  async evaluate(input: ThoughtInput): Promise<ToTScoreResult> {
    const { world, plan, optimizationResult, planningPolicy, planRequest } = input;

    // 1. Hard Gate 检查
    const hardGateResult = checkHardGate(world, plan, optimizationResult, planningPolicy);
    
    if (!hardGateResult.allowed) {
      this.logger.debug(`思路节点被硬门控拒绝: ${hardGateResult.violations.join(', ')}`);
      return createRejectedResult(hardGateResult.violations);
    }

    // 2. 计算各维度得分
    const dims = this.computeDimensions(world, plan, optimizationResult, planningPolicy, planRequest);

    // 3. 计算权重
    const weights = this.computeWeights(world, plan, planRequest);

    // 4. 聚合总分
    const total = this.aggregateScore(dims, weights);

    // 5. 收集所有 metrics（包括诊断信息）
    const diagnostics = optimizationResult ? extractDiagnostics(optimizationResult) : undefined;
    
    const allMetrics: Record<string, number | string | boolean | object> = {
      ...dims.metrics,
      ...dims.costMetrics,
      ...dims.riskMetrics,
      ...dims.prefMetrics,
      ...dims.timeMetrics,
      ...dims.reqMetrics,
      ...(diagnostics ? {
        diagnostics: {
          minSlack: diagnostics.minSlack,
          riskLevel: diagnostics.riskLevel,
          totalBuffer: diagnostics.totalBuffer,
          criticalWindowsCount: diagnostics.criticalWindows.length,
        },
      } : {}),
    };

    this.logger.debug(
      `思路节点评分: score=${(total * 100).toFixed(1)}, ` +
      `dims=[cost:${dims.cost.toFixed(2)}, risk:${dims.risk.toFixed(2)}, ` +
      `pref:${dims.pref.toFixed(2)}, time:${dims.time.toFixed(2)}, req:${dims.req.toFixed(2)}]`
    );

    return createAllowedResult(
      {
        cost: dims.cost,
        risk: dims.risk,
        pref: dims.pref,
        time: dims.time,
        req: dims.req,
      },
      weights,
      total,
      allMetrics
    );
  }

  /**
   * 计算各维度得分
   */
  private computeDimensions(
    world: TripWorldState,
    plan: TripPlan,
    optimizationResult?: OptimizationResult,
    planningPolicy?: any, // PlanningPolicy type
    planRequest?: PlanRequest
  ): {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
    metrics: Record<string, any>;
    costMetrics: Record<string, number>;
    riskMetrics: Record<string, number>;
    prefMetrics: Record<string, number>;
    timeMetrics: Record<string, number>;
    reqMetrics: Record<string, number>;
  } {
    // 获取配置参数
    const pace = world.context.preferences.pace;
    const policyProfile = getPolicyProfile(pace);
    
    // 从 PlanningPolicy 获取参数（如果提供）
    const valueOfTimePerMin = planningPolicy?.weights?.valueOfTimePerMin ?? 0;
    const tagAffinity = planningPolicy?.weights?.tagAffinity ?? {};
    const diversityPenalty = planningPolicy?.weights?.diversityPenalty ?? 0.1;
    const mustSeeBoost = planningPolicy?.weights?.mustSeeBoost ?? 1.5;

    // 从 planRequest 获取权重（如果提供）
    // 如果没有 planRequest，尝试从 optimizationResult 推断
    let inferredWeights: PlanRequest['objective_weights'] | undefined;
    if (!planRequest?.objective_weights && optimizationResult) {
      inferredWeights = inferObjectiveWeights(optimizationResult, world);
      this.logger.debug(`从 OptimizationResult 推断权重: ${JSON.stringify(inferredWeights)}`);
    }

    const travelWeight = planRequest?.objective_weights?.travel ?? inferredWeights?.travel ?? 1.0;
    const waitWeight = planRequest?.objective_weights?.wait ?? inferredWeights?.wait ?? 1.5;
    const dropPenaltyWeight = planRequest?.objective_weights?.drop_penalty ?? inferredWeights?.drop_penalty ?? 1.0;
    const rewardWeight = planRequest?.objective_weights?.reward ?? inferredWeights?.reward ?? 1.0;

    // 成本维度
    const costResult = scoreCost(world, plan, optimizationResult, valueOfTimePerMin);

    // 风险维度
    const riskResult = scoreRisk(world, plan, optimizationResult);

    // 偏好维度
    const prefResult = scorePref(world, plan, tagAffinity, diversityPenalty, mustSeeBoost);

    // 时间维度
    const timeResult = scoreTime(world, plan, optimizationResult, travelWeight, waitWeight);

    // 必达点维度
    const reqResult = scoreReq(world, plan, optimizationResult, dropPenaltyWeight, rewardWeight);

    return {
      cost: costResult.score,
      risk: riskResult.score,
      pref: prefResult.score,
      time: timeResult.score,
      req: reqResult.score,
      metrics: {},
      costMetrics: costResult.metrics,
      riskMetrics: riskResult.metrics,
      prefMetrics: prefResult.metrics,
      timeMetrics: timeResult.metrics,
      reqMetrics: reqResult.metrics,
    };
  }

  /**
   * 计算权重
   */
  private computeWeights(
    world: TripWorldState,
    plan: TripPlan,
    planRequest?: PlanRequest
  ): {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
  } {
    const pace = world.context.preferences.pace;
    const policyProfile = getPolicyProfile(pace);
    const objectiveWeights = policyProfile.objectiveWeights;

    // 使用传入的 planRequest（如果提供）
    const weights = computeFinalWeights(objectiveWeights, world, plan, planRequest);

    return weights;
  }

  /**
   * 聚合总分
   */
  private aggregateScore(
    dims: {
      cost: number;
      risk: number;
      pref: number;
      time: number;
      req: number;
    },
    weights: {
      cost: number;
      risk: number;
      pref: number;
      time: number;
      req: number;
    }
  ): number {
    const sum = weights.cost + weights.risk + weights.pref + weights.time + weights.req;
    if (sum === 0) {
      return 0;
    }

    const total =
      (weights.cost * dims.cost +
        weights.risk * dims.risk +
        weights.pref * dims.pref +
        weights.time * dims.time +
        weights.req * dims.req) /
      sum;

    return Math.max(0, Math.min(1, total));
  }
}

