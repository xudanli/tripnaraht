// src/content-strategy/services/copy-standards.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RecommendationCopy,
  RiskCopy,
  RejectionCopy,
  DataPresentationCopy,
  UserContext,
  TechnicalRisk,
  RejectionReason,
  RiskType,
} from '../interfaces/copy-standards.interface';
import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';

/**
 * 话术规范服务
 * 
 * 实现系统化的话术规范框架：
 * - 推荐话术（基于匹配度）
 * - 警告话术（风险话术，赋能用户）
 * - 拒绝话术（诚实说"不推荐"）
 * - 数据呈现话术
 */
@Injectable()
export class CopyStandardsService {
  private readonly logger = new Logger(CopyStandardsService.name);

  /**
   * 生成推荐话术（基于匹配度）
   */
  generateMatchingBasedRecommendation(
    route: RouteDirectionData,
    matchingScore: number,
    userContext: UserContext,
  ): RecommendationCopy {
    const reasons = this.generateReasons(route, userContext, matchingScore);
    const considerations = this.generateConsiderations(route);
    const alternatives = this.generateAlternatives(route, userContext);

    // 根据匹配度生成标题
    let headline: string;
    if (matchingScore >= 0.85) {
      headline = `这条路线与你的偏好高度匹配`;
    } else if (matchingScore >= 0.7) {
      headline = `这条路线基本符合你的需求`;
    } else {
      headline = `这条路线部分匹配你的偏好`;
    }

    return {
      headline,
      reasons,
      considerations,
      alternatives,
      analysis: {
        matchingPoints: this.extractMatchingPoints(route, userContext),
        potentialChallenges: this.identifyPotentialChallenges(route, userContext),
        preparationNeeds: this.identifyPreparationNeeds(route),
      },
    };
  }

  /**
   * 生成风险话术（赋能用户）
   */
  generateRiskCopy(risk: TechnicalRisk): RiskCopy {
    const what = this.translateRiskType(risk.type);
    const why = this.explainRiskReason(risk);
    const howToPrepare = this.generatePreparationGuide(risk);
    const empowerment = this.generateEmpowermentMessage(risk);
    const possibilities = this.generatePossibilities(risk);

    return {
      what,
      why,
      howToPrepare,
      empowerment,
      possibilities,
    };
  }

  /**
   * 生成拒绝话术（诚实说"不推荐"）
   */
  generateHonestRejection(
    route: RouteDirectionData,
    reason: RejectionReason,
    userContext: UserContext,
  ): RejectionCopy {
    switch (reason.type) {
      case 'SAFETY_RISK':
        return {
          headline: '我需要明确地告诉你：我们不能推荐这条路线。',
          reason: reason.description || '这个地区现在存在严重的安全风险。',
          alternatives: this.generateAlternatives(route, userContext),
          explanation: '这不是一个可以"咬咬牙就能去"的情况。安全是我们不能妥协的底线。',
        };

      case 'CAPABILITY_MISMATCH':
        const probability = reason.details?.completionProbability || 0.3;
        return {
          headline: `现在去，你完成的概率只有${Math.round(probability * 100)}%。`,
          reason: '这不是打击你。这是说：如果你现在去，你很可能会失败。',
          betterPlan: reason.details?.betterPlan || '建议推迟出发，给你充分准备时间',
          explanation: '我们希望你成功，而不是让你去冒险。',
        };

      case 'CONSTRAINT_VIOLATION':
        return {
          headline: '这不是"咬咬牙就能去"的约束。',
          reason: '这是"去了也体验不好"的约束。',
          alternatives: this.generateAlternatives(route, userContext),
          explanation: '我们希望你能有好的体验，而不是勉强完成。',
        };

      case 'TIMING_ISSUE':
        return {
          headline: '现在不是去这条路线的最佳时机。',
          reason: reason.description || '当前时间安排与路线要求不匹配。',
          betterPlan: reason.details?.betterPlan || '建议调整时间安排',
          alternatives: this.generateAlternatives(route, userContext),
        };

      case 'BUDGET_MISMATCH':
        return {
          headline: '这条路线超出了你的预算范围。',
          reason: reason.description || '预算不足以支持这条路线的完整体验。',
          alternatives: this.generateAlternatives(route, userContext),
          explanation: '我们希望你能在预算范围内获得最好的体验。',
        };

      default:
        return {
          headline: '我们不推荐这条路线。',
          reason: reason.description || '基于当前情况，这条路线不适合你。',
          alternatives: this.generateAlternatives(route, userContext),
        };
    }
  }

  /**
   * 生成数据呈现话术
   */
  generateDataPresentationCopy(
    title: string,
    value: string | number,
    context: {
      whatItMeans?: string;
      source?: string;
      confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
      conclusion?: string;
      reason?: string;
      evidence?: string;
    },
  ): DataPresentationCopy {
    const whatItMeans =
      context.whatItMeans ||
      this.inferMeaning(title, value, context.confidence || 'MEDIUM');

    return {
      title,
      value: String(value),
      whatItMeans,
      layers: context.conclusion
        ? {
            level1: context.conclusion,
            level2: context.reason || '',
            level3: context.evidence || '',
          }
        : undefined,
      source: context.source,
      confidence: context.confidence,
    };
  }

  // ========== 私有辅助方法 ==========

  /**
   * 生成推荐理由
   */
  private generateReasons(
    route: RouteDirectionData,
    userContext: UserContext,
    matchingScore: number,
  ): string[] {
    const reasons: string[] = [];

    // 基于路线特征
    if (route.tags && route.tags.length > 0) {
      const userPreferences = userContext.preferences?.tags || [];
      const matchingTags = route.tags.filter(tag => userPreferences.includes(tag));
      if (matchingTags.length > 0) {
        reasons.push(`路线包含你偏好的${matchingTags.length}个标签：${matchingTags.join('、')}`);
      }
    }

    // 基于季节性
    if (route.seasonality?.bestMonths) {
      const currentMonth = new Date().getMonth() + 1;
      if (route.seasonality.bestMonths.includes(currentMonth)) {
        reasons.push('当前正处于这条路线的最佳旅行季节');
      }
    }

    // 基于匹配度
    if (matchingScore >= 0.85) {
      reasons.push('路线特征与你的偏好高度匹配');
    } else if (matchingScore >= 0.7) {
      reasons.push('路线特征基本符合你的需求');
    }

    return reasons.length > 0 ? reasons : ['这条路线值得你考虑'];
  }

  /**
   * 生成需要考虑的因素
   */
  private generateConsiderations(route: RouteDirectionData): string[] {
    const considerations: string[] = [];

    if (route.constraints?.requiresPermit) {
      considerations.push('需要提前申请相关许可');
    }

    if (route.constraints?.hard?.requiresGuide) {
      considerations.push('建议配备向导');
    }

    if (route.riskProfile?.altitudeSickness) {
      considerations.push('需要注意高反风险，提前适应');
    }

    if (route.riskProfile?.weatherWindow) {
      considerations.push('受天气窗口限制，需要关注天气预报');
    }

    return considerations;
  }

  /**
   * 生成替代方案
   */
  private generateAlternatives(
    route: RouteDirectionData,
    userContext: UserContext,
  ): string[] {
    // 简化实现：基于路线特征生成替代建议
    const alternatives: string[] = [];

    if (route.regions && route.regions.length > 0) {
      alternatives.push(`可以考虑同一地区的其他路线`);
    }

    if (route.tags && route.tags.length > 0) {
      alternatives.push(`可以寻找具有相似标签的其他路线`);
    }

    return alternatives.length > 0 ? alternatives : ['可以探索其他路线选项'];
  }

  /**
   * 提取匹配点
   */
  private extractMatchingPoints(
    route: RouteDirectionData,
    userContext: UserContext,
  ): string[] {
    const points: string[] = [];

    if (route.tags && userContext.preferences?.tags) {
      const matchingTags = route.tags.filter(tag =>
        userContext.preferences?.tags?.includes(tag),
      );
      if (matchingTags.length > 0) {
        points.push(`标签匹配：${matchingTags.join('、')}`);
      }
    }

    return points;
  }

  /**
   * 识别潜在挑战
   */
  private identifyPotentialChallenges(
    route: RouteDirectionData,
    userContext: UserContext,
  ): string[] {
    const challenges: string[] = [];

    if (route.constraints?.hard?.maxElevationM) {
      challenges.push(`最高海拔${route.constraints.hard.maxElevationM}米，需要适应高海拔环境`);
    }

    if (route.riskProfile?.altitudeSickness) {
      challenges.push('高反风险，需要提前准备和适应');
    }

    return challenges;
  }

  /**
   * 识别准备需求
   */
  private identifyPreparationNeeds(route: RouteDirectionData): string[] {
    const needs: string[] = [];

    if (route.constraints?.requiresPermit) {
      needs.push('申请相关许可');
    }

    if (route.constraints?.hard?.requiresGuide) {
      needs.push('联系向导');
    }

    if (route.riskProfile?.altitudeSickness) {
      needs.push('高反预防准备');
    }

    return needs;
  }

  /**
   * 翻译风险类型
   */
  private translateRiskType(type: RiskType): string {
    const translations: Record<RiskType, string> = {
      WEATHER: '天气风险',
      PHYSICAL: '体力风险',
      SAFETY: '安全风险',
      LOGISTICS: '物流风险',
      FINANCIAL: '财务风险',
      OTHER: '其他风险',
    };
    return translations[type] || '未知风险';
  }

  /**
   * 解释风险原因
   */
  private explainRiskReason(risk: TechnicalRisk): string {
    switch (risk.type) {
      case 'WEATHER':
        return '这个季节天气变化较快，可能出现不利天气条件';
      case 'PHYSICAL':
        return '路线对体力和经验要求较高，可能超出你的当前能力';
      case 'SAFETY':
        return '存在安全风险，需要特别注意';
      case 'LOGISTICS':
        return '交通或住宿等物流安排可能存在不确定性';
      case 'FINANCIAL':
        return '实际费用可能超出预算';
      default:
        return risk.description || '存在一定风险';
    }
  }

  /**
   * 生成准备指南
   */
  private generatePreparationGuide(risk: TechnicalRisk): string[] {
    const guides: string[] = [];

    switch (risk.type) {
      case 'WEATHER':
        guides.push('关注天气预报，准备应对恶劣天气的装备');
        guides.push('准备雨具和保暖衣物');
        guides.push('了解当地天气模式');
        break;
      case 'PHYSICAL':
        guides.push('提前进行体能训练');
        guides.push('逐步增加训练强度');
        guides.push('准备必要的装备和补给');
        break;
      case 'SAFETY':
        guides.push('了解当地安全情况');
        guides.push('准备应急联系方式和设备');
        guides.push('遵守安全规定和当地法律');
        break;
      case 'LOGISTICS':
        guides.push('提前预订交通和住宿');
        guides.push('准备备用方案');
        guides.push('了解当地交通和住宿情况');
        break;
      case 'FINANCIAL':
        guides.push('准备应急资金');
        guides.push('了解当地消费水平');
        guides.push('制定详细的预算计划');
        break;
      default:
        guides.push('充分了解相关情况');
        guides.push('做好充分准备');
    }

    return guides;
  }

  /**
   * 生成赋能信息
   */
  private generateEmpowermentMessage(risk: TechnicalRisk): string {
    switch (risk.level) {
      case 'CRITICAL':
        return '这个风险需要特别重视，建议重新评估是否适合前往';
      case 'HIGH':
        return '如果你能做到充分准备，风险可以在可控范围内';
      case 'MEDIUM':
        return '通过适当的准备和注意，你可以应对这个风险';
      case 'LOW':
        return '这个风险较低，做好基本准备即可';
      default:
        return '通过充分准备，你可以应对这个风险';
    }
  }

  /**
   * 生成可能性分析
   */
  private generatePossibilities(risk: TechnicalRisk): string[] {
    const possibilities: string[] = [];

    switch (risk.type) {
      case 'WEATHER':
        possibilities.push('可能出现降雨或恶劣天气');
        possibilities.push('天气可能影响行程安排');
        possibilities.push('需要调整行程计划');
        break;
      case 'PHYSICAL':
        possibilities.push('可能无法完成全部行程');
        possibilities.push('可能需要更多休息时间');
        possibilities.push('可能需要调整行程节奏');
        break;
      default:
        possibilities.push('可能出现相关挑战');
        possibilities.push('需要灵活应对');
    }

    return possibilities;
  }

  /**
   * 推断数据含义
   */
  private inferMeaning(
    title: string,
    value: string | number,
    confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  ): string {
    // 简化实现：基于标题和值推断含义
    if (typeof value === 'number') {
      if (title.includes('匹配度') || title.includes('匹配')) {
        if (value >= 0.85) {
          return '高度匹配，非常适合';
        } else if (value >= 0.7) {
          return '基本匹配，值得考虑';
        } else {
          return '部分匹配，需要评估';
        }
      }
    }

    return '这表示相关情况或状态';
  }
}
