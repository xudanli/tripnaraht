// src/trips/decision/services/dem-evidence-chain.service.ts
/**
 * DEM 驱动的路线规划证据链服务
 * 
 * P1.1.4: 路线"为什么这样排"的证据链
 * 
 * 功能：
 * 1. 基于DEM数据生成路线规划的证据链
 * 2. 解释为什么选择了某些活动
 * 3. 解释为什么安排了这样的顺序
 * 4. 解释为什么在某些点休息
 * 5. 提供基于DEM数据的证据（海拔、坡度、体力消耗等）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlanDay, PlanSlot, TripPlan } from '../plan-model';
import { RouteSegmentation } from './dem-route-segmentation.service';
import { PlanRiskScore } from './dem-risk-scoring.service';
import { DailyEnergyBudget } from './dem-daily-energy.service';

export interface EvidenceItem {
  /** 证据类型 */
  type: 'TERRAIN' | 'ENERGY' | 'RISK' | 'SEGMENTATION' | 'CONSTRAINT' | 'PACE';
  /** 证据标题 */
  title: string;
  /** 证据描述 */
  description: string;
  /** 证据数据（用于前端展示） */
  data?: {
    elevation?: number;
    slope?: number;
    distance?: number;
    energyCost?: number;
    riskScore?: number;
    [key: string]: any;
  };
  /** 严重程度 */
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 是否影响决策 */
  impactsDecision: boolean;
  /** 影响的决策类型 */
  decisionImpact?: 'SELECTION' | 'ORDERING' | 'TIMING' | 'REST';
}

export interface SlotEvidence {
  /** 时间槽ID */
  slotId: string;
  /** 活动名称 */
  activityName: string;
  /** 证据项列表 */
  evidence: EvidenceItem[];
  /** 为什么选择这个活动 */
  whySelected: string[];
  /** 为什么在这个时间 */
  whyThisTime?: string[];
  /** 为什么在这个位置 */
  whyThisLocation?: string[];
}

export interface DayEvidence {
  /** 日期 */
  date: string;
  /** 天数 */
  day: number;
  /** 时间槽证据列表 */
  slotEvidences: SlotEvidence[];
  /** 为什么这样安排这一天 */
  whyThisDay: string[];
  /** 基于地形的证据 */
  terrainEvidence?: {
    maxElevation: number;
    totalAscent: number;
    steepSections?: number;
    mandatoryRestPoints?: number;
    energyBreakpoints?: number;
  };
  /** 基于体力的证据 */
  energyEvidence?: {
    totalEnergyCost: number;
    maxEnergyBudget: number;
    energyRatio: number;
    exceeded?: boolean;
  };
  /** 基于风险的证据 */
  riskEvidence?: {
    riskScore: number;
    riskFlags: Array<{ type: string; severity: string; message: string }>;
  };
}

export interface RouteEvidenceChain {
  /** 计划总证据 */
  planEvidence: {
    /** 为什么选择这个路线方向 */
    whyThisRoute?: string[];
    /** 为什么这样安排整体行程 */
    whyThisItinerary?: string[];
    /** 基于拆段的证据 */
    segmentationEvidence?: {
      totalDistance: number;
      totalAscent: number;
      steepSections: number;
      energyBreakpoints: number;
      mandatoryRestPoints: number;
    };
    /** 基于风险的证据 */
    riskEvidence?: {
      consecutiveHighAltitudeDays: number;
      consecutiveAscent: number;
      steepConcentratedSections: number;
      totalRiskScore: number;
    };
  };
  /** 每日证据列表 */
  dailyEvidences: DayEvidence[];
}

@Injectable()
export class DEMEvidenceChainService {
  private readonly logger = new Logger(DEMEvidenceChainService.name);

  /**
   * 生成路线规划的证据链
   * 
   * @param plan 旅行计划
   * @param routeSegmentation 路线拆段结果（可选）
   * @param planRiskScore 计划风险评分（可选）
   * @param dailyEnergyBudgets 每日体力预算列表（可选）
   * @param selectedRouteDirection 选择的路线方向（可选）
   * @returns 证据链
   */
  generateEvidenceChain(
    plan: TripPlan,
    routeSegmentation?: RouteSegmentation,
    planRiskScore?: PlanRiskScore,
    dailyEnergyBudgets?: Array<{ day: number; budget: DailyEnergyBudget }>,
    selectedRouteDirection?: any
  ): RouteEvidenceChain {
    const dailyEvidences: DayEvidence[] = [];

    // 1. 生成计划级证据
    const planEvidence = this.generatePlanEvidence(
      plan,
      routeSegmentation,
      planRiskScore,
      selectedRouteDirection
    );

    // 2. 为每一天生成证据
    for (const day of plan.days) {
      const dayEnergyBudget = dailyEnergyBudgets?.find(d => d.day === day.day)?.budget;
      const dayRiskScore = planRiskScore?.dailyRiskScores?.find(d => d.day === day.day);

      const dayEvidence = this.generateDayEvidence(
        day,
        routeSegmentation,
        dayEnergyBudget,
        dayRiskScore
      );

      dailyEvidences.push(dayEvidence);
    }

    return {
      planEvidence,
      dailyEvidences,
    };
  }

  /**
   * 生成计划级证据
   */
  private generatePlanEvidence(
    plan: TripPlan,
    routeSegmentation?: RouteSegmentation,
    planRiskScore?: PlanRiskScore,
    selectedRouteDirection?: any
  ): RouteEvidenceChain['planEvidence'] {
    const whyThisRoute: string[] = [];
    const whyThisItinerary: string[] = [];

    // 基于路线方向的选择原因
    if (selectedRouteDirection) {
      const rd = selectedRouteDirection.routeDirection || selectedRouteDirection;
      if (rd.nameCN) {
        whyThisRoute.push(`选择了"${rd.nameCN}"路线方向`);
      }
      if (selectedRouteDirection.scoreBreakdown) {
        const topReason = Object.entries(selectedRouteDirection.scoreBreakdown)
          .sort(([, a]: any, [, b]: any) => b - a)[0];
        if (topReason) {
          whyThisRoute.push(`匹配度最高：${topReason[0]}（得分：${(topReason[1] as number).toFixed(2)}）`);
        }
      }
    }

    // 基于拆段的证据
    let segmentationEvidence: RouteEvidenceChain['planEvidence']['segmentationEvidence'] | undefined;
    if (routeSegmentation) {
      segmentationEvidence = {
        totalDistance: routeSegmentation.totalDistance,
        totalAscent: routeSegmentation.totalAscent,
        steepSections: routeSegmentation.steepSections.length,
        energyBreakpoints: routeSegmentation.energyBreakpoints.length,
        mandatoryRestPoints: routeSegmentation.mandatoryRestPoints.length,
      };

      whyThisItinerary.push(
        `路线总距离 ${(routeSegmentation.totalDistance / 1000).toFixed(1)} 公里，` +
        `总爬升 ${routeSegmentation.totalAscent.toFixed(0)} 米`
      );

      if (routeSegmentation.steepSections.length > 0) {
        whyThisItinerary.push(
          `识别到 ${routeSegmentation.steepSections.length} 个过陡段，` +
          `已考虑在安排中避免或合理安排休息`
        );
      }

      if (routeSegmentation.mandatoryRestPoints.length > 0) {
        whyThisItinerary.push(
          `识别到 ${routeSegmentation.mandatoryRestPoints.length} 个强制休息点，` +
          `已在这些位置安排休息或轻松活动`
        );
      }
    }

    // 基于风险的证据
    let riskEvidence: RouteEvidenceChain['planEvidence']['riskEvidence'] | undefined;
    if (planRiskScore) {
      riskEvidence = {
        consecutiveHighAltitudeDays: planRiskScore.consecutiveHighAltitudeDays,
        consecutiveAscent: planRiskScore.consecutiveAscent,
        steepConcentratedSections: planRiskScore.steepConcentratedSections,
        totalRiskScore: planRiskScore.totalRiskScore,
      };

      if (planRiskScore.consecutiveHighAltitudeDays >= 3) {
        whyThisItinerary.push(
          `连续 ${planRiskScore.consecutiveHighAltitudeDays} 天高海拔（>3000m），` +
          `已安排适应时间和休息`
        );
      }

      if (planRiskScore.consecutiveAscent >= 1200) {
        whyThisItinerary.push(
          `连续上升 ${planRiskScore.consecutiveAscent.toFixed(0)} 米，` +
          `已安排中间休息点避免过度疲劳`
        );
      }
    }

    return {
      whyThisRoute: whyThisRoute.length > 0 ? whyThisRoute : undefined,
      whyThisItinerary: whyThisItinerary.length > 0 ? whyThisItinerary : undefined,
      segmentationEvidence,
      riskEvidence,
    };
  }

  /**
   * 生成单日证据
   */
  private generateDayEvidence(
    day: PlanDay,
    routeSegmentation?: RouteSegmentation,
    dailyEnergyBudget?: DailyEnergyBudget,
    dayRiskScore?: PlanRiskScore['dailyRiskScores'][0]
  ): DayEvidence {
    const slotEvidences: SlotEvidence[] = [];
    const whyThisDay: string[] = [];

    // 1. 为每个时间槽生成证据
    for (const slot of day.timeSlots) {
      const slotEvidence = this.generateSlotEvidence(
        slot,
        day,
        routeSegmentation,
        dailyEnergyBudget
      );
      slotEvidences.push(slotEvidence);
    }

    // 2. 生成当日整体证据
    const terrainFacts = day.terrainFacts;
    if (terrainFacts) {
      if (terrainFacts.maxElevation) {
        whyThisDay.push(`最高海拔 ${terrainFacts.maxElevation.toFixed(0)} 米`);
      }
      if (terrainFacts.totalAscent) {
        whyThisDay.push(`累计爬升 ${terrainFacts.totalAscent.toFixed(0)} 米`);
      }
      if (terrainFacts.effortLevel) {
        whyThisDay.push(`体力强度：${this.getEffortLevelText(terrainFacts.effortLevel)}`);
      }
    }

    // 基于体力的证据
    let energyEvidence: DayEvidence['energyEvidence'] | undefined;
    if (dailyEnergyBudget) {
      const energyRatio = dailyEnergyBudget.totalEnergyCost / dailyEnergyBudget.maxEnergyCost;
      energyEvidence = {
        totalEnergyCost: dailyEnergyBudget.totalEnergyCost,
        maxEnergyBudget: dailyEnergyBudget.maxEnergyCost,
        energyRatio: Math.round(energyRatio * 100) / 100,
        exceeded: dailyEnergyBudget.totalEnergyCost > dailyEnergyBudget.maxEnergyCost,
      };

      if (energyRatio > 0.9) {
        whyThisDay.push(`体力消耗接近上限（${(energyRatio * 100).toFixed(0)}%），已安排充分休息`);
      } else if (energyRatio > 0.7) {
        whyThisDay.push(`体力消耗较高（${(energyRatio * 100).toFixed(0)}%），已考虑休息时间`);
      }
    }

    // 基于风险的证据
    let riskEvidence: DayEvidence['riskEvidence'] | undefined;
    if (dayRiskScore) {
      riskEvidence = {
        riskScore: dayRiskScore.riskScore,
        riskFlags: dayRiskScore.riskFlags,
      };

      if (dayRiskScore.riskScore > 70) {
        whyThisDay.push(`风险评分较高（${dayRiskScore.riskScore.toFixed(1)}），已采取风险缓解措施`);
      }
    }

    // 基于地形的证据
    let terrainEvidence: DayEvidence['terrainEvidence'] | undefined;
    if (terrainFacts) {
      terrainEvidence = {
        maxElevation: terrainFacts.maxElevation || 0,
        totalAscent: terrainFacts.totalAscent || 0,
      };

      // 从拆段结果中提取相关数据
      if (routeSegmentation) {
        // 简化处理：假设当天的活动在拆段结果的相关区间内
        terrainEvidence.steepSections = routeSegmentation.steepSections.length;
        terrainEvidence.mandatoryRestPoints = routeSegmentation.mandatoryRestPoints.length;
        terrainEvidence.energyBreakpoints = routeSegmentation.energyBreakpoints.length;
      }
    }

    return {
      date: day.date,
      day: day.day,
      slotEvidences,
      whyThisDay,
      terrainEvidence,
      energyEvidence,
      riskEvidence,
    };
  }

  /**
   * 生成单个时间槽的证据
   */
  private generateSlotEvidence(
    slot: PlanSlot,
    day: PlanDay,
    routeSegmentation?: RouteSegmentation,
    dailyEnergyBudget?: DailyEnergyBudget
  ): SlotEvidence {
    const evidence: EvidenceItem[] = [];
    const whySelected: string[] = [];
    const whyThisTime: string[] = [];
    const whyThisLocation: string[] = [];

    // 从slot的reasons中提取原因
    if (slot.reasons) {
      whySelected.push(...slot.reasons);
    }

    // 基于优先级标签
    if (slot.priorityTag === 'core') {
      whySelected.push('核心体验活动，优先安排');
    } else if (slot.priorityTag === 'anchor') {
      whySelected.push('锚点活动，固定时间');
    }

    // 基于地形事实
    if (day.terrainFacts) {
      if (day.terrainFacts.maxElevation && day.terrainFacts.maxElevation > 3000) {
        evidence.push({
          type: 'TERRAIN',
          title: '高海拔活动',
          description: `活动位于高海拔区域（${day.terrainFacts.maxElevation.toFixed(0)}米），已考虑适应时间`,
          data: { elevation: day.terrainFacts.maxElevation },
          severity: day.terrainFacts.maxElevation > 4000 ? 'HIGH' : 'MEDIUM',
          impactsDecision: true,
          decisionImpact: 'SELECTION',
        });
      }

      if (day.terrainFacts.totalAscent && day.terrainFacts.totalAscent > 500) {
        evidence.push({
          type: 'TERRAIN',
          title: '高爬升活动',
          description: `当日累计爬升 ${day.terrainFacts.totalAscent.toFixed(0)} 米，已安排合理节奏`,
          data: { ascent: day.terrainFacts.totalAscent },
          severity: day.terrainFacts.totalAscent > 1000 ? 'HIGH' : 'MEDIUM',
          impactsDecision: true,
          decisionImpact: 'TIMING',
        });
      }
    }

    // 基于体力预算
    if (dailyEnergyBudget) {
      const energyRatio = dailyEnergyBudget.totalEnergyCost / dailyEnergyBudget.maxEnergyCost;
      if (energyRatio > 0.8) {
        evidence.push({
          type: 'ENERGY',
          title: '高体力消耗',
          description: `当日体力消耗 ${(energyRatio * 100).toFixed(0)}%，已安排休息时间`,
          data: {
            energyCost: dailyEnergyBudget.totalEnergyCost,
            maxBudget: dailyEnergyBudget.maxEnergyCost,
            ratio: energyRatio,
          },
          severity: energyRatio > 0.95 ? 'HIGH' : 'MEDIUM',
          impactsDecision: true,
          decisionImpact: 'REST',
        });
      }
    }

    // 基于风险标志
    if (day.terrainFacts?.riskFlags) {
      for (const riskFlag of day.terrainFacts.riskFlags) {
        evidence.push({
          type: 'RISK',
          title: riskFlag.type,
          description: riskFlag.message,
          severity: riskFlag.severity,
          impactsDecision: riskFlag.severity === 'HIGH',
          decisionImpact: 'SELECTION',
        });
      }
    }

    // 基于时间安排
    if (slot.time) {
      whyThisTime.push(`安排在 ${slot.time}，考虑开放时间和移动时间`);
    }

    // 基于位置
    if (slot.coordinates) {
      whyThisLocation.push(`位置：${slot.coordinates.lat.toFixed(4)}, ${slot.coordinates.lng.toFixed(4)}`);
    }

    return {
      slotId: slot.id,
      activityName: slot.title,
      evidence,
      whySelected,
      whyThisTime: whyThisTime.length > 0 ? whyThisTime : undefined,
      whyThisLocation: whyThisLocation.length > 0 ? whyThisLocation : undefined,
    };
  }

  /**
   * 获取努力等级文本
   */
  private getEffortLevelText(level: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME'): string {
    const texts = {
      RELAX: '轻松',
      MODERATE: '中等',
      CHALLENGE: '挑战',
      EXTREME: '极限',
    };
    return texts[level] || level;
  }
}

