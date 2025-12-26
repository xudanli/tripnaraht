// src/route-directions/services/route-direction-card.service.ts
/**
 * RouteDirection Card Service
 * 
 * 将 RouteDirection 转换为面向前端/LLM 的 Card DTO
 */

import { Injectable, Logger } from '@nestjs/common';
import { RouteDirectionCardDto, FitForType, IntensityLevel, RiskType } from '../dto/route-direction-card.dto';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionData, Seasonality, RiskProfile, RouteConstraints } from '../interfaces/route-direction.interface';
import { ScoreBreakdown, MatchedSignals } from '../interfaces/route-direction-explanation.interface';

@Injectable()
export class RouteDirectionCardService {
  private readonly logger = new Logger(RouteDirectionCardService.name);

  /**
   * 将 RouteDirection 推荐转换为 Card DTO
   */
  toCard(
    recommendation: RouteDirectionRecommendation,
    scoreBreakdown?: ScoreBreakdown,
    matchedSignals?: MatchedSignals
  ): RouteDirectionCardDto {
    const rd = recommendation.routeDirection as any;
    
    // 提取基本信息
    const seasonality = (rd.seasonality || {}) as Seasonality;
    const riskProfile = (rd.riskProfile || {}) as RiskProfile;
    const constraints = (rd.constraints || {}) as RouteConstraints;

    // 生成 whyThis（2-3句话）
    const whyThis = this.generateWhyThis(recommendation, scoreBreakdown, matchedSignals);

    // 提取 fitFor（从 tags 映射）
    const fitFor = this.extractFitFor(rd.tags || []);

    // 确定 intensityProfile（从 constraints 和 itinerarySkeleton 推断）
    const intensityProfile = this.inferIntensityProfile(constraints, rd.itinerarySkeleton);

    // 提取 riskProfile
    const riskTypes = this.extractRiskTypes(riskProfile);

    return {
      id: rd.id,
      uuid: rd.uuid || '',
      titleZh: rd.nameCN || rd.name || '',
      titleEn: rd.nameEN || rd.nameEN,
      description: rd.description,
      bestMonths: seasonality.bestMonths || [],
      avoidMonths: seasonality.avoidMonths || [],
      fitFor,
      intensityProfile,
      riskProfile: riskTypes,
      whyThis,
      countryCode: rd.countryCode,
      version: rd.version,
      tags: rd.tags || [],
      entryHubs: rd.entryHubs || [],
      regions: rd.regions || [],
    };
  }

  /**
   * 生成推荐理由（whyThis）
   * 基于 matchedSignals + scoreBreakdown 生成 2-3 句话
   */
  private generateWhyThis(
    recommendation: RouteDirectionRecommendation,
    scoreBreakdown?: ScoreBreakdown,
    matchedSignals?: MatchedSignals
  ): string {
    const reasons: string[] = [];

    // 1. 标签匹配理由
    if (matchedSignals?.tags?.matched && matchedSignals.tags.matched.length > 0) {
      const tags = matchedSignals.tags.matched.join('、');
      reasons.push(`这条路线特别适合${tags}爱好者`);
    }

    // 2. 季节性理由
    if (matchedSignals?.seasonality) {
      const { month, bestMonths, avoidMonths } = matchedSignals.seasonality;
      if (month && bestMonths && bestMonths.includes(month)) {
        reasons.push(`${month}月是这条路线的最佳旅行时间`);
      } else if (month && avoidMonths && avoidMonths.includes(month)) {
        reasons.push(`注意：${month}月可能不是最佳时间`);
      }
    }

    // 3. 节奏匹配理由
    if (matchedSignals?.pace) {
      const { userPace, routePace, compatibility } = matchedSignals.pace;
      if (compatibility === 'high') {
        reasons.push(`路线节奏与您的偏好（${userPace}）高度匹配`);
      }
    }

    // 4. 风险匹配理由
    if (matchedSignals?.risk) {
      const { userTolerance, routeHasHighRisk } = matchedSignals.risk;
      if (!routeHasHighRisk && userTolerance === 'low') {
        reasons.push('路线风险较低，适合您的风险承受度');
      }
    }

    // 5. 分数分解理由
    if (scoreBreakdown) {
      const topScore = this.getTopScoreReason(scoreBreakdown);
      if (topScore) {
        reasons.push(topScore);
      }
    }

    // 如果没有理由，使用默认理由
    if (reasons.length === 0) {
      reasons.push('这条路线符合您的基本偏好');
    }

    // 返回前 2-3 句话
    return reasons.slice(0, 3).join('。') + '。';
  }

  /**
   * 获取最高分的理由
   */
  private getTopScoreReason(breakdown: ScoreBreakdown): string | null {
    const scores = [
      { name: '标签匹配', score: breakdown.tagMatch?.score || 0, weight: breakdown.tagMatch?.weight || 0 },
      { name: '季节性', score: breakdown.seasonality?.score || 0, weight: breakdown.seasonality?.weight || 0 },
      { name: '节奏匹配', score: breakdown.pace?.score || 0, weight: breakdown.pace?.weight || 0 },
      { name: '风险匹配', score: breakdown.risk?.score || 0, weight: breakdown.risk?.weight || 0 },
    ];

    // 按加权分数排序
    scores.sort((a, b) => (b.score * b.weight) - (a.score * a.weight));
    const top = scores[0];

    if (top.score > 70 && top.weight > 0) {
      return `${top.name}得分很高（${Math.round(top.score)}分）`;
    }

    return null;
  }

  /**
   * 从 tags 提取 fitFor
   */
  private extractFitFor(tags: string[]): FitForType[] {
    const fitFor: FitForType[] = [];
    const tagMap: Record<string, FitForType> = {
      '摄影': FitForType.PHOTOGRAPHY,
      'photography': FitForType.PHOTOGRAPHY,
      '徒步': FitForType.HIKING,
      'hiking': FitForType.HIKING,
      'trekking': FitForType.HIKING,
      '出海': FitForType.SEA,
      'sea': FitForType.SEA,
      'cruise': FitForType.SEA,
      '亲子': FitForType.FAMILY,
      'family': FitForType.FAMILY,
      '挑战': FitForType.CHALLENGE,
      'challenge': FitForType.CHALLENGE,
      'extreme': FitForType.CHALLENGE,
    };

    for (const tag of tags) {
      const fitType = tagMap[tag.toLowerCase()];
      if (fitType && !fitFor.includes(fitType)) {
        fitFor.push(fitType);
      }
    }

    // 如果没有匹配，默认返回通用类型
    if (fitFor.length === 0) {
      fitFor.push(FitForType.HIKING); // 默认徒步
    }

    return fitFor;
  }

  /**
   * 推断强度画像（intensityProfile）
   */
  private inferIntensityProfile(
    constraints: RouteConstraints,
    itinerarySkeleton?: any
  ): IntensityLevel {
    // 从 constraints 推断
    const maxElevation = constraints.maxElevationM || constraints.soft?.maxElevationM || constraints.hard?.maxElevationM;
    const maxDailyAscent = constraints.maxDailyAscentM || constraints.soft?.maxDailyAscentM;

    // 从 itinerarySkeleton 推断
    const dailyPace = itinerarySkeleton?.dailyPace;

    // 高海拔 + 大爬升 = 挑战
    if (maxElevation && maxElevation > 4000) {
      return IntensityLevel.CHALLENGE;
    }
    if (maxDailyAscent && maxDailyAscent > 1000) {
      return IntensityLevel.CHALLENGE;
    }
    if (dailyPace === 'INTENSE' || dailyPace === 'CHALLENGE') {
      return IntensityLevel.CHALLENGE;
    }

    // 中等爬升 = 中等
    if (maxDailyAscent && maxDailyAscent > 500) {
      return IntensityLevel.MODERATE;
    }
    if (dailyPace === 'MODERATE') {
      return IntensityLevel.MODERATE;
    }

    // 默认轻松
    return IntensityLevel.RELAX;
  }

  /**
   * 提取风险类型
   */
  private extractRiskTypes(riskProfile: RiskProfile): RiskType[] {
    const risks: RiskType[] = [];

    if (riskProfile.altitudeSickness) {
      risks.push(RiskType.HIGH_ALTITUDE);
    }
    if (riskProfile.weatherWindow) {
      risks.push(RiskType.WEATHER_WINDOW);
    }
    if (riskProfile.roadClosure) {
      risks.push(RiskType.ROAD_CLOSURE);
    }
    if (riskProfile.ferryDependent) {
      risks.push(RiskType.FERRY);
    }

    return risks;
  }
}

