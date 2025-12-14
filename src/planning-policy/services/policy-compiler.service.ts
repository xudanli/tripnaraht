// src/planning-policy/services/policy-compiler.service.ts

import { Injectable } from '@nestjs/common';
import {
  TravelerDto,
  UserContext,
  TripType,
  PlanningPolicy,
  PacingConfig,
  HardConstraints,
  SoftWeights,
  InterestProfile,
  MobilityProfile,
} from '../interfaces/planning-policy.interface';

/**
 * Mobility Profile 基础配置（从文档中的表格）
 */
const MOBILITY_BASE: Record<MobilityProfile, PacingConfig> = {
  [MobilityProfile.IRON_LEGS]: {
    hpMax: 100,
    regenRate: 0.5,
    walkSpeedMultiplier: 0.8,
    stairPenalty: 1.0,
    forcedRestIntervalMin: 180,
    terrainRules: {
      forbidStairs: false,
      wheelchairOnly: false,
      maxContinuousWalkMin: 60,
      maxDailyWalkMin: 240,
    },
  },
  [MobilityProfile.ACTIVE_SENIOR]: {
    hpMax: 80,
    regenRate: 0.4,
    walkSpeedMultiplier: 1.2,
    stairPenalty: 9999,
    forcedRestIntervalMin: 120,
    terrainRules: {
      forbidStairs: true,
      wheelchairOnly: false,
      maxContinuousWalkMin: 15,
      maxDailyWalkMin: 120,
    },
  },
  [MobilityProfile.CITY_POTATO]: {
    hpMax: 60,
    regenRate: 0.3,
    walkSpeedMultiplier: 1.0,
    stairPenalty: 1.5,
    forcedRestIntervalMin: 60,
    terrainRules: {
      forbidStairs: false,
      wheelchairOnly: false,
      maxContinuousWalkMin: 20,
      maxDailyWalkMin: 120,
    },
  },
  [MobilityProfile.LIMITED]: {
    hpMax: 40,
    regenRate: 0.2,
    walkSpeedMultiplier: 1.5,
    stairPenalty: 9999,
    forcedRestIntervalMin: 45,
    terrainRules: {
      forbidStairs: true,
      wheelchairOnly: true,
      maxContinuousWalkMin: 10,
      maxDailyWalkMin: 60,
    },
  },
};

/**
 * Mobility Profile 排名（越大越"弱"，用于木桶效应）
 */
function mobilityRank(m: MobilityProfile): number {
  switch (m) {
    case MobilityProfile.LIMITED:
      return 4;
    case MobilityProfile.ACTIVE_SENIOR:
      return 3;
    case MobilityProfile.CITY_POTATO:
      return 2;
    case MobilityProfile.IRON_LEGS:
      return 1;
    default:
      return 2; // 默认中等
  }
}

/**
 * 合并兴趣混合（加权融合，不是木桶）
 */
function mergeInterestMix(travelers: TravelerDto[]): Record<InterestProfile, number> {
  const sum = travelers.reduce((a, t) => a + (t.weight ?? 1), 0) || 1;
  const mix: Record<InterestProfile, number> = {
    [InterestProfile.ADULT]: 0,
    [InterestProfile.ELDERLY]: 0,
    [InterestProfile.CHILD]: 0,
  };

  for (const t of travelers) {
    mix[t.type] += (t.weight ?? 1) / sum;
  }

  return mix;
}

/**
 * 计算时间价值（元/分钟）
 * 
 * 文档的"1分钟=多少钱"的工程化落地
 */
function computeValueOfTimePerMin(
  ctx: UserContext,
  tripType: TripType,
  totalBudgetCny?: number,
  days?: number,
  people?: number
): number {
  // 默认按敏感度给一个区间中位数
  const basePerMin = (() => {
    if (ctx.budgetSensitivity === 'LOW') return 4; // 1分钟≈4元
    if (ctx.budgetSensitivity === 'HIGH') return 0.8; // 1分钟≈0.8元
    return 2; // MEDIUM：1分钟≈2元
  })();

  // tripType 调整
  const tripTypeMul: Record<TripType, number> = {
    BUSINESS: 1.4,
    LEISURE: 1.0,
    FAMILY: 0.8,
    BACKPACKING: 0.7,
  };

  // timeSensitivity 调整（时间越敏感，时间价值越高）
  const timeMul =
    ctx.timeSensitivity === 'HIGH' ? 1.3 : ctx.timeSensitivity === 'LOW' ? 0.85 : 1.0;

  // 如果有总预算/天数/人数，可微调（可选）
  const budgetPerPersonPerDay =
    totalBudgetCny && days && people ? totalBudgetCny / days / people : undefined;
  const budgetMul =
    budgetPerPersonPerDay && budgetPerPersonPerDay > 1500
      ? 1.15
      : budgetPerPersonPerDay && budgetPerPersonPerDay < 400
        ? 0.85
        : 1.0;

  return basePerMin * tripTypeMul[tripType] * timeMul * budgetMul;
}

/**
 * 构建标签亲和度（从兴趣混合推导）
 */
function buildTagAffinity(mix: Record<InterestProfile, number>): Record<string, number> {
  // 你可以把 tag 体系标准化（museum, nature, playground...）
  // 这里给默认模板：按 mix 加权叠加
  const base: Record<string, number> = {
    museum: 1.0,
    culture: 1.0,
    nature: 1.0,
    shopping: 1.0,
    playground: 1.0,
    indoor: 1.0,
    wheelchair: 1.0,
    stairs: 1.0,
    photoSpot: 1.0,
    interactive: 1.0,
  };

  // 成人：文化深度、photo
  base.museum += 0.3 * mix[InterestProfile.ADULT];
  base.culture += 0.35 * mix[InterestProfile.ADULT];
  base.photoSpot += 0.25 * mix[InterestProfile.ADULT];

  // 老人：室内、座椅友好（用 indoor 代替）、文化轻松
  base.indoor += 0.35 * mix[InterestProfile.ELDERLY];
  base.culture += 0.15 * mix[InterestProfile.ELDERLY];
  base.nature += 0.05 * mix[InterestProfile.ELDERLY];

  // 儿童：互动、游乐、室内/厕所方便
  base.playground += 0.6 * mix[InterestProfile.CHILD];
  base.interactive += 0.5 * mix[InterestProfile.CHILD];
  base.indoor += 0.2 * mix[InterestProfile.CHILD];

  return base;
}

/**
 * 画像编译器服务
 * 
 * 核心功能：将用户画像和上下文编译成统一的 PlanningPolicy
 */
@Injectable()
export class PolicyCompilerService {
  /**
   * 编译规划策略
   * 
   * 包含：木桶效应（mobility） + 兴趣融合（interest mix） + 场景上下文调参 + VOT 时间价值
   * 
   * @param args 编译参数
   * @returns 统一的规划策略
   */
  compilePlanningPolicy(args: {
    travelers: TravelerDto[];
    context: UserContext;
    tripType: TripType;
    totalBudgetCny?: number;
    days?: number;
    people?: number;
  }): PlanningPolicy {
    const { travelers, context: ctx, tripType } = args;

    // 1) 木桶效应：取最弱 mobility
    const worst =
      travelers
        .map((t) => t.mobilityTag)
        .sort((a, b) => mobilityRank(b) - mobilityRank(a))[0] ?? MobilityProfile.CITY_POTATO;

    const pacingBase = MOBILITY_BASE[worst];

    // 2) interest mix（不是木桶，走加权融合）
    const mix = mergeInterestMix(travelers);

    // 3) 约束：由 worst + 上下文推导
    const constraints: HardConstraints = {
      requireWheelchairAccess: ctx.hasLimitedMobility || worst === MobilityProfile.LIMITED,
      forbidStairs:
        worst === MobilityProfile.ACTIVE_SENIOR || worst === MobilityProfile.LIMITED,
      maxTransfers: ctx.hasElderly ? 1 : 2,
      maxSingleWalkMin: pacingBase.terrainRules.maxContinuousWalkMin,
      maxTotalWalkMinPerDay: pacingBase.terrainRules.maxDailyWalkMin,
      mustHaveRestroomEveryMin:
        mix[InterestProfile.CHILD] > 0 ? 90 : mix[InterestProfile.ELDERLY] > 0 ? 120 : 180,
    };

    // 4) 权重：统一给排序/路径/动态重排复用
    const vot = computeValueOfTimePerMin(
      ctx,
      tripType,
      args.totalBudgetCny,
      args.days,
      args.people
    );

    const riskTol = ctx.riskTolerance ?? 'MEDIUM';
    const stability = ctx.planStabilityPreference ?? 'MEDIUM';

    const weights: SoftWeights = {
      tagAffinity: buildTagAffinity(mix),
      diversityPenalty: 0.12,
      mustSeeBoost: 0.35,
      valueOfTimePerMin: vot,
      walkPainPerMin:
        worst === MobilityProfile.IRON_LEGS
          ? 0.6
          : worst === MobilityProfile.CITY_POTATO
            ? 1.0
            : 1.4,
      transferPain: 8,
      stairPain: constraints.forbidStairs ? 9999 : 6,
      crowdPainPerMin: 0.8,
      rainWalkMultiplier: ctx.isRaining ? 2.2 : 1.0,
      luggageTransitPenalty: ctx.hasLuggage || ctx.isMovingDay ? 18 : 0,
      elderlyTransferMultiplier: ctx.hasElderly ? 1.6 : 1.0,
      planChangePenalty: stability === 'HIGH' ? 18 : stability === 'LOW' ? 4 : 10,
      overtimePenaltyPerMin: riskTol === 'LOW' ? 3.0 : riskTol === 'HIGH' ? 1.2 : 2.0,
    };

    const policy: PlanningPolicy = {
      pacing: pacingBase,
      constraints,
      weights,
      context: ctx,
      derived: {
        groupInterestMix: mix,
        groupMobilityWorst: worst,
      },
    };

    return policy;
  }
}
