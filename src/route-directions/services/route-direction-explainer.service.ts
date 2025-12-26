// src/route-directions/services/route-direction-explainer.service.ts
/**
 * RouteDirection Explainer Service
 * 
 * 将 RouteDirection 转换为可解释、可对外讲、可运营的产品资产
 */

import { Injectable, Logger } from '@nestjs/common';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionExplainer, TerrainProfile, RiskProfileExplainer } from '../interfaces/route-direction-explainer.interface';
import { RouteConstraints, RiskProfile, Seasonality } from '../interfaces/route-direction.interface';

@Injectable()
export class RouteDirectionExplainerService {
  private readonly logger = new Logger(RouteDirectionExplainerService.name);

  /**
   * 生成路线方向说明卡
   */
  generateExplainer(
    recommendation: RouteDirectionRecommendation
  ): RouteDirectionExplainer {
    const rd = recommendation.routeDirection as any;
    const constraints = (rd.constraints || {}) as RouteConstraints;
    const riskProfile = (rd.riskProfile || {}) as RiskProfile;
    const seasonality = (rd.seasonality || {}) as Seasonality;
    const tags = rd.tags || [];

    // 生成 tagline（一句话）
    const tagline = this.generateTagline(rd, tags, riskProfile);

    // 生成 description（150~300 字）
    const description = this.generateDescription(rd, constraints, riskProfile, tags);

    // 生成 suitableFor / notSuitableFor
    const { suitableFor, notSuitableFor } = this.generateSuitability(rd, constraints, riskProfile, tags);

    // 生成 terrainProfile
    const terrainProfile = this.generateTerrainProfile(constraints, rd);

    // 生成 riskProfile
    const riskProfileExplainer = this.generateRiskProfileExplainer(riskProfile, constraints, rd);

    // 生成 keywords
    const keywords = this.generateKeywords(rd, tags, riskProfile);

    // 生成 culturalHighlights 和 signatureExperiences
    const { culturalHighlights, signatureExperiences } = this.extractHighlights(rd, tags);

    return {
      id: rd.id,
      uuid: rd.uuid || '',
      title: rd.nameEN || rd.name || '',
      titleCN: rd.nameCN || rd.name || '',
      tagline,
      description,
      suitableFor,
      notSuitableFor,
      bestMonths: seasonality.bestMonths || [],
      avoidMonths: seasonality.avoidMonths,
      terrainProfile,
      riskProfile: riskProfileExplainer,
      keywords,
      culturalHighlights,
      signatureExperiences,
      typicalDuration: this.inferTypicalDuration(rd),
      entryPoints: rd.entryHubs || [],
      exitPoints: rd.entryHubs || [], // 可以扩展为单独的 exitPoints
      metadata: {
        version: rd.version,
        lastUpdated: rd.updatedAt || new Date().toISOString(),
        source: 'RouteDirection System',
      },
    };
  }

  /**
   * 生成 tagline（一句话）
   */
  private generateTagline(
    rd: any,
    tags: string[],
    riskProfile: RiskProfile
  ): string {
    // 基于标签和风险画像生成一句话
    const tagKeywords = tags.slice(0, 2).join(' + ');
    const riskKeyword = riskProfile.altitudeSickness ? '高海拔' : '';
    const culturalKeyword = tags.includes('文化') || tags.includes('culture') ? '文化' : '';
    
    if (riskKeyword && culturalKeyword) {
      return `${riskKeyword}${culturalKeyword}${tagKeywords}走廊`;
    } else if (riskKeyword) {
      return `${riskKeyword}${tagKeywords}路线`;
    } else if (culturalKeyword) {
      return `${culturalKeyword}${tagKeywords}之旅`;
    } else {
      return `${tagKeywords}探索路线`;
    }
  }

  /**
   * 生成 description（150~300 字）
   */
  private generateDescription(
    rd: any,
    constraints: RouteConstraints,
    riskProfile: RiskProfile,
    tags: string[]
  ): string {
    const parts: string[] = [];

    // 开头：路线定位
    parts.push(`${rd.nameCN || rd.name}是一条${tags.join('、')}主题的旅行路线。`);

    // 地形特征
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM;
    const maxAscent = constraints.soft?.maxDailyAscentM || constraints.maxDailyAscentM;
    if (maxElevation) {
      parts.push(`路线最高海拔${maxElevation}米`);
      if (maxAscent) {
        parts.push(`，每日最大爬升约${maxAscent}米`);
      }
      parts.push('。');
    }

    // 风险特征
    if (riskProfile.altitudeSickness) {
      parts.push('路线涉及高海拔区域，需要注意高反风险。');
    }
    if (riskProfile.weatherWindow) {
      parts.push('受天气窗口限制，建议在最佳季节前往。');
    }
    if (riskProfile.ferryDependent) {
      parts.push('部分路段依赖渡轮，需提前预订。');
    }

    // 文化/体验亮点
    if (tags.includes('文化') || tags.includes('culture')) {
      parts.push('路线融合了丰富的当地文化体验。');
    }
    if (tags.includes('摄影') || tags.includes('photography')) {
      parts.push('沿途风景优美，是摄影爱好者的理想选择。');
    }

    // 结尾：适合人群
    const difficulty = this.inferDifficulty(constraints, riskProfile);
    parts.push(`适合${difficulty}的旅行者。`);

    let description = parts.join('');
    
    // 确保长度在 150~300 字之间
    if (description.length < 150) {
      description += '这条路线将带你深入探索目的地的独特魅力，体验与众不同的旅行方式。';
    }
    if (description.length > 300) {
      description = description.substring(0, 297) + '...';
    }

    return description;
  }

  /**
   * 生成适合/不适合人群
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
   * 生成地形画像
   */
  private generateTerrainProfile(
    constraints: RouteConstraints,
    rd: any
  ): TerrainProfile {
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;
    const maxAscent = constraints.soft?.maxDailyAscentM || constraints.maxDailyAscentM || 0;
    const minElevation = maxElevation > 0 ? Math.max(0, maxElevation - 2000) : 0; // 简单估算

    // 计算平均海拔（简化：取中值）
    const avgElevation = (maxElevation + minElevation) / 2;

    // 推断典型坡度（基于约束或默认值）
    const maxSlope = constraints.hard?.maxSlopePct || constraints.maxSlope || 25;
    const typicalSlope = maxSlope * 0.6; // 典型坡度约为最大坡度的 60%

    // 推断难度等级
    const difficultyLevel = this.inferDifficultyLevel(maxElevation, maxAscent, maxSlope);

    return {
      avgElevation: Math.round(avgElevation),
      elevationRange: {
        min: Math.round(minElevation),
        max: Math.round(maxElevation),
      },
      typicalSlope: Math.round(typicalSlope),
      totalAscent: maxAscent > 0 ? Math.round(maxAscent * 7) : undefined, // 假设 7 天行程
      difficultyLevel,
    };
  }

  /**
   * 生成风险画像说明
   */
  private generateRiskProfileExplainer(
    riskProfile: RiskProfile,
    constraints: RouteConstraints,
    rd: any
  ): RiskProfileExplainer {
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;

    // 海拔风险
    let altitudeLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (maxElevation > 5000) {
      altitudeLevel = 'high';
    } else if (maxElevation > 4000) {
      altitudeLevel = 'high';
    } else if (maxElevation > 3000) {
      altitudeLevel = 'medium';
    } else if (maxElevation > 2000) {
      altitudeLevel = 'low';
    }

    // 天气风险
    let weatherLevel: 'stable' | 'variable' | 'unpredictable' | 'extreme' = 'stable';
    if (riskProfile.weatherWindow) {
      weatherLevel = 'unpredictable';
    }
    if (rd.countryCode === 'NP' || rd.countryCode === 'CN_XZ') {
      weatherLevel = 'variable';
    }

    // 隔离程度（简化推断）
    const rdTags = (rd.tags || []) as string[];
    let isolationLevel: 'urban' | 'accessible' | 'remote' | 'very_remote' = 'accessible';
    if (maxElevation > 5000 && riskProfile.altitudeSickness) {
      isolationLevel = 'very_remote';
    } else if (maxElevation > 4000 && riskProfile.altitudeSickness) {
      isolationLevel = 'remote';
    } else if (rdTags.includes('徒步') && maxElevation > 3000) {
      isolationLevel = 'remote';
    } else if (rdTags.includes('城市') || rdTags.includes('city')) {
      isolationLevel = 'urban';
    }

    // 计算隔离相关指标
    let nearestHospitalKm = 20;
    let cellCoverage: 'good' | 'partial' | 'poor' | 'none' = 'good';
    if (isolationLevel === 'very_remote') {
      nearestHospitalKm = 100;
      cellCoverage = 'poor';
    } else if (isolationLevel === 'remote') {
      nearestHospitalKm = 50;
      cellCoverage = 'partial';
    } else if (isolationLevel === 'urban') {
      nearestHospitalKm = 5;
      cellCoverage = 'good';
    }

    return {
      altitude: {
        level: altitudeLevel,
        maxElevation: Math.round(maxElevation),
        daysAbove3000m: maxElevation > 3000 ? 3 : undefined, // 简化估算
        description: this.getAltitudeDescription(altitudeLevel, maxElevation),
      },
      weather: {
        level: weatherLevel,
        weatherWindow: riskProfile.weatherWindow,
        weatherWindowMonths: riskProfile.weatherWindowMonths,
        description: this.getWeatherDescription(weatherLevel, riskProfile),
      },
      isolation: {
        level: isolationLevel,
        nearestHospitalKm,
        cellCoverage,
        description: this.getIsolationDescription(isolationLevel),
      },
      other: {
        roadClosure: riskProfile.roadClosure,
        ferryDependent: riskProfile.ferryDependent,
        permitRequired: constraints.hard?.requiresPermit || constraints.requiresPermit,
        guideRequired: constraints.hard?.requiresGuide || constraints.requiresGuide,
      },
    };
  }

  /**
   * 生成关键词
   */
  private generateKeywords(
    rd: any,
    tags: string[],
    riskProfile: RiskProfile
  ): string[] {
    const keywords: string[] = [];

    // 从 tags 提取
    if (tags && tags.length > 0) {
      keywords.push(...tags.slice(0, 3));
    }

    // 从风险画像提取
    if (riskProfile.altitudeSickness) {
      keywords.push('高海拔');
    }
    if (rd.countryCode === 'NP') {
      keywords.push('Sherpa', '茶屋', '冰川谷地');
    }
    if (rd.countryCode === 'CN_XZ') {
      keywords.push('藏文化', '高原', '圣湖');
    }

    return keywords.slice(0, 5); // 最多 5 个关键词
  }

  /**
   * 提取文化亮点和标志性体验
   */
  private extractHighlights(
    rd: any,
    tags: string[]
  ): { culturalHighlights: string[]; signatureExperiences: string[] } {
    const culturalHighlights: string[] = [];
    const signatureExperiences: string[] = [];

    // 基于标签推断
    if (tags.includes('文化') || tags.includes('culture')) {
      culturalHighlights.push('体验当地传统文化');
      signatureExperiences.push('参观历史遗迹');
    }
    if (tags.includes('徒步') || tags.includes('hiking')) {
      signatureExperiences.push('徒步探索自然');
    }
    if (tags.includes('摄影') || tags.includes('photography')) {
      signatureExperiences.push('拍摄绝美风景');
    }
    if (tags.includes('出海') || tags.includes('sea')) {
      signatureExperiences.push('海上巡游');
    }

    // 基于国家代码
    if (rd.countryCode === 'NP') {
      culturalHighlights.push('Sherpa 文化', '茶屋住宿体验');
      signatureExperiences.push('喜马拉雅徒步', '观赏雪山');
    }
    if (rd.countryCode === 'CN_XZ') {
      culturalHighlights.push('藏传佛教文化', '高原生活体验');
      signatureExperiences.push('朝圣之旅', '高原湖泊');
    }

    return {
      culturalHighlights: culturalHighlights.length > 0 ? culturalHighlights : [],
      signatureExperiences: signatureExperiences.length > 0 ? signatureExperiences : [],
    };
  }

  /**
   * 推断典型行程天数
   */
  private inferTypicalDuration(rd: any): {
    min: number;
    max: number;
    recommended: number;
  } | undefined {
    // 可以从 itinerarySkeleton 或 metadata 中提取
    const skeleton = rd.itinerarySkeleton;
    if (skeleton?.dayThemes) {
      const days = skeleton.dayThemes.length;
      return {
        min: Math.max(3, days - 2),
        max: days + 2,
        recommended: days,
      };
    }

    // 默认值
    return {
      min: 5,
      max: 10,
      recommended: 7,
    };
  }

  /**
   * 推断难度等级
   */
  private inferDifficultyLevel(
    maxElevation: number,
    maxAscent: number,
    maxSlope: number
  ): 'EASY' | 'MODERATE' | 'CHALLENGING' | 'EXTREME' {
    if (maxElevation > 5000 || maxAscent > 1500 || maxSlope > 40) {
      return 'EXTREME';
    }
    if (maxElevation > 4000 || maxAscent > 1000 || maxSlope > 30) {
      return 'CHALLENGING';
    }
    if (maxElevation > 2000 || maxAscent > 500 || maxSlope > 20) {
      return 'MODERATE';
    }
    return 'EASY';
  }

  /**
   * 推断适合人群描述
   */
  private inferDifficulty(
    constraints: RouteConstraints,
    riskProfile: RiskProfile
  ): string {
    const maxElevation = constraints.soft?.maxElevationM || constraints.maxElevationM || 0;
    const maxAscent = constraints.soft?.maxDailyAscentM || constraints.maxDailyAscentM || 0;

    if (maxElevation > 4000 || maxAscent > 1000) {
      return '有经验且体力较好';
    } else if (maxElevation > 2000 || maxAscent > 500) {
      return '有基础经验';
    } else {
      return '一般';
    }
  }

  /**
   * 获取海拔风险描述
   */
  private getAltitudeDescription(
    level: 'none' | 'low' | 'medium' | 'high',
    maxElevation: number
  ): string {
    switch (level) {
      case 'high':
        return `最高海拔${maxElevation}米，存在高反风险，需要充分适应`;
      case 'medium':
        return `最高海拔${maxElevation}米，部分人可能出现高反症状`;
      case 'low':
        return `最高海拔${maxElevation}米，一般不会出现高反`;
      default:
        return '海拔较低，无高反风险';
    }
  }

  /**
   * 获取天气风险描述
   */
  private getWeatherDescription(
    level: 'stable' | 'variable' | 'unpredictable' | 'extreme',
    riskProfile: RiskProfile
  ): string {
    switch (level) {
      case 'extreme':
        return '天气变化极端，需要密切关注天气预报';
      case 'unpredictable':
        return '天气变化不可预测，建议在天气窗口期前往';
      case 'variable':
        return '天气变化较大，建议准备应对措施';
      default:
        return '天气相对稳定';
    }
  }

  /**
   * 获取隔离程度描述
   */
  private getIsolationDescription(
    level: 'urban' | 'accessible' | 'remote' | 'very_remote'
  ): string {
    switch (level) {
      case 'very_remote':
        return '非常偏远，医疗和通讯条件有限';
      case 'remote':
        return '较为偏远，需要做好充分准备';
      case 'accessible':
        return '交通便利，基础设施完善';
      default:
        return '城市区域，设施完善';
    }
  }
}

