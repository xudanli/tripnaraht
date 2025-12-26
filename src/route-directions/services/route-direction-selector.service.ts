// src/route-directions/services/route-direction-selector.service.ts
/**
 * RouteDirection 选择器服务
 * 
 * 根据用户意图、国家、月份选择 Top 3 路线方向，并提供推荐理由
 */

import { Injectable, Logger } from '@nestjs/common';
import { RouteDirectionsService } from '../route-directions.service';
import { RouteConstraints, RiskProfile, Seasonality } from '../interfaces/route-direction.interface';
import {
  RouteDirectionExplanation,
  ScoreBreakdown,
  MatchedSignals,
  RejectedReason,
} from '../interfaces/route-direction-explanation.interface';

export interface UserIntent {
  preferences?: string[]; // 偏好标签（如 ['徒步', '摄影', '出海']）
  pace?: 'relaxed' | 'moderate' | 'intense'; // 节奏偏好
  riskTolerance?: 'low' | 'medium' | 'high'; // 风险承受度
  durationDays?: number; // 行程天数
  [key: string]: any; // 允许其他意图字段
}

export interface RouteDirectionRecommendation {
  routeDirection: any; // RouteDirection 完整对象
  score: number; // 匹配分数（0-100）
  reasons: string[]; // 推荐理由
  constraints?: RouteConstraints; // 约束（用于注入 world model）
  riskProfile?: RiskProfile; // 风险画像（用于 readiness）
  signaturePois?: any; // 代表性 POI（用于生成候选池）
  // 可解释性字段
  scoreBreakdown?: ScoreBreakdown; // 分数分解
  matchedSignals?: MatchedSignals; // 匹配信号
}

@Injectable()
export class RouteDirectionSelectorService {
  private readonly logger = new Logger(RouteDirectionSelectorService.name);

  constructor(private readonly routeDirectionsService: RouteDirectionsService) {}

  /**
   * 选择路线方向
   * 
   * @param userIntent 用户意图
   * @param countryCode 国家代码
   * @param month 月份（1-12）
   * @returns Top 3 路线方向推荐
   */
  async pickRouteDirections(
    userIntent: UserIntent,
    countryCode: string,
    month?: number
  ): Promise<RouteDirectionRecommendation[]> {
    this.logger.log(
      `选择路线方向: country=${countryCode}, month=${month}, preferences=${userIntent.preferences?.join(',')}`
    );

    // 1. 获取该国家的所有激活路线方向
    const routeDirections = await this.routeDirectionsService.findRouteDirectionsByCountry(
      countryCode,
      {
        tags: userIntent.preferences,
        month,
        limit: 20, // 先获取更多，再筛选
      }
    );

    if (routeDirections.length === 0) {
      this.logger.warn(`未找到 ${countryCode} 的路线方向`);
      return [];
    }

    // 2. 对每个路线方向进行评分（带详细分解）
    const scored = routeDirections.map(rd => {
      const breakdown = this.scoreRouteDirectionWithBreakdown(rd, userIntent, month);
      return {
        routeDirection: rd,
        score: breakdown.totalScore,
        breakdown,
        matchedSignals: this.extractMatchedSignals(rd, userIntent, month),
      };
    });

    // 3. 按分数排序
    const sorted = scored.sort((a, b) => b.score - a.score);

    // 4. 提取被淘汰的原因（Top 4-6）
    const rejected: RejectedReason[] = sorted.slice(3, 6).map(item => ({
      routeDirectionId: item.routeDirection.id,
      routeDirectionName: item.routeDirection.name,
      score: item.score,
      primaryReason: this.getPrimaryRejectionReason(item.breakdown),
      details: {
        tagMatch: {
          score: item.breakdown.tagMatch.score,
          reason: item.breakdown.tagMatch.matchedTags.length === 0
            ? '标签不匹配'
            : `标签匹配度较低（${item.breakdown.tagMatch.matchedTags.length}/${item.breakdown.tagMatch.totalTags}）`,
        },
        seasonality: {
          score: item.breakdown.seasonality.score,
          reason: item.breakdown.seasonality.isAvoidMonth
            ? '禁忌月份'
            : item.breakdown.seasonality.isBestMonth
            ? '最佳月份'
            : '非最佳月份',
        },
        pace: {
          score: item.breakdown.pace.score,
          reason: item.breakdown.pace.compatible ? '节奏匹配' : '节奏不匹配',
        },
        risk: {
          score: item.breakdown.risk.score,
          reason: item.breakdown.risk.compatible ? '风险匹配' : '风险不匹配',
        },
      },
    }));

    // 5. 构建 Top 3 推荐（带详细解释）
    const top3 = sorted.slice(0, 3).map(item => ({
      routeDirection: item.routeDirection,
      score: item.score,
      reasons: this.generateReasons(item.routeDirection, userIntent, item.score, month),
      constraints: item.routeDirection.constraints as RouteConstraints | undefined,
      riskProfile: item.routeDirection.riskProfile as RiskProfile | undefined,
      signaturePois: item.routeDirection.signaturePois,
      scoreBreakdown: item.breakdown,
      matchedSignals: item.matchedSignals,
    }));

    // 6. 构建完整解释（用于决策日志）
    const explanation: RouteDirectionExplanation = {
      selected: {
        routeDirectionId: top3[0]?.routeDirection.id || 0,
        routeDirectionName: top3[0]?.routeDirection.name || '',
        score: top3[0]?.score || 0,
        scoreBreakdown: top3[0]?.scoreBreakdown || this.createEmptyBreakdown(),
        matchedSignals: top3[0]?.matchedSignals || this.createEmptyMatchedSignals(userIntent, month),
        reasons: top3[0]?.reasons || [],
      },
      alternatives: {
        top3: top3.map(item => ({
          routeDirectionId: item.routeDirection.id,
          routeDirectionName: item.routeDirection.name,
          score: item.score,
          reasons: item.reasons,
        })),
        rejected,
      },
    };

    // 将解释存储到 logger（后续可以写入决策日志）
    this.logger.log(`RouteDirection 选择解释: ${JSON.stringify(explanation, null, 2)}`);

    this.logger.log(`选择了 ${top3.length} 条路线方向`);
    return top3;
  }

  /**
   * 评分路线方向（带详细分解）
   */
  private scoreRouteDirectionWithBreakdown(
    routeDirection: any,
    userIntent: UserIntent,
    month?: number
  ): ScoreBreakdown & { totalScore: number } {
    const userTags = userIntent.preferences || [];
    const routeTags = routeDirection.tags || [];
    const matchedTags = userTags.filter(tag => routeTags.includes(tag));
    const tagOverlap = this.calculateTagOverlap(userTags, routeTags);

    const seasonality = routeDirection.seasonality as Seasonality | null;
    const isBestMonth = month && seasonality?.bestMonths?.includes(month);
    const isAvoidMonth = month && seasonality?.avoidMonths?.includes(month);
    const seasonalityScore = isBestMonth ? 100 : isAvoidMonth ? 0 : month ? 33 : 50;

    const skeleton = routeDirection.itinerarySkeleton;
    const routePace = skeleton?.dailyPace?.toUpperCase();
    const paceMatch = this.matchPace(routeDirection, userIntent.pace);
    const paceScore = paceMatch * 100;

    const riskMatch = this.matchRisk(routeDirection, userIntent.riskTolerance);
    const riskScore = riskMatch * 100;

    const breakdown: ScoreBreakdown = {
      tagMatch: {
        score: tagOverlap * 100,
        weight: 0.4,
        matchedTags,
        totalTags: routeTags.length,
      },
      seasonality: {
        score: seasonalityScore,
        weight: 0.3,
        isBestMonth: isBestMonth || false,
        isAvoidMonth: isAvoidMonth || false,
        month: month || 0,
      },
      pace: {
        score: paceScore,
        weight: 0.2,
        userPace: userIntent.pace || 'moderate',
        routePace: routePace || 'MODERATE',
        compatible: paceMatch > 0.7,
      },
      risk: {
        score: riskScore,
        weight: 0.1,
        userTolerance: userIntent.riskTolerance || 'medium',
        routeRisk: this.inferRouteRisk(routeDirection),
        compatible: riskMatch > 0.7,
      },
    };

    const totalScore =
      breakdown.tagMatch.score * breakdown.tagMatch.weight +
      breakdown.seasonality.score * breakdown.seasonality.weight +
      breakdown.pace.score * breakdown.pace.weight +
      breakdown.risk.score * breakdown.risk.weight;

    return { ...breakdown, totalScore: Math.max(0, Math.min(100, totalScore)) };
  }

  /**
   * 提取匹配信号
   */
  private extractMatchedSignals(
    routeDirection: any,
    userIntent: UserIntent,
    month?: number
  ): MatchedSignals {
    const userTags = userIntent.preferences || [];
    const routeTags = routeDirection.tags || [];
    const matchedTags = userTags.filter(tag => routeTags.includes(tag));
    const unmatchedTags = userTags.filter(tag => !routeTags.includes(tag));

    const seasonality = routeDirection.seasonality as Seasonality | null;
    const riskProfile = routeDirection.riskProfile as RiskProfile | null;

    const skeleton = routeDirection.itinerarySkeleton;
    const routePace = skeleton?.dailyPace?.toUpperCase() || 'MODERATE';
    const paceMatch = this.matchPace(routeDirection, userIntent.pace);
    const paceCompatibility: 'high' | 'medium' | 'low' =
      paceMatch > 0.8 ? 'high' : paceMatch > 0.5 ? 'medium' : 'low';

    const riskFactors: string[] = [];
    if (riskProfile?.altitudeSickness) riskFactors.push('高反风险');
    if (riskProfile?.roadClosure) riskFactors.push('封路风险');
    if (riskProfile?.ferryDependent) riskFactors.push('依赖渡轮');
    if (riskProfile?.weatherWindow) riskFactors.push('天气窗口限制');

    return {
      tags: {
        matched: matchedTags,
        unmatched: unmatchedTags,
        routeTags,
      },
      seasonality: {
        month: month || 0,
        bestMonths: seasonality?.bestMonths || [],
        avoidMonths: seasonality?.avoidMonths || [],
      },
      pace: {
        userPace: userIntent.pace || 'moderate',
        routePace,
        compatibility: paceCompatibility,
      },
      risk: {
        userTolerance: userIntent.riskTolerance || 'medium',
        routeHasHighRisk: riskFactors.length > 0,
        riskFactors,
      },
    };
  }

  /**
   * 推断路线风险等级
   */
  private inferRouteRisk(routeDirection: any): string {
    const riskProfile = routeDirection.riskProfile as RiskProfile | null;
    if (!riskProfile) return 'low';

    const riskCount =
      (riskProfile.altitudeSickness ? 1 : 0) +
      (riskProfile.roadClosure ? 1 : 0) +
      (riskProfile.ferryDependent ? 1 : 0);

    if (riskCount >= 2) return 'high';
    if (riskCount === 1) return 'medium';
    return 'low';
  }

  /**
   * 获取主要淘汰原因
   */
  private getPrimaryRejectionReason(breakdown: ScoreBreakdown): string {
    const scores = [
      { name: '标签匹配', score: breakdown.tagMatch.score, weight: breakdown.tagMatch.weight },
      { name: '季节性', score: breakdown.seasonality.score, weight: breakdown.seasonality.weight },
      { name: '节奏', score: breakdown.pace.score, weight: breakdown.pace.weight },
      { name: '风险', score: breakdown.risk.score, weight: breakdown.risk.weight },
    ];

    const weightedScores = scores.map(s => s.score * s.weight);
    const minIndex = weightedScores.indexOf(Math.min(...weightedScores));
    return `${scores[minIndex].name}得分较低`;
  }

  /**
   * 创建空的分数分解（用于默认值）
   */
  private createEmptyBreakdown(): ScoreBreakdown {
    return {
      tagMatch: { score: 0, weight: 0.4, matchedTags: [], totalTags: 0 },
      seasonality: { score: 0, weight: 0.3, isBestMonth: false, isAvoidMonth: false, month: 0 },
      pace: { score: 0, weight: 0.2, userPace: 'moderate', routePace: 'MODERATE', compatible: false },
      risk: { score: 0, weight: 0.1, userTolerance: 'medium', routeRisk: 'low', compatible: false },
    };
  }

  /**
   * 创建空的匹配信号（用于默认值）
   */
  private createEmptyMatchedSignals(userIntent: UserIntent, month?: number): MatchedSignals {
    return {
      tags: { matched: [], unmatched: userIntent.preferences || [], routeTags: [] },
      seasonality: { month: month || 0, bestMonths: [], avoidMonths: [] },
      pace: { userPace: userIntent.pace || 'moderate', routePace: 'MODERATE', compatibility: 'low' },
      risk: { userTolerance: userIntent.riskTolerance || 'medium', routeHasHighRisk: false, riskFactors: [] },
    };
  }

  /**
   * 评分路线方向
   * 
   * 评分维度：
   * 1. 标签匹配度（40%）：用户偏好与路线标签的重叠度
   * 2. 季节性匹配度（30%）：月份是否在最佳月份内
   * 3. 节奏匹配度（20%）：用户节奏偏好与路线节奏的匹配
   * 4. 风险匹配度（10%）：用户风险承受度与路线风险的匹配
   */
  private scoreRouteDirection(
    routeDirection: any,
    userIntent: UserIntent,
    month?: number
  ): number {
    let score = 0;

    // 1. 标签匹配度（40%）
    const userTags = userIntent.preferences || [];
    const routeTags = routeDirection.tags || [];
    const tagOverlap = this.calculateTagOverlap(userTags, routeTags);
    score += tagOverlap * 40;

    // 2. 季节性匹配度（30%）
    if (month) {
      const seasonality = routeDirection.seasonality as Seasonality | null;
      if (seasonality) {
        const isBestMonth = seasonality.bestMonths?.includes(month);
        const isAvoidMonth = seasonality.avoidMonths?.includes(month);
        
        if (isBestMonth) {
          score += 30;
        } else if (isAvoidMonth) {
          score -= 20; // 惩罚禁忌月份
        } else {
          score += 10; // 中性月份
        }
      } else {
        score += 15; // 无季节性信息，给中等分数
      }
    } else {
      score += 15; // 无月份信息，给中等分数
    }

    // 3. 节奏匹配度（20%）
    const paceMatch = this.matchPace(routeDirection, userIntent.pace);
    score += paceMatch * 20;

    // 4. 风险匹配度（10%）
    const riskMatch = this.matchRisk(routeDirection, userIntent.riskTolerance);
    score += riskMatch * 10;

    return Math.max(0, Math.min(100, score)); // 限制在 0-100
  }

  /**
   * 计算标签重叠度
   */
  private calculateTagOverlap(userTags: string[], routeTags: string[]): number {
    if (userTags.length === 0) return 0.5; // 无偏好时给中等分数
    if (routeTags.length === 0) return 0.3; // 无标签时给低分

    const intersection = userTags.filter(tag => routeTags.includes(tag));
    return intersection.length / Math.max(userTags.length, routeTags.length);
  }

  /**
   * 匹配节奏
   */
  private matchPace(routeDirection: any, userPace?: string): number {
    if (!userPace) return 0.5;

    const skeleton = routeDirection.itinerarySkeleton;
    const routePace = skeleton?.dailyPace?.toUpperCase();

    // 映射关系
    const paceMap: Record<string, string[]> = {
      RELAXED: ['LIGHT', 'RELAX', 'MODERATE'],
      MODERATE: ['MODERATE', 'BALANCED'],
      INTENSE: ['INTENSE', 'CHALLENGE', 'MODERATE'],
    };

    const compatiblePaces = paceMap[userPace.toUpperCase()] || [];
    if (routePace && compatiblePaces.includes(routePace)) {
      return 1.0;
    }

    return 0.3; // 不完全匹配时给低分
  }

  /**
   * 匹配风险
   */
  private matchRisk(routeDirection: any, riskTolerance?: string): number {
    if (!riskTolerance) return 0.5;

    const riskProfile = routeDirection.riskProfile as RiskProfile | null;
    if (!riskProfile) return 0.5;

    const hasHighRisk = riskProfile.altitudeSickness || riskProfile.roadClosure;

    if (riskTolerance === 'low' && !hasHighRisk) {
      return 1.0;
    } else if (riskTolerance === 'high' && hasHighRisk) {
      return 1.0;
    } else if (riskTolerance === 'medium') {
      return 0.7; // 中等风险承受度，匹配任何路线
    }

    return 0.3; // 不匹配时给低分
  }

  /**
   * 生成推荐理由
   */
  private generateReasons(
    routeDirection: any,
    userIntent: UserIntent,
    score: number,
    month?: number
  ): string[] {
    const reasons: string[] = [];

    // 1. 标签匹配理由
    const userTags = userIntent.preferences || [];
    const routeTags = routeDirection.tags || [];
    const matchedTags = userTags.filter(tag => routeTags.includes(tag));
    if (matchedTags.length > 0) {
      reasons.push(`匹配您的偏好：${matchedTags.join('、')}`);
    }

    // 2. 季节性理由
    if (month) {
      const seasonality = routeDirection.seasonality as Seasonality | null;
      if (seasonality?.bestMonths?.includes(month)) {
        reasons.push(`${month}月是此路线的最佳季节`);
      } else if (seasonality?.avoidMonths?.includes(month)) {
        reasons.push(`注意：${month}月可能不是最佳季节`);
      }
    }

    // 3. 特色描述
    if (routeDirection.description) {
      reasons.push(routeDirection.description.substring(0, 100));
    }

    // 4. 节奏匹配理由
    const paceMatch = this.matchPace(routeDirection, userIntent.pace);
    if (paceMatch > 0.7) {
      reasons.push(`节奏与您的偏好匹配`);
    }

    // 5. 风险提示
    const riskProfile = routeDirection.riskProfile as RiskProfile | null;
    if (riskProfile?.altitudeSickness) {
      reasons.push(`需要适应高海拔`);
    }
    if (riskProfile?.ferryDependent) {
      reasons.push(`依赖渡轮/出海班次`);
    }

    return reasons;
  }
}

