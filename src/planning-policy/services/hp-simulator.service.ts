// src/planning-policy/services/hp-simulator.service.ts

import { Injectable } from '@nestjs/common';
import { PlanningPolicy, MobilityProfile } from '../interfaces/planning-policy.interface';

/**
 * HP 状态
 */
export interface HpState {
  /** 当前 HP 值 */
  hp: number;
  /** 上次休息结束时间（分钟数） */
  lastRestAtMin: number;
  /** 上次"停下/坐下"时间（分钟数，可用于连续行走判断） */
  lastBreakAtMin: number;
}

/**
 * 疲劳参数
 */
export interface FatigueParams {
  /** 每分钟步行消耗 */
  walkHpPerMin: number;
  /** 排队/站立消耗（每分钟） */
  standHpPerMin: number;
  /** 每段楼梯消耗（或按台阶数） */
  stairsHpPerUnit: number;
  /** 超过连续行走阈值后的额外倍率 */
  continuousWalkPenalty: number;
}

/**
 * HP 模拟器服务
 * 
 * 核心功能：计算体力消耗和恢复
 */
@Injectable()
export class HpSimulatorService {
  /**
   * 根据画像获取默认疲劳参数
   */
  defaultFatigueParams(policy: PlanningPolicy): FatigueParams {
    const worst = policy.derived.groupMobilityWorst;

    // 按画像更精细地调参
    if (worst === MobilityProfile.IRON_LEGS) {
      return {
        walkHpPerMin: 0.25,
        standHpPerMin: 0.1,
        stairsHpPerUnit: 0.5,
        continuousWalkPenalty: 1.2,
      };
    }

    if (worst === MobilityProfile.CITY_POTATO) {
      return {
        walkHpPerMin: 0.45,
        standHpPerMin: 0.18,
        stairsHpPerUnit: 0.9,
        continuousWalkPenalty: 1.5,
      };
    }

    if (worst === MobilityProfile.ACTIVE_SENIOR) {
      return {
        walkHpPerMin: 0.55,
        standHpPerMin: 0.22,
        stairsHpPerUnit: 999, // 不能爬楼梯
        continuousWalkPenalty: 2.0,
      };
    }

    // LIMITED
    return {
      walkHpPerMin: 0.7,
      standHpPerMin: 0.25,
      stairsHpPerUnit: 999,
      continuousWalkPenalty: 2.2,
    };
  }

  /**
   * 应用旅行疲劳（步行、排队、楼梯等）
   * 
   * 核心是把消耗拆成：步行消耗 + 排队/站立消耗 + 楼梯/坡度惩罚 + 连续行走惩罚
   */
  applyTravelFatigue(args: {
    policy: PlanningPolicy;
    hpState: HpState;
    travel: {
      walkMin: number;
      stairsCount?: number;
      queueMin?: number;
    };
    nowMin: number;
  }): HpState {
    const { policy, hpState, travel, nowMin } = args;
    const p = this.defaultFatigueParams(policy);

    const continuousLimit = policy.pacing.terrainRules.maxContinuousWalkMin;

    const contWalk = travel.walkMin; // 简化：把本段 walk 当连续 walk（你也可累计）
    const contMul = contWalk > continuousLimit ? p.continuousWalkPenalty : 1.0;

    const stair = travel.stairsCount ?? 0;
    const stairCost = stair > 0 ? stair * p.stairsHpPerUnit : 0;

    const walkCost =
      travel.walkMin *
      p.walkHpPerMin *
      contMul *
      (policy.context?.isRaining ? 1.15 : 1.0); // 下雨时额外消耗

    const standCost = (travel.queueMin ?? 0) * p.standHpPerMin;

    let hp = hpState.hp - (walkCost + standCost + stairCost);
    if (hp < 0) hp = 0;

    return {
      hp,
      lastRestAtMin: hpState.lastRestAtMin,
      lastBreakAtMin: nowMin,
    };
  }

  /**
   * 应用休息恢复
   * 
   * @param args 参数
   * @returns 恢复后的 HP 状态
   */
  applyRestRecovery(args: {
    policy: PlanningPolicy;
    hpState: HpState;
    restMin: number;
    nowMin: number;
    restBenefitHp?: number; // 休息点额外回血
  }): HpState {
    const { policy, hpState, restMin, nowMin, restBenefitHp } = args;
    const regen = policy.pacing.regenRate; // 0.2~0.5

    // 基础回血：按 hpMax * regen * (restMin / 60)
    const base = policy.pacing.hpMax * regen * (restMin / 60);

    let hp = hpState.hp + base + (restBenefitHp ?? 0);
    if (hp > policy.pacing.hpMax) hp = policy.pacing.hpMax;

    return {
      hp,
      lastRestAtMin: nowMin,
      lastBreakAtMin: nowMin,
    };
  }

  /**
   * 检查是否需要休息
   * 
   * @param policy 规划策略
   * @param hp 当前 HP
   * @param nowMin 当前时间（分钟数）
   * @param hpState HP 状态
   * @returns 是否需要休息
   */
  restNeeded(
    policy: PlanningPolicy,
    hp: number,
    nowMin: number,
    hpState: { lastRestAtMin: number }
  ): boolean {
    const forced = policy.pacing.forcedRestIntervalMin;
    const since = nowMin - hpState.lastRestAtMin;

    // HP 阈值：根据不同画像调整
    const hpThreshold =
      policy.derived.groupMobilityWorst === MobilityProfile.IRON_LEGS ? 18 : 22;

    return since >= forced || hp <= hpThreshold;
  }
}
