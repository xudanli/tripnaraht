// src/content-strategy/services/brand-expression.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RationalExpression,
  WarmthExpression,
  BalancedCopy,
  ExpressionContext,
  CommunicationContext,
  CommunicationScenario,
} from '../interfaces/brand-expression.interface';
import { UserContext } from '../interfaces/copy-standards.interface';

/**
 * 品牌表达服务
 * 
 * 实现"理性+温度"的品牌表达框架：
 * - 理性表达的四个层级（事实、关系、预测、建议）
 * - 温度表达的四个维度（理解、陪伴、鼓励、细节）
 * - 理性和温度的平衡法则
 */
@Injectable()
export class BrandExpressionService {
  private readonly logger = new Logger(BrandExpressionService.name);

  /**
   * 生成理性表达的四个层级
   */
  generateRationalExpression(
    data: any,
    context: ExpressionContext,
  ): RationalExpression {
    return {
      factLayer: this.generateFactLayer(data),
      relationLayer: this.generateRelationLayer(data),
      predictionLayer: this.generatePredictionLayer(data),
      suggestionLayer: this.generateSuggestionLayer(data, context),
    };
  }

  /**
   * 生成温度表达的四个维度
   */
  generateWarmthExpression(
    userContext: UserContext,
    context: ExpressionContext,
  ): WarmthExpression {
    return {
      understanding: this.generateUnderstanding(userContext),
      companion: this.generateCompanion(),
      encouragement: this.generateEncouragement(userContext),
      detail: this.generateDetail(context),
    };
  }

  /**
   * 生成平衡的文案（理性+温度）
   */
  generateBalancedCopy(
    content: any,
    context: CommunicationContext,
  ): BalancedCopy {
    const ratio = this.determineRatio(context);
    const rationalExpression = this.generateRationalExpression(content, {
      scenario: context.scenario,
      userContext: context.userContext,
      dataContext: content,
    });
    const warmthExpression = this.generateWarmthExpression(
      context.userContext || {},
      {
        scenario: context.scenario,
        userContext: context.userContext,
        dataContext: content,
      },
    );

    const rationalText = this.generateRationalText(rationalExpression, ratio.rational);
    const warmthText = this.generateWarmthText(warmthExpression, ratio.warmth);
    const combined = this.combineParts(rationalText, warmthText, ratio);

    return {
      rational: {
        text: rationalText,
        layers: rationalExpression,
      },
      warmth: {
        text: warmthText,
        dimensions: warmthExpression,
      },
      combined,
      ratio,
    };
  }

  // ========== 理性表达层级生成 ==========

  /**
   * 生成事实层
   */
  private generateFactLayer(data: any): RationalExpression['factLayer'] {
    const facts: string[] = [];
    const dataObj: Record<string, any> = {};

    if (data.name) {
      facts.push(`路线名称：${data.name}`);
      dataObj.name = data.name;
    }

    if (data.duration) {
      facts.push(`预计时长：${data.duration}天`);
      dataObj.duration = data.duration;
    }

    if (data.tags && Array.isArray(data.tags)) {
      facts.push(`路线标签：${data.tags.join('、')}`);
      dataObj.tags = data.tags;
    }

    if (data.seasonality) {
      if (data.seasonality.bestMonths) {
        facts.push(`最佳月份：${data.seasonality.bestMonths.join('、')}月`);
        dataObj.bestMonths = data.seasonality.bestMonths;
      }
    }

    return {
      facts: facts.length > 0 ? facts : ['路线基本信息'],
      data: dataObj,
    };
  }

  /**
   * 生成关系层
   */
  private generateRelationLayer(data: any): RationalExpression['relationLayer'] {
    const relations: string[] = [];
    const connections: RationalExpression['relationLayer']['connections'] = [];

    if (data.seasonality && data.riskProfile) {
      relations.push('季节性因素与风险存在关联');
      connections.push({
        from: '季节性',
        to: '风险',
        relation: '最佳季节通常风险较低',
      });
    }

    if (data.constraints && data.riskProfile) {
      relations.push('路线约束与风险相关');
      connections.push({
        from: '路线约束',
        to: '风险',
        relation: '约束条件影响风险水平',
      });
    }

    return {
      relations: relations.length > 0 ? relations : ['路线各要素之间存在关联'],
      connections: connections.length > 0 ? connections : [],
    };
  }

  /**
   * 生成预测层
   */
  private generatePredictionLayer(data: any): RationalExpression['predictionLayer'] {
    const predictions: RationalExpression['predictionLayer']['predictions'] = [];

    if (data.seasonality) {
      const currentMonth = new Date().getMonth() + 1;
      const isBestSeason = data.seasonality.bestMonths?.includes(currentMonth);
      predictions.push({
        scenario: '季节性体验',
        probability: isBestSeason ? 0.9 : 0.6,
        explanation: isBestSeason
          ? '当前处于最佳旅行季节，体验预期良好'
          : '当前不是最佳季节，但体验仍可接受',
      });
    }

    if (data.completionProbability !== undefined) {
      predictions.push({
        scenario: '完成可能性',
        probability: data.completionProbability,
        explanation: `基于当前条件，完成这条路线的可能性为${Math.round(data.completionProbability * 100)}%`,
      });
    }

    return {
      predictions: predictions.length > 0 ? predictions : [
        {
          scenario: '整体体验',
          probability: 0.7,
          explanation: '基于路线特征，预期体验良好',
        },
      ],
    };
  }

  /**
   * 生成建议层
   */
  private generateSuggestionLayer(
    data: any,
    context: ExpressionContext,
  ): RationalExpression['suggestionLayer'] {
    const suggestions: string[] = [];
    const rationale: string[] = [];

    if (data.constraints?.requiresPermit) {
      suggestions.push('提前申请相关许可');
      rationale.push('路线要求必须获得许可才能进入');
    }

    if (data.riskProfile?.altitudeSickness) {
      suggestions.push('提前适应高海拔环境');
      rationale.push('路线涉及高海拔地区，需要适应以避免高反');
    }

    if (data.riskProfile?.weatherWindow) {
      suggestions.push('关注天气预报，准备应对恶劣天气');
      rationale.push('路线受天气窗口限制，需要关注天气变化');
    }

    return {
      suggestions: suggestions.length > 0 ? suggestions : ['做好充分准备'],
      rationale: rationale.length > 0 ? rationale : ['基于路线特征，建议做好充分准备'],
    };
  }

  // ========== 温度表达维度生成 ==========

  /**
   * 生成理解维度
   */
  private generateUnderstanding(userContext: UserContext): WarmthExpression['understanding'] {
    return {
      message: '我理解你的想法和顾虑',
      empathy: [
        '做出旅行决定并不容易',
        '你希望找到最适合自己的路线',
        '我们理解你的犹豫和思考',
      ],
    };
  }

  /**
   * 生成陪伴维度
   */
  private generateCompanion(): WarmthExpression['companion'] {
    return {
      message: '我们会陪伴你一起探索',
      support: [
        '你不是一个人在决策',
        '我们会提供你需要的信息和支持',
        '无论你做出什么决定，我们都会支持你',
      ],
    };
  }

  /**
   * 生成鼓励维度
   */
  private generateEncouragement(userContext: UserContext): WarmthExpression['encouragement'] {
    return {
      message: '相信你能做出最适合自己的决定',
      positive: [
        '你已经迈出了第一步',
        '你的思考和谨慎是值得赞赏的',
        '无论结果如何，这个过程都是有价值的',
      ],
    };
  }

  /**
   * 生成细节维度
   */
  private generateDetail(context: ExpressionContext): WarmthExpression['detail'] {
    const personalized: string[] = [];
    const attention: string[] = [];

    if (context.userContext?.preferences) {
      personalized.push('我们注意到你的偏好和需求');
      attention.push('我们会根据你的情况提供个性化建议');
    }

    return {
      personalized: personalized.length > 0 ? personalized : ['我们会关注你的具体情况'],
      attention: attention.length > 0 ? attention : ['我们会关注每一个细节'],
    };
  }

  // ========== 平衡法则 ==========

  /**
   * 确定理性和温度的比例
   */
  private determineRatio(context: CommunicationContext): { rational: number; warmth: number } {
    const ratios: Record<CommunicationScenario, { rational: number; warmth: number }> = {
      risk_warning: { rational: 0.8, warmth: 0.2 },
      decision_support: { rational: 0.7, warmth: 0.3 },
      encouragement: { rational: 0.3, warmth: 0.7 },
      story_sharing: { rational: 0.4, warmth: 0.6 },
      error_handling: { rational: 0.5, warmth: 0.5 },
      information_sharing: { rational: 0.65, warmth: 0.35 },
      rejection: { rational: 0.6, warmth: 0.4 },
      confirmation: { rational: 0.5, warmth: 0.5 },
    };

    return ratios[context.scenario] || { rational: 0.65, warmth: 0.35 };
  }

  /**
   * 生成理性文本
   */
  private generateRationalText(
    expression: RationalExpression,
    ratio: number,
  ): string {
    const parts: string[] = [];

    // 事实层
    if (expression.factLayer.facts.length > 0) {
      parts.push(expression.factLayer.facts.join('。'));
    }

    // 关系层
    if (expression.relationLayer.relations.length > 0) {
      parts.push(expression.relationLayer.relations.join('。'));
    }

    // 预测层
    if (expression.predictionLayer.predictions.length > 0) {
      const prediction = expression.predictionLayer.predictions[0];
      parts.push(`${prediction.scenario}：${prediction.explanation}`);
    }

    // 建议层
    if (expression.suggestionLayer.suggestions.length > 0) {
      parts.push(`建议：${expression.suggestionLayer.suggestions.join('、')}`);
    }

    return parts.join(' ');
  }

  /**
   * 生成温度文本
   */
  private generateWarmthText(
    expression: WarmthExpression,
    ratio: number,
  ): string {
    const parts: string[] = [];

    // 理解
    if (ratio >= 0.3) {
      parts.push(expression.understanding.message);
    }

    // 陪伴
    if (ratio >= 0.4) {
      parts.push(expression.companion.message);
    }

    // 鼓励
    if (ratio >= 0.5) {
      parts.push(expression.encouragement.message);
    }

    // 细节
    if (expression.detail.personalized.length > 0 && ratio >= 0.3) {
      parts.push(expression.detail.personalized[0]);
    }

    return parts.join(' ');
  }

  /**
   * 组合理性和温度部分
   */
  private combineParts(
    rationalText: string,
    warmthText: string,
    ratio: { rational: number; warmth: number },
  ): string {
    const parts: string[] = [];

    // 根据比例决定顺序和权重
    if (ratio.rational >= ratio.warmth) {
      // 理性优先
      parts.push(rationalText);
      if (warmthText) {
        parts.push(warmthText);
      }
    } else {
      // 温度优先
      if (warmthText) {
        parts.push(warmthText);
      }
      parts.push(rationalText);
    }

    return parts.filter(p => p.trim().length > 0).join(' ');
  }
}
