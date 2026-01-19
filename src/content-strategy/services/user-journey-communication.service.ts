// src/content-strategy/services/user-journey-communication.service.ts

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import {
  Stage1Response,
  Stage2Response,
  Stage3Response,
  Stage4Response,
  UserDecision,
} from '../interfaces/user-journey.interface';
import { UserContext } from '../interfaces/copy-standards.interface';
import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';
import { CopyStandardsService } from './copy-standards.service';
import { RouteJudgmentService } from '../../route-directions/services/route-judgment.service';
import { DecisionSupportService } from '../../trips/decision/services/decision-support.service';

/**
 * 用户旅程沟通服务
 * 
 * 实现四阶段用户旅程沟通策略：
 * - 阶段一：模糊意向 → 兴趣激发
 * - 阶段二：信息探索 → 判断形成
 * - 阶段三：方案评估 → 决策倾向
 * - 阶段四：决策确认 → 行动启动
 */
@Injectable()
export class UserJourneyCommunicationService {
  private readonly logger = new Logger(UserJourneyCommunicationService.name);

  constructor(
    private readonly copyStandards: CopyStandardsService,
    @Optional() private readonly routeJudgment?: RouteJudgmentService,
    @Optional() private readonly decisionSupport?: DecisionSupportService,
  ) {}

  /**
   * 阶段一：模糊意向 → 兴趣激发
   */
  async handleStage1_InterestArousal(userContext: UserContext): Promise<Stage1Response> {
    return {
      firstScreenCopy: this.generateFirstScreenCopy(),
      onboardingQuestionnaire: this.generateOnboardingQuestionnaire(),
      quickFeedback: this.generateQuickFeedback(userContext),
    };
  }

  /**
   * 阶段二：信息探索 → 判断形成
   */
  async handleStage2_InformationExploration(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage2Response> {
    return {
      informationCards: await this.generateInformationCards(route, userContext),
      comparisonTool: await this.generateComparisonTool(route, userContext),
      riskHonesty: await this.generateRiskHonesty(route),
      sourceAnnotation: await this.generateSourceAnnotation(route),
    };
  }

  /**
   * 阶段三：方案评估 → 决策倾向
   */
  async handleStage3_OptionEvaluation(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage3Response> {
    return {
      matchingAnalysis: await this.generateMatchingAnalysis(route, userContext),
      feasibilityAssessment: await this.generateFeasibilityAssessment(route, userContext),
      costBenefitClarification: await this.generateCostBenefitClarification(route),
      decisionReflection: await this.generateDecisionReflection(route, userContext),
    };
  }

  /**
   * 阶段四：决策确认 → 行动启动
   */
  async handleStage4_DecisionConfirmation(
    decision: UserDecision,
    userContext: UserContext,
  ): Promise<Stage4Response> {
    if (decision.choice === 'GO') {
      return await this.generateGoConfirmation(decision, userContext);
    } else if (decision.choice === 'NO_GO') {
      return await this.generateNoGoResponse(decision, userContext);
    } else {
      return await this.generateDeferResponse(decision, userContext);
    }
  }

  // ========== 阶段一辅助方法 ==========

  /**
   * 生成首屏文案
   */
  private generateFirstScreenCopy(): string {
    return `「判断，而非规划」

你想去一个地方吗？
但你不确定这是不是现在最好的选择。

TripNARA帮你看清：
- 这个地方现在什么样
- 它对你意味着什么
- 你需要什么准备

不是让你听别人说好，
而是让你自己判断值不值得。

开始了解`;
  }

  /**
   * 生成入门问卷
   */
  private generateOnboardingQuestionnaire(): Stage1Response['onboardingQuestionnaire'] {
    return {
      questions: [
        {
          id: 'destination',
          question: '你想去哪里？',
          type: 'text',
          required: true,
        },
        {
          id: 'travel_dates',
          question: '你计划什么时候出发？',
          type: 'text',
          required: false,
        },
        {
          id: 'duration',
          question: '你计划旅行多少天？',
          type: 'number',
          required: false,
        },
        {
          id: 'travel_style',
          question: '你更偏好什么样的旅行方式？',
          type: 'single_choice',
          options: ['轻松休闲', '平衡体验', '挑战冒险'],
          required: false,
        },
        {
          id: 'budget',
          question: '你的预算范围是？',
          type: 'single_choice',
          options: ['经济实惠', '中等预算', '高端体验'],
          required: false,
        },
        {
          id: 'interests',
          question: '你对什么感兴趣？（可多选）',
          type: 'multiple_choice',
          options: ['自然风光', '历史文化', '美食体验', '户外运动', '城市探索'],
          required: false,
        },
      ],
    };
  }

  /**
   * 生成快速反馈
   */
  private generateQuickFeedback(userContext: UserContext): Stage1Response['quickFeedback'] {
    return {
      message: '告诉我们你的想法，我们会帮你找到最适合的路线。',
      actions: [
        {
          label: '开始探索',
          action: 'explore',
        },
        {
          label: '了解更多',
          action: 'learn_more',
        },
      ],
    };
  }

  // ========== 阶段二辅助方法 ==========

  /**
   * 生成信息卡片
   */
  private async generateInformationCards(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage2Response['informationCards']> {
    const cards: Stage2Response['informationCards'] = [];

    // 基本信息卡片
    cards.push({
      type: 'BASIC_INFO',
      title: '基本信息',
      content: {
        name: route.nameCN || route.name,
        description: route.description,
        tags: route.tags,
        regions: route.regions,
      },
    });

    // 当前条件卡片
    if (route.seasonality) {
      cards.push({
        type: 'CURRENT_CONDITIONS',
        title: '当前条件',
        content: {
          seasonality: route.seasonality,
          bestMonths: route.seasonality.bestMonths || [],
        },
      });
    }

    // 匹配度卡片
    if (userContext.preferences) {
      cards.push({
        type: 'MATCHING',
        title: '匹配度分析',
        content: {
          matchingTags: route.tags?.filter(tag =>
            userContext.preferences?.tags?.includes(tag),
          ),
        },
      });
    }

    // 风险概览卡片
    if (route.riskProfile) {
      cards.push({
        type: 'RISK_OVERVIEW',
        title: '风险概览',
        content: {
          risks: this.extractRisks(route.riskProfile),
        },
      });
    }

    return cards;
  }

  /**
   * 生成对比工具
   */
  private async generateComparisonTool(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage2Response['comparisonTool']> {
    // 简化实现：返回当前路线
    return {
      routes: [
        {
          id: String(route.metadata?.id || 'unknown'),
          name: route.nameCN || route.name,
          comparison: {
            duration: route.metadata?.estimatedDuration || 0,
            difficulty: route.constraints?.hard?.maxElevationM || 0,
            tags: route.tags || [],
          },
        },
      ],
    };
  }

  /**
   * 生成风险坦诚
   */
  private async generateRiskHonesty(
    route: RouteDirectionData,
  ): Promise<Stage2Response['riskHonesty']> {
    const risks: Stage2Response['riskHonesty']['risks'] = [];

    if (route.riskProfile?.altitudeSickness) {
      risks.push({
        type: '高反风险',
        description: '路线涉及高海拔地区，可能存在高反风险',
        level: 'MEDIUM',
        preparation: ['提前适应高海拔', '准备高反药物', '了解高反症状'],
      });
    }

    if (route.riskProfile?.weatherWindow) {
      risks.push({
        type: '天气窗口',
        description: '受天气窗口限制，需要关注天气预报',
        level: 'MEDIUM',
        preparation: ['关注天气预报', '准备应对恶劣天气的装备', '准备备用方案'],
      });
    }

    if (route.riskProfile?.roadClosure) {
      risks.push({
        type: '封路风险',
        description: '可能存在道路封闭的情况',
        level: 'HIGH',
        preparation: ['了解道路状况', '准备替代路线', '关注交通信息'],
      });
    }

    return { risks };
  }

  /**
   * 生成来源标注
   */
  private async generateSourceAnnotation(
    route: RouteDirectionData,
  ): Promise<Stage2Response['sourceAnnotation']> {
    return {
      sources: [
        {
          type: 'ROUTE_DATA',
          name: '路线数据',
          confidence: 'HIGH',
        },
        {
          type: 'SEASONALITY_DATA',
          name: '季节性数据',
          confidence: route.seasonality ? 'HIGH' : 'MEDIUM',
        },
        {
          type: 'RISK_DATA',
          name: '风险评估数据',
          confidence: route.riskProfile ? 'HIGH' : 'MEDIUM',
        },
      ],
    };
  }

  // ========== 阶段三辅助方法 ==========

  /**
   * 生成匹配度分析
   */
  private async generateMatchingAnalysis(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage3Response['matchingAnalysis']> {
    // 计算匹配度
    const userTags = userContext.preferences?.tags || [];
    const routeTags = route.tags || [];
    const matchingTags = routeTags.filter(tag => userTags.includes(tag));
    const overallScore = routeTags.length > 0 ? matchingTags.length / routeTags.length : 0.5;

    const dimensions: Stage3Response['matchingAnalysis']['dimensions'] = [];

    // 标签匹配
    dimensions.push({
      dimension: '兴趣标签',
      score: overallScore,
      explanation: `路线包含${matchingTags.length}个你偏好的标签`,
    });

    // 季节性匹配
    if (route.seasonality?.bestMonths) {
      const currentMonth = new Date().getMonth() + 1;
      const isBestSeason = route.seasonality.bestMonths.includes(currentMonth);
      dimensions.push({
        dimension: '季节性',
        score: isBestSeason ? 1.0 : 0.5,
        explanation: isBestSeason ? '当前处于最佳旅行季节' : '当前不是最佳旅行季节',
      });
    }

    return {
      overallScore,
      dimensions,
      summary: overallScore >= 0.7
        ? '路线与你的偏好高度匹配'
        : overallScore >= 0.5
          ? '路线基本符合你的需求'
          : '路线部分匹配你的偏好',
    };
  }

  /**
   * 生成可完成性评估
   */
  private async generateFeasibilityAssessment(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage3Response['feasibilityAssessment']> {
    const factors: Stage3Response['feasibilityAssessment']['factors'] = [];

    // 检查时间可行性
    const routeDuration = route.metadata?.estimatedDuration || 0;
    const availableDays = userContext.currentState?.availableDays || 7;
    factors.push({
      factor: '时间可行性',
      status: routeDuration <= availableDays ? 'PASS' : 'WARNING',
      explanation:
        routeDuration <= availableDays
          ? `路线时长${routeDuration}天，你有${availableDays}天，时间充足`
          : `路线时长${routeDuration}天，你只有${availableDays}天，时间较紧`,
    });

    // 检查准入要求
    if (route.constraints?.requiresPermit) {
      factors.push({
        factor: '准入要求',
        status: 'WARNING',
        explanation: '需要提前申请相关许可',
      });
    }

    // 检查体力要求
    if (route.constraints?.hard?.maxElevationM) {
      factors.push({
        factor: '体力要求',
        status: 'PASS',
        explanation: `最高海拔${route.constraints.hard.maxElevationM}米，需要适应高海拔环境`,
      });
    }

    // 判断整体可行性
    const hasFail = factors.some(f => f.status === 'FAIL');
    const hasWarning = factors.some(f => f.status === 'WARNING');
    let feasibility: 'FEASIBLE' | 'CONDITIONAL' | 'DIFFICULT' | 'NOT_FEASIBLE';
    if (hasFail) {
      feasibility = 'NOT_FEASIBLE';
    } else if (hasWarning) {
      feasibility = 'CONDITIONAL';
    } else {
      feasibility = 'FEASIBLE';
    }

    return {
      feasibility,
      factors,
      completionProbability: feasibility === 'FEASIBLE' ? 0.9 : feasibility === 'CONDITIONAL' ? 0.7 : 0.5,
    };
  }

  /**
   * 生成成本-收益明晰化
   */
  private async generateCostBenefitClarification(
    route: RouteDirectionData,
  ): Promise<Stage3Response['costBenefitClarification']> {
    const costs: Stage3Response['costBenefitClarification']['costs'] = [];
    const benefits: Stage3Response['costBenefitClarification']['benefits'] = [];

    // 成本
    const estimatedCost = route.metadata?.estimatedCost || 0;
    if (estimatedCost > 0) {
      costs.push({
        category: '预计费用',
        amount: estimatedCost,
        explanation: '包括交通、住宿、餐饮等基本费用',
      });
    }

    // 收益
    if (route.tags && route.tags.length > 0) {
      benefits.push({
        category: '体验价值',
        value: route.tags.join('、'),
        explanation: '路线提供的体验类型',
      });
    }

    if (route.seasonality?.bestMonths) {
      benefits.push({
        category: '季节性优势',
        value: '最佳旅行季节',
        explanation: '当前处于最佳旅行时间',
      });
    }

    return {
      costs,
      benefits,
      summary: '综合考虑成本和收益，评估路线的整体价值',
    };
  }

  /**
   * 生成决策反问
   */
  private async generateDecisionReflection(
    route: RouteDirectionData,
    userContext: UserContext,
  ): Promise<Stage3Response['decisionReflection']> {
    return {
      questions: [
        '这条路线的哪些方面最吸引你？',
        '你是否有足够的准备来应对潜在的挑战？',
        '这个时间安排是否适合你的实际情况？',
        '你对这条路线的期望是什么？',
      ],
      considerations: [
        '考虑你的体力和经验是否匹配路线要求',
        '评估时间安排是否合理',
        '思考预算是否充足',
        '考虑是否有替代方案',
      ],
    };
  }

  // ========== 阶段四辅助方法 ==========

  /**
   * 生成确认信息（GO）
   */
  private async generateGoConfirmation(
    decision: UserDecision,
    userContext: UserContext,
  ): Promise<Stage4Response> {
    return {
      confirmation: {
        message: '很好！你已经做出了决定。让我们开始准备吧。',
        nextSteps: [
          {
            step: '确认行程细节',
            description: '检查并确认行程的具体安排',
            priority: 'HIGH',
          },
          {
            step: '准备必要物品',
            description: '根据路线要求准备必要的装备和物品',
            priority: 'HIGH',
          },
          {
            step: '预订交通和住宿',
            description: '提前预订交通和住宿，确保行程顺利',
            priority: 'MEDIUM',
          },
          {
            step: '了解当地情况',
            description: '了解目的地的文化、天气、安全等情况',
            priority: 'MEDIUM',
          },
        ],
        preparationChecklist: [
          '确认护照和签证',
          '购买旅行保险',
          '准备必要的装备',
          '了解当地文化和法律',
          '准备应急联系方式',
        ],
      },
    };
  }

  /**
   * 生成反决定回应（NO_GO）
   */
  private async generateNoGoResponse(
    decision: UserDecision,
    userContext: UserContext,
  ): Promise<Stage4Response> {
    return {
      noGoResponse: {
        message: '理解你的决定。有时候不出发也是明智的选择。',
        alternatives: [
          '可以考虑其他路线',
          '可以调整时间后再考虑',
          '可以寻找更适合的选项',
        ],
        encouragement: '做出适合自己的决定是最重要的。我们会继续帮助你找到最适合的路线。',
      },
    };
  }

  /**
   * 生成延期回应（DEFER）
   */
  private async generateDeferResponse(
    decision: UserDecision,
    userContext: UserContext,
  ): Promise<Stage4Response> {
    return {
      deferResponse: {
        message: '延期是一个明智的选择，给你更多时间准备。',
        suggestedTiming: '建议在3-6个月后重新评估',
        preparationAdvice: [
          '利用这段时间提升体力和技能',
          '了解更多关于目的地的信息',
          '做好充分的准备',
          '关注最佳旅行时间',
        ],
      },
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 提取风险信息
   */
  private extractRisks(riskProfile: any): string[] {
    const risks: string[] = [];
    if (riskProfile.altitudeSickness) risks.push('高反风险');
    if (riskProfile.weatherWindow) risks.push('天气窗口限制');
    if (riskProfile.roadClosure) risks.push('封路风险');
    if (riskProfile.ferryDependent) risks.push('依赖渡轮');
    return risks;
  }
}
