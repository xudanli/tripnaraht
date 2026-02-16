/**
 * Daily Utility Calculator - 日级效用计算器
 *
 * Phase 2 ExpectedUtility v1 实现
 *
 * 公式：Utility(day) = w_exp×ExperienceScore + w_cost×CostEfficiency + w_time×TimeEfficiency
 *                     + w_comfort×ComfortScore + w_safety×SafetyScore
 *
 * 惩罚：RiskPenalty + FatiguePenalty + UncertaintyPenalty
 */

import { Injectable, Optional } from '@nestjs/common';
import { TripPlan, PlanDay } from '../../plan-model';
import { TripWorldState } from '../../world-model';
import { FatigueCalculatorService } from '../../services/fatigue-calculator.service';
import { ExpectedUtilityLogService } from '../../services/expected-utility-log.service';
import { UserProfileWeightsService } from './user-profile-weights.service';
import {
  DailyUtilityResult,
  DayUtilityBreakdown,
  PlanPenalties,
  DailyUtilityWeights,
  DEFAULT_DAILY_UTILITY_WEIGHTS,
} from './daily-utility.interface';

@Injectable()
export class DailyUtilityCalculatorService {
  constructor(
    @Optional() private readonly fatigueCalculator?: FatigueCalculatorService,
    @Optional() private readonly utilityLogService?: ExpectedUtilityLogService,
    @Optional() private readonly userProfileWeights?: UserProfileWeightsService
  ) {}

  /**
   * 计算完整 ExpectedUtility
   */
  compute(
    plan: TripPlan,
    state: TripWorldState,
    weights?: DailyUtilityWeights
  ): DailyUtilityResult {
    const resolvedWeights =
      weights ??
      (this.userProfileWeights
        ? this.userProfileWeights.inferWeights(
            state,
            (state.policies as any)?.constraintDSL
          ).weights
        : DEFAULT_DAILY_UTILITY_WEIGHTS);
    const dayUtilities: DailyUtilityResult['dayUtilities'] = [];
    let sumDayUtility = 0;

    for (const day of plan.days) {
      const breakdown = this.computeDayUtility(day, state, resolvedWeights);
      dayUtilities.push({ day, breakdown });
      sumDayUtility += breakdown.totalUtility;
    }

    const penalties = this.computePenalties(plan, state);
    const totalExpectedUtility = Math.max(
      0,
      sumDayUtility - penalties.totalPenalty
    );

    const result: DailyUtilityResult = {
      dayUtilities,
      penalties,
      totalExpectedUtility,
    };

    // Phase 3：异步记录评估日志（不阻断）
    if (this.utilityLogService) {
        this.utilityLogService
          .logEvaluation(result, resolvedWeights, {
            planId: (plan as any).id,
            tripId: (state.context as any)?.tripId,
            userId: (state.context as any)?.userId,
            countryCode: this.extractCountryCode(state),
            source: 'internal',
          })
        .catch(() => {});
    }

    return result;
  }

  private extractCountryCode(state: TripWorldState): string | undefined {
    const dest = state.context?.destination;
    if (!dest) return undefined;
    return dest.slice(0, 2).toUpperCase();
  }

  /**
   * 计算单日 Utility
   */
  computeDayUtility(
    day: PlanDay,
    state: TripWorldState,
    weights: DailyUtilityWeights
  ): DayUtilityBreakdown {
    const experienceScore = this.computeExperienceScore(day, state);
    const costEfficiency = this.computeCostEfficiency(day, state, experienceScore);
    const timeEfficiency = this.computeTimeEfficiency(day);
    const comfortScore = this.computeComfortScore(day, state);
    const safetyScore = this.computeSafetyScore(day, state);

    const totalUtility =
      weights.w_exp * experienceScore +
      weights.w_cost * costEfficiency +
      weights.w_time * timeEfficiency +
      weights.w_comfort * comfortScore +
      weights.w_safety * safetyScore;

    return {
      experienceScore,
      costEfficiency,
      timeEfficiency,
      comfortScore,
      safetyScore,
      totalUtility: Math.max(0, Math.min(1, totalUtility)),
    };
  }

  /**
   * ExperienceScore = 0.4×POIRating + 0.3×InterestMatch + 0.2×Diversity + 0.1×LandmarkWeight
   */
  private computeExperienceScore(day: PlanDay, state: TripWorldState): number {
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    const poiSlots = day.timeSlots.filter(s => s.poiId && s.type !== 'rest' && s.type !== 'transport');

    if (poiSlots.length === 0) return 0.5;

    let poiRatingSum = 0;
    let interestMatchSum = 0;
    const typesSeen = new Set<string>();
    let landmarkWeightSum = 0;

    for (const slot of poiSlots) {
      const candidate = slot.poiId ? candidateMap.get(slot.poiId) : undefined;
      poiRatingSum += candidate?.qualityScore ?? 0.5;
      interestMatchSum += 0.5; // 缺省：无用户兴趣向量时用 0.5
      if (candidate?.type) typesSeen.add(candidate.type);
      landmarkWeightSum += candidate?.mustSee ? 1 : 0.5;
    }

    const n = poiSlots.length;
    const poiRating = n > 0 ? poiRatingSum / n : 0.5;
    const interestMatch = n > 0 ? interestMatchSum / n : 0.5;
    const diversity = Math.min(1, typesSeen.size / 5); // 5 类为满
    const landmarkWeight = n > 0 ? landmarkWeightSum / n : 0.5;

    return 0.4 * poiRating + 0.3 * interestMatch + 0.2 * diversity + 0.1 * landmarkWeight;
  }

  /**
   * CostEfficiency = ExperienceScore / CostNormalized
   * 避免除零，归一化到 0-1
   */
  private computeCostEfficiency(
    day: PlanDay,
    state: TripWorldState,
    experienceScore: number
  ): number {
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    let dayCost = 0;
    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const c = candidateMap.get(slot.poiId);
        if (c?.cost) dayCost += c.cost.amount;
      }
    }

    const budget = state.context?.budget?.amount;
    if (!budget || budget <= 0) return 0.7; // 无预算约束时中性分
    const dailyBudget = budget / (state.context?.durationDays || 1);
    const costNormalized = dayCost / Math.max(1, dailyBudget);

    if (costNormalized <= 0) return 1;
    const raw = experienceScore / costNormalized;
    return Math.max(0, Math.min(1, raw * 2)); // 缩放使典型值落在 0-1
  }

  /**
   * TimeEfficiency = UsefulTime / TotalTime
   */
  private computeTimeEfficiency(day: PlanDay): number {
    let usefulTime = 0;
    let totalTime = 0;
    const slots = day.timeSlots;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const start = this.timeToMinutes(slot.time);
      const end = slot.endTime
        ? this.timeToMinutes(slot.endTime)
        : start + 60;
      const duration = end - start;

      if (slot.type === 'rest' || slot.type === 'transport') {
        totalTime += duration;
      } else {
        usefulTime += duration;
        totalTime += duration;
        if (slot.travelLegFromPrev) {
          totalTime += slot.travelLegFromPrev.durationMin;
        }
      }
    }

    if (totalTime <= 0) return 0.5;
    return Math.max(0, Math.min(1, usefulTime / totalTime));
  }

  /**
   * ComfortScore = 1 - normalized(FatigueLoad)
   */
  private computeComfortScore(day: PlanDay, state: TripWorldState): number {
    const fatigueLoad = this.computeFatigueLoad(day, state);
    const maxLoad = 1.5; // 经验阈值
    const normalized = Math.min(1, fatigueLoad / maxLoad);
    return Math.max(0, 1 - normalized);
  }

  /**
   * PhysicalLoad = WalkingDistance + ElevationGain + ActivityIntensity + SleepDeficit
   * 简化实现
   */
  private computeFatigueLoad(day: PlanDay, state: TripWorldState): number {
    let load = 0;
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const c = candidateMap.get(slot.poiId);
        if (c) load += (c.durationMin || 60) / 60;
      }
      if (slot.travelLegFromPrev) {
        load += slot.travelLegFromPrev.durationMin / 120; // 交通疲劳系数
      }
    }

    if (day.terrainFacts?.totalAscent) {
      load += Math.min(1, day.terrainFacts.totalAscent / 1000);
    }

    return load;
  }

  /**
   * SafetyScore: 天气、地理、风险
   */
  private computeSafetyScore(day: PlanDay, state: TripWorldState): number {
    let score = 1.0;
    const weather = state.signals?.weatherByDate?.[day.date];
    const alerts = state.signals?.alerts || [];
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    if (weather?.condition === 'storm' || weather?.condition === 'rain') {
      score -= 0.2;
    }
    if (alerts.some(a => a.severity === 'critical')) {
      score -= 0.3;
    }

    let maxRisk = 0;
    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const c = candidateMap.get(slot.poiId);
        if (c?.riskLevel === 'high') maxRisk = 1;
        else if (c?.riskLevel === 'medium' && maxRisk < 0.5) maxRisk = 0.5;
      }
    }
    score -= maxRisk * 0.3;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 三项惩罚
   */
  private computePenalties(plan: TripPlan, state: TripWorldState): PlanPenalties {
    const weatherRisk = this.computeWeatherRisk(plan, state);
    const trafficRisk = 0.1; // 占位
    const feasibilityRisk = 0.05; // 占位
    const riskPenalty = 0.1 * weatherRisk + 0.05 * trafficRisk + 0.05 * feasibilityRisk;

    const physicalLoad = plan.days.reduce(
      (sum, d) => sum + this.computeFatigueLoad(d, state),
      0
    );
    const userTolerance = 2; // 简化
    const fatiguePenalty = this.sigmoid(physicalLoad - userTolerance) * 0.15;

    const dataConfidenceInverse = 0.1; // 占位
    const uncertaintyPenalty = 0.05 * dataConfidenceInverse;

    return {
      riskPenalty,
      fatiguePenalty,
      uncertaintyPenalty,
      totalPenalty: riskPenalty + fatiguePenalty + uncertaintyPenalty,
    };
  }

  private computeWeatherRisk(plan: TripPlan, state: TripWorldState): number {
    let risk = 0;
    for (const day of plan.days) {
      const weather = state.signals?.weatherByDate?.[day.date];
      const candidates = state.candidatesByDate[day.date] || [];
      const candidateMap = new Map(candidates.map(c => [c.id, c]));

      const hasOutdoor = day.timeSlots.some(slot => {
        const c = slot.poiId ? candidateMap.get(slot.poiId) : undefined;
        return c?.indoorOutdoor === 'outdoor';
      });
      if (hasOutdoor && (weather?.condition === 'rain' || weather?.condition === 'storm')) {
        risk += 0.3;
      }
    }
    return Math.min(1, risk);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }
}
