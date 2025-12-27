// src/route-directions/services/route-direction-card.service.ts
/**
 * RouteDirection Card Service
 * 
 * 将 RouteDirection 转换为面向前端/LLM 的 Card DTO
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RouteDirectionCardDto, TerrainSignatureDto, RiskProfileDetailDto } from '../dto/route-direction-card.dto';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionData, Seasonality, RiskProfile, RouteConstraints } from '../interfaces/route-direction.interface';
import { ScoreBreakdown, MatchedSignals } from '../interfaces/route-direction-explanation.interface';
import { RouteDirectionExplainerService } from './route-direction-explainer.service';

@Injectable()
export class RouteDirectionCardService {
  private readonly logger = new Logger(RouteDirectionCardService.name);

  constructor(
    @Optional() private readonly explainerService?: RouteDirectionExplainerService
  ) {}

  /**
   * 将 RouteDirection 推荐转换为 Card DTO（标准化schema）
   * 
   * PART 1.1: 路线方向知识卡（必须交付）
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

    // 使用ExplainerService生成tagline和longDescription
    let tagline = '';
    let longDescription = '';
    let suitableFor: string[] = [];
    let notSuitableFor: string[] = [];

    if (this.explainerService) {
      const explainer = this.explainerService.generateExplainer(recommendation);
      tagline = explainer.tagline;
      longDescription = explainer.description;
      suitableFor = explainer.suitableFor;
      notSuitableFor = explainer.notSuitableFor;
    } else {
      // 降级处理：如果没有explainerService，使用简单生成
      tagline = this.generateSimpleTagline(rd);
      longDescription = this.generateSimpleDescription(rd, constraints, riskProfile);
      const suitability = this.generateSuitability(rd, constraints, riskProfile, rd.tags || []);
      suitableFor = suitability.suitableFor;
      notSuitableFor = suitability.notSuitableFor;
    }

    // 生成地形特征签名
    const terrainSignature = this.generateTerrainSignature(constraints, rd);

    // 生成体验标签
    const experienceTags = this.generateExperienceTags(rd, constraints, riskProfile);

    // 生成详细风险画像
    const riskProfileDetail = this.generateRiskProfileDetail(riskProfile, constraints, rd);

    // 推断典型行程天数
    const typicalDurationDays = this.inferTypicalDuration(rd);

    // 生成 whyThis（兼容字段）
    const whyThis = this.generateWhyThis(recommendation, scoreBreakdown, matchedSignals);

    return {
      id: rd.id,
      uuid: rd.uuid || '',
      name: rd.nameCN || rd.name || '',
      nameCN: rd.nameCN || rd.name || '',
      nameEN: rd.nameEN,
      tagline,
      longDescription,
      suitableFor,
      notSuitableFor,
      bestMonths: seasonality.bestMonths || [],
      avoidMonths: seasonality.avoidMonths,
      typicalDurationDays,
      terrainSignature,
      experienceTags,
      riskProfile: riskProfileDetail,
      // 兼容旧字段
      description: longDescription,
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
   * 生成适合/不适合人群（降级处理）
   */
  private generateSuitability(
    rd: any,
    constraints: RouteConstraints,
    riskProfile: RiskProfile,
    tags: string[]
  ): { suitableFor: string[]; notSuitableFor: string[] } {
    const suitableFor: string[] = [];
    const notSuitableFor: string[] = [];

    // 基于标签
    if (tags.includes('徒步') || tags.includes('hiking')) {
      suitableFor.push('有基础徒步经验的旅行者');
      notSuitableFor.push('第一次出国徒步的新手');
    }
    if (tags.includes('摄影') || tags.includes('photography')) {
      suitableFor.push('摄影爱好者');
    }
    if (tags.includes('文化') || tags.includes('culture')) {
      suitableFor.push('对当地文化感兴趣的旅行者');
    }
    if (tags.includes('挑战') || tags.includes('challenge')) {
      suitableFor.push('喜欢挑战的旅行者');
      notSuitableFor.push('追求轻松舒适的旅行者');
    }

    // 基于海拔
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM;
    if (maxElevation && maxElevation > 4000) {
      suitableFor.push('有高海拔经验的旅行者');
      notSuitableFor.push('心肺基础差的旅行者');
      notSuitableFor.push('有严重高反史的旅行者');
    } else if (maxElevation && maxElevation > 3000) {
      suitableFor.push('能适应中等海拔的旅行者');
      notSuitableFor.push('对高海拔敏感的旅行者');
    }

    // 基于爬升
    const maxAscent = constraints.soft?.maxDailyAscentM || constraints.maxDailyAscentM;
    if (maxAscent && maxAscent > 1000) {
      suitableFor.push('体力较好的旅行者');
      notSuitableFor.push('体力较差的旅行者');
    }

    // 基于风险
    if (riskProfile.weatherWindow) {
      suitableFor.push('能灵活调整行程的旅行者');
      notSuitableFor.push('行程时间固定的旅行者');
    }
    if (riskProfile.ferryDependent) {
      suitableFor.push('能提前预订交通的旅行者');
    }

    // 默认值
    if (suitableFor.length === 0) {
      suitableFor.push('一般旅行者');
    }
    if (notSuitableFor.length === 0) {
      notSuitableFor.push('行动不便的旅行者');
    }

    return { suitableFor, notSuitableFor };
  }

  /**
   * 生成地形特征签名
   */
  private generateTerrainSignature(
    constraints: RouteConstraints,
    rd: any
  ): TerrainSignatureDto {
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;
    const minElevation = maxElevation > 0 ? Math.max(0, maxElevation - 2000) : 0; // 简单估算
    const avgElevation = (maxElevation + minElevation) / 2;
    const maxSlope = constraints.hard?.maxSlopePct || constraints.maxSlope || undefined;

    return {
      avgElevationM: maxElevation > 0 ? Math.round(avgElevation) : undefined,
      elevationRangeM: maxElevation > 0 ? [Math.round(minElevation), Math.round(maxElevation)] : undefined,
      maxSlope: maxSlope,
    };
  }

  /**
   * 生成体验标签（情绪 & 体验层）
   */
  private generateExperienceTags(
    rd: any,
    constraints: RouteConstraints,
    riskProfile: RiskProfile
  ): string[] {
    const tags: string[] = [];
    const routeTags = rd.tags || [];

    // 基于标签
    if (routeTags.includes('摄影') || routeTags.includes('photography')) {
      tags.push('震撼', '视觉享受');
    }
    if (routeTags.includes('徒步') || routeTags.includes('hiking')) {
      tags.push('挑战', '成就感');
    }
    if (routeTags.includes('文化') || routeTags.includes('culture')) {
      tags.push('文化', '深度体验');
    }
    if (routeTags.includes('自然') || routeTags.includes('nature')) {
      tags.push('宁静', '自然');
    }

    // 基于海拔
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;
    if (maxElevation > 4000) {
      tags.push('极限', '挑战');
    } else if (maxElevation > 3000) {
      tags.push('刺激');
    }

    // 基于风险
    if (riskProfile.weatherWindow) {
      tags.push('不确定性', '冒险');
    }
    if (riskProfile.ferryDependent) {
      tags.push('独特体验');
    }

    // 去重并返回
    return Array.from(new Set(tags));
  }

  /**
   * 生成详细风险画像
   */
  private generateRiskProfileDetail(
    riskProfile: RiskProfile,
    constraints: RouteConstraints,
    rd: any
  ): RiskProfileDetailDto {
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;

    // 海拔风险等级（0-3）
    let altitude: number = 0;
    if (maxElevation > 5000) {
      altitude = 3;
    } else if (maxElevation > 4000) {
      altitude = 2;
    } else if (maxElevation > 3000) {
      altitude = 1;
    }
    if (riskProfile.altitudeSickness) {
      altitude = Math.max(altitude, 2);
    }

    // 天气风险等级（0-3）
    let weather: number = 0;
    if (riskProfile.weatherWindow) {
      weather = 2;
    }
    if (riskProfile.roadClosure) {
      weather = Math.max(weather, 1);
    }

    // 隔离度风险等级（0-3）
    let isolation: number = 0;
    if (maxElevation > 4000 && riskProfile.altitudeSickness) {
      isolation = 2; // 高海拔通常意味着偏远
    }
    if (riskProfile.ferryDependent) {
      isolation = Math.max(isolation, 1); // 依赖渡轮意味着偏远
    }
    // 可以根据regions数量或其他因素进一步判断
    const regions = rd.regions || [];
    if (regions.length === 0 || regions.length === 1) {
      isolation = Math.max(isolation, 1); // 单一区域可能意味着偏远
    }

    return {
      altitude,
      weather,
      isolation,
    };
  }

  /**
   * 推断典型行程天数
   */
  private inferTypicalDuration(rd: any): number {
    const skeleton = rd.itinerarySkeleton;
    if (skeleton?.dayThemes && Array.isArray(skeleton.dayThemes)) {
      return skeleton.dayThemes.length;
    }
    // 默认7天
    return 7;
  }

  /**
   * 简单生成tagline（降级处理）
   */
  private generateSimpleTagline(rd: any): string {
    const tags = rd.tags || [];
    if (tags.length > 0) {
      return `${tags.slice(0, 2).join(' + ')}探索路线`;
    }
    return `${rd.nameCN || rd.name}之旅`;
  }

  /**
   * 简单生成description（降级处理）
   */
  private generateSimpleDescription(
    rd: any,
    constraints: RouteConstraints,
    riskProfile: RiskProfile
  ): string {
    const parts: string[] = [];
    parts.push(`${rd.nameCN || rd.name}是一条独特的旅行路线。`);
    
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM;
    if (maxElevation) {
      parts.push(`路线最高海拔${maxElevation}米。`);
    }
    
    if (riskProfile.altitudeSickness) {
      parts.push('路线涉及高海拔区域，需要注意高反风险。');
    }
    
    parts.push('这条路线将带你深入探索目的地的独特魅力，体验与众不同的旅行方式。');
    
    return parts.join('');
  }

  /**
   * 提取风险类型（兼容旧方法）
   */
  private extractRiskTypes(riskProfile: RiskProfile): any[] {
    const risks: any[] = [];

    if (riskProfile.altitudeSickness) {
      risks.push('HIGH_ALTITUDE');
    }
    if (riskProfile.weatherWindow) {
      risks.push('WEATHER_WINDOW');
    }
    if (riskProfile.roadClosure) {
      risks.push('ROAD_CLOSURE');
    }
    if (riskProfile.ferryDependent) {
      risks.push('FERRY');
    }

    return risks;
  }
}

