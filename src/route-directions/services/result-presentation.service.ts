// src/route-directions/services/result-presentation.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  IntegratedJudgmentResult,
  AlternativeRouteOption,
  FormattedResultOutput,
} from '../interfaces/result-presentation.interface';
import { RouteDirectionData } from '../interfaces/route-direction.interface';
import { RouteExistenceJudgment } from '../interfaces/route-judgment.interface';
import { ComprehensiveRiskAssessment } from '../interfaces/enhanced-risk-assessment.interface';
import { RhythmMatchResult } from '../../trips/decision/interfaces/rhythm-matching.interface';
import { ThreeLayerExplanation } from '../../trips/decision/interfaces/three-layer-explanation.interface';
import { RouteJudgmentService } from './route-judgment.service';
import { EnhancedRiskAssessmentService } from './enhanced-risk-assessment.service';
import { RhythmMatchingService } from '../../trips/decision/services/rhythm-matching.service';
import { ThreeLayerExplanationService } from '../../trips/decision/services/three-layer-explanation.service';
import { RouteDirectionsService } from '../route-directions.service';

/**
 * 结果呈现优化服务
 * 
 * 实现P2要求的：
 * - 输出格式优化（按照文档要求的格式）
 * - 替代方案生成
 * - 完善三层解释结构
 */
@Injectable()
export class ResultPresentationService {
  private readonly logger = new Logger(ResultPresentationService.name);

  constructor(
    private readonly routeJudgmentService: RouteJudgmentService,
    private readonly enhancedRiskAssessmentService: EnhancedRiskAssessmentService,
    private readonly rhythmMatchingService: RhythmMatchingService,
    private readonly threeLayerExplanationService: ThreeLayerExplanationService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
  ) {}

  /**
   * 生成整合判断结果（文档要求的9步流程）
   */
  async generateIntegratedJudgmentResult(
    route: RouteDirectionData,
    user: any,
    context: any,
  ): Promise<IntegratedJudgmentResult> {
    // Step 1-3: 路线存在性判断
    const existenceJudgment = await this.routeJudgmentService.judgeRouteExistence(
      route,
      context,
      user,
    );

    // 如果路线不存在，直接返回拒绝结果
    if (existenceJudgment.existence.status === 'NOT_EXISTS') {
      return this.buildRejectionResult(existenceJudgment, route);
    }

    // Step 4-5: 风险评估和风险匹配
    const riskAssessment = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(
      route,
      context,
    );

    // 如果安全风险过高，拒绝
    if (riskAssessment.safety.level === 'CRITICAL' || riskAssessment.safety.level === 'HIGH') {
      return this.buildRejectionResult(existenceJudgment, route, riskAssessment);
    }

    // Step 6: 节奏匹配计算
    const rhythmMatching = await this.rhythmMatchingService.calculateRhythmMatch(
      route,
      user.persona || user,
      context,
    );

    // Step 7: 综合判断
    const overallRecommendation = this.generateOverallRecommendation(
      existenceJudgment,
      riskAssessment,
      rhythmMatching,
    );

    // Step 8: 生成三层解释
    const explanation = await this.generateEnhancedExplanation(
      route,
      existenceJudgment,
      riskAssessment,
      rhythmMatching,
    );

    // Step 9: 生成替代方案
    const alternatives = await this.generateAlternatives(route, user, context);

    // 生成格式化输出
    const formattedOutput = this.formatResultOutput(
      route,
      existenceJudgment,
      riskAssessment,
      rhythmMatching,
      overallRecommendation,
      alternatives,
    );

    return {
      existenceJudgment,
      riskAssessment,
      rhythmMatching,
      overallRecommendation,
      explanation,
      alternatives,
      formattedOutput,
    };
  }

  /**
   * 生成替代方案
   */
  async generateAlternatives(
    originalRoute: RouteDirectionData,
    user: any,
    context: any,
  ): Promise<AlternativeRouteOption[]> {
    const alternatives: AlternativeRouteOption[] = [];

    try {
      // 1. 基于相似标签查找替代路线
      const similarRoutes = await this.findSimilarRoutes(originalRoute, user, context);
      for (const similarRoute of similarRoutes.slice(0, 3)) {
        alternatives.push(
          await this.createAlternativeOption(originalRoute, similarRoute, user, context, 'SIMILAR'),
        );
      }

      // 2. 基于不同节奏查找替代路线
      const differentRhythmRoutes = await this.findDifferentRhythmRoutes(
        originalRoute,
        user,
        context,
      );
      for (const diffRoute of differentRhythmRoutes.slice(0, 2)) {
        alternatives.push(
          await this.createAlternativeOption(originalRoute, diffRoute, user, context, 'DIFFERENT_RHYTHM'),
        );
      }

      // 3. 基于不同风险等级查找替代路线
      const lowerRiskRoutes = await this.findLowerRiskRoutes(originalRoute, user, context);
      for (const lowRiskRoute of lowerRiskRoutes.slice(0, 2)) {
        alternatives.push(
          await this.createAlternativeOption(originalRoute, lowRiskRoute, user, context, 'LOWER_RISK'),
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to generate alternatives: ${error}`);
    }

    // 按匹配度排序
    return alternatives.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 格式化结果输出
   */
  private formatResultOutput(
    route: RouteDirectionData,
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
    overallRecommendation: IntegratedJudgmentResult['overallRecommendation'],
    alternatives: AlternativeRouteOption[],
  ): FormattedResultOutput {
    // 存在性判断部分
    const existenceSection = this.formatExistenceSection(existenceJudgment);

    // 风险评估部分
    const riskSection = this.formatRiskSection(riskAssessment);

    // 节奏建议部分
    const rhythmSection = this.formatRhythmSection(rhythmMatching);

    // 综合建议部分
    const recommendationSection = this.formatRecommendationSection(overallRecommendation);

    // 替代方案部分
    const alternativesSection = this.formatAlternativesSection(alternatives);

    // 生成完整格式化输出
    const fullFormatted = this.generateFullFormattedOutput(
      route,
      existenceSection,
      riskSection,
      rhythmSection,
      recommendationSection,
      alternativesSection,
    );

    return {
      title: `路线评估结果：${route.name || route.id}`,
      existenceSection,
      riskSection,
      rhythmSection,
      recommendationSection,
      alternativesSection,
      fullFormatted,
    };
  }

  // ========== 格式化方法 ==========

  /**
   * 格式化存在性判断部分
   */
  private formatExistenceSection(
    existenceJudgment: RouteExistenceJudgment,
  ): FormattedResultOutput['existenceSection'] {
    const statusMap: Record<string, string> = {
      EXISTS: '✅ 路线存在',
      CONDITIONAL_EXISTS: '⚠️ 条件存在',
      NOT_EXISTS: '❌ 路线不存在',
    };

    const status = statusMap[existenceJudgment.existence.status] || '❓ 未知状态';
    const details = [
      `可行性：${existenceJudgment.feasibility.level}`,
      `适时性：${existenceJudgment.timeliness.level}`,
      `匹配性：${existenceJudgment.matching.overallMatch}`,
    ];

    const formatted = [
      '## 📍 存在性判断',
      status,
      '',
      ...details.map(d => `- ${d}`),
      '',
      `**解释**：${existenceJudgment.explanation}`,
    ].join('\n');

    return {
      title: '存在性判断',
      status,
      details,
      formatted,
    };
  }

  /**
   * 格式化风险评估部分
   */
  private formatRiskSection(
    riskAssessment: ComprehensiveRiskAssessment,
  ): FormattedResultOutput['riskSection'] {
    const emojiMap: Record<string, string> = {
      LOW: '🟢',
      MEDIUM: '🟡',
      HIGH: '🟠',
      CRITICAL: '🔴',
    };

    const levelTextMap: Record<string, string> = {
      LOW: '低',
      MEDIUM: '中',
      HIGH: '高',
      CRITICAL: '极高',
    };

    const details = [
      {
        category: '安全风险',
        level: levelTextMap[riskAssessment.safety.level],
        emoji: emojiMap[riskAssessment.safety.level],
        description: riskAssessment.safety.details.join('；'),
      },
      {
        category: '体力风险',
        level: levelTextMap[riskAssessment.physical.level],
        emoji: emojiMap[riskAssessment.physical.level],
        description: riskAssessment.physical.details.join('；'),
      },
      {
        category: '时间风险',
        level: levelTextMap[riskAssessment.time.level],
        emoji: emojiMap[riskAssessment.time.level],
        description: riskAssessment.time.details.join('；'),
      },
      {
        category: '体验风险',
        level: levelTextMap[riskAssessment.experience.overallLevel],
        emoji: emojiMap[riskAssessment.experience.overallLevel],
        description: riskAssessment.experience.summary,
      },
      {
        category: '成本风险',
        level: levelTextMap[riskAssessment.cost.overallLevel],
        emoji: emojiMap[riskAssessment.cost.overallLevel],
        description: riskAssessment.cost.summary,
      },
    ];

    const formatted = [
      '## ⚠️ 风险评估',
      riskAssessment.formattedSummary,
      '',
      ...details.map(d => `${d.emoji} **${d.category}**：${d.level} - ${d.description}`),
    ].join('\n');

    return {
      title: '风险评估',
      summary: riskAssessment.formattedSummary,
      details,
      formatted,
    };
  }

  /**
   * 格式化节奏建议部分
   */
  private formatRhythmSection(
    rhythmMatching: RhythmMatchResult,
  ): FormattedResultOutput['rhythmSection'] {
    const rhythmNameMap: Record<string, string> = {
      INTENSIVE: '紧凑型',
      RELAXED: '舒缓型',
      FLEXIBLE: '弹性型',
      THEMED: '主题型',
      HYBRID: '混合型',
    };

    const recommendedRhythm = rhythmNameMap[rhythmMatching.recommendedRhythm] || rhythmMatching.recommendedRhythm;
    const adjustments = rhythmMatching.adjustments.map(a => a.description);

    const formatted = [
      '## 🎯 节奏建议',
      `**推荐节奏类型**：${recommendedRhythm}`,
      '',
      `**推荐理由**：${rhythmMatching.recommendationReason}`,
      '',
      ...(adjustments.length > 0
        ? ['**调整建议**：', ...adjustments.map(a => `- ${a}`)]
        : ['**调整建议**：无']),
    ].join('\n');

    return {
      title: '节奏建议',
      recommendedRhythm,
      reason: rhythmMatching.recommendationReason,
      adjustments,
      formatted,
    };
  }

  /**
   * 格式化综合建议部分
   */
  private formatRecommendationSection(
    overallRecommendation: IntegratedJudgmentResult['overallRecommendation'],
  ): FormattedResultOutput['recommendationSection'] {
    const conclusionMap: Record<string, string> = {
      RECOMMEND: '✅ 推荐',
      CONDITIONAL_RECOMMEND: '⚠️ 条件推荐',
      NOT_RECOMMEND: '❌ 不推荐',
    };

    const conclusion = conclusionMap[overallRecommendation.conclusion] || '❓ 未知';

    const formatted = [
      '## 💡 综合建议',
      conclusion,
      '',
      `**评分**：${Math.round(overallRecommendation.score * 100)}/100`,
      '',
      `**摘要**：${overallRecommendation.summary}`,
    ].join('\n');

    return {
      title: '综合建议',
      conclusion,
      score: overallRecommendation.score,
      summary: overallRecommendation.summary,
      formatted,
    };
  }

  /**
   * 格式化替代方案部分
   */
  private formatAlternativesSection(
    alternatives: AlternativeRouteOption[],
  ): FormattedResultOutput['alternativesSection'] {
    const alternativesList = alternatives.map(a => ({
      name: a.routeName,
      reason: a.reason,
      matchScore: a.matchScore,
    }));

    const formatted =
      alternatives.length > 0
        ? [
            '## 🔄 替代方案',
            '',
            ...alternativesList.map(
              (a, i) =>
                `${i + 1}. **${a.name}**（匹配度：${Math.round(a.matchScore * 100)}%）\n   - ${a.reason}`,
            ),
          ].join('\n')
        : '## 🔄 替代方案\n\n暂无替代方案';

    return {
      title: '替代方案',
      alternatives: alternativesList,
      formatted,
    };
  }

  /**
   * 生成完整格式化输出
   */
  private generateFullFormattedOutput(
    route: RouteDirectionData,
    existenceSection: FormattedResultOutput['existenceSection'],
    riskSection: FormattedResultOutput['riskSection'],
    rhythmSection: FormattedResultOutput['rhythmSection'],
    recommendationSection: FormattedResultOutput['recommendationSection'],
    alternativesSection: FormattedResultOutput['alternativesSection'],
  ): string {
    return [
      `# 路线评估结果：${route.name || route.id}`,
      '',
      existenceSection.formatted,
      '',
      riskSection.formatted,
      '',
      rhythmSection.formatted,
      '',
      recommendationSection.formatted,
      '',
      alternativesSection.formatted,
    ].join('\n');
  }

  // ========== 替代方案生成辅助方法 ==========

  /**
   * 查找相似路线
   */
  private async findSimilarRoutes(
    originalRoute: RouteDirectionData,
    user: any,
    context: any,
  ): Promise<RouteDirectionData[]> {
    try {
      if (!this.routeDirectionsService) {
        this.logger.warn('RouteDirectionsService not available, skipping alternative route search');
        return [];
      }

      // 基于标签和目的地查找相似路线
      const tags = originalRoute.tags || [];
      const countryCode = originalRoute.countryCode;

      // 简化实现：通过服务查找相似路线
      // 注意：这里需要根据实际的findAll方法签名调整
      const queryDto: any = {
        countryCode,
        tags: tags.slice(0, 3), // 使用前3个标签
        limit: 10,
      };

      const routes = await (this.routeDirectionsService as any).findAll(queryDto);

      // 过滤掉原始路线
      return routes.filter((r: RouteDirectionData) => r.id !== originalRoute.id).slice(0, 5);
    } catch (error) {
      this.logger.warn(`Failed to find similar routes: ${error}`);
      return [];
    }
  }

  /**
   * 查找不同节奏的路线
   */
  private async findDifferentRhythmRoutes(
    originalRoute: RouteDirectionData,
    user: any,
    context: any,
  ): Promise<RouteDirectionData[]> {
    try {
      // 简化实现：查找相同标签但不同强度的路线
      const routes = await this.findSimilarRoutes(originalRoute, user, context);

      // 根据路线特征推断节奏差异
      return routes.filter(route => {
        const originalIntensity = this.inferRouteIntensity(originalRoute);
        const routeIntensity = this.inferRouteIntensity(route);
        return Math.abs(originalIntensity - routeIntensity) > 0.3;
      });
    } catch (error) {
      this.logger.warn(`Failed to find different rhythm routes: ${error}`);
      return [];
    }
  }

  /**
   * 查找低风险路线
   */
  private async findLowerRiskRoutes(
    originalRoute: RouteDirectionData,
    user: any,
    context: any,
  ): Promise<RouteDirectionData[]> {
    try {
      const routes = await this.findSimilarRoutes(originalRoute, user, context);

      // 评估每条路线的风险
      const routesWithRisk = await Promise.all(
        routes.map(async route => {
          const risk = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(route, context);
          return { route, risk };
        }),
      );

      // 筛选出风险更低的路线
      const originalRisk = await this.enhancedRiskAssessmentService.assessComprehensiveRisk(
        originalRoute,
        context,
      );

      return routesWithRisk
        .filter(({ risk }) => risk.overallScore < originalRisk.overallScore)
        .map(({ route }) => route);
    } catch (error) {
      this.logger.warn(`Failed to find lower risk routes: ${error}`);
      return [];
    }
  }

  /**
   * 创建替代方案选项
   */
  private async createAlternativeOption(
    originalRoute: RouteDirectionData,
    alternativeRoute: RouteDirectionData,
    user: any,
    context: any,
    reasonType: 'SIMILAR' | 'DIFFERENT_RHYTHM' | 'LOWER_RISK',
  ): Promise<AlternativeRouteOption> {
    // 评估匹配度
    const rhythmMatching = await this.rhythmMatchingService.calculateRhythmMatch(
      alternativeRoute,
      user.persona || user,
      context,
    );

    // 生成原因
    const reason = this.generateAlternativeReason(originalRoute, alternativeRoute, reasonType);

    // 生成差异分析
    const differences = await this.analyzeDifferences(originalRoute, alternativeRoute);

    // 生成适用场景
    const suitableFor = this.generateSuitableFor(alternativeRoute, rhythmMatching);

    return {
      routeId: String(alternativeRoute.id || ''),
      routeName: alternativeRoute.name || String(alternativeRoute.id || '') || '未知路线',
      route: alternativeRoute,
      reason,
      differences,
      suitableFor,
      matchScore: rhythmMatching.scores.overallMatch,
    };
  }

  /**
   * 生成替代方案原因
   */
  private generateAlternativeReason(
    originalRoute: RouteDirectionData,
    alternativeRoute: RouteDirectionData,
    reasonType: 'SIMILAR' | 'DIFFERENT_RHYTHM' | 'LOWER_RISK',
  ): string {
    const reasonMap: Record<string, string> = {
      SIMILAR: '与原始路线相似，但可能有不同的体验',
      DIFFERENT_RHYTHM: '节奏不同，适合不同的旅行偏好',
      LOWER_RISK: '风险更低，更适合保守型旅行者',
    };

    return reasonMap[reasonType] || '替代路线选项';
  }

  /**
   * 分析路线差异
   */
  private async analyzeDifferences(
    originalRoute: RouteDirectionData,
    alternativeRoute: RouteDirectionData,
  ): Promise<AlternativeRouteOption['differences']> {
    const advantages: string[] = [];
    const disadvantages: string[] = [];

    // 比较时长
    const originalDuration = originalRoute.metadata?.estimatedDuration || 0;
    const altDuration = alternativeRoute.metadata?.estimatedDuration || 0;
    if (altDuration < originalDuration) {
      advantages.push('行程更短');
    } else if (altDuration > originalDuration) {
      disadvantages.push('行程更长');
    }

    // 比较成本
    const originalCost = originalRoute.metadata?.estimatedCost || 0;
    const altCost = alternativeRoute.metadata?.estimatedCost || 0;
    if (altCost < originalCost) {
      advantages.push('成本更低');
    } else if (altCost > originalCost) {
      disadvantages.push('成本更高');
    }

    // 比较风险
    const originalRisk = originalRoute.riskProfile || {};
    const altRisk = alternativeRoute.riskProfile || {};
    if (!altRisk.altitudeSickness && originalRisk.altitudeSickness) {
      advantages.push('无高反风险');
    }
    if (!altRisk.weatherWindow && originalRisk.weatherWindow) {
      advantages.push('不受天气窗口限制');
    }

    return { advantages, disadvantages };
  }

  /**
   * 生成适用场景
   */
  private generateSuitableFor(
    route: RouteDirectionData,
    rhythmMatching: RhythmMatchResult,
  ): string[] {
    const suitableFor: string[] = [];

    const rhythmNameMap: Record<string, string> = {
      INTENSIVE: '体力充沛、时间紧张',
      RELAXED: '想要放松、时间充足',
      FLEXIBLE: '喜欢灵活、不确定偏好',
      THEMED: '有明确主题、深度体验',
      HYBRID: '多样化需求、平衡体验',
    };

    suitableFor.push(rhythmNameMap[rhythmMatching.recommendedRhythm] || '一般旅行者');

    if (route.tags?.includes('文化') || route.tags?.includes('culture')) {
      suitableFor.push('文化爱好者');
    }
    if (route.tags?.includes('自然') || route.tags?.includes('nature')) {
      suitableFor.push('自然爱好者');
    }

    return suitableFor;
  }

  // ========== 其他辅助方法 ==========

  /**
   * 生成总体建议
   */
  private generateOverallRecommendation(
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
  ): IntegratedJudgmentResult['overallRecommendation'] {
    // 如果路线不存在，不推荐
    if (existenceJudgment.existence.status === 'NOT_EXISTS') {
      return {
        conclusion: 'NOT_RECOMMEND',
        score: 0,
        summary: '路线不存在，不建议选择',
      };
    }

    // 如果安全风险过高，不推荐
    if (riskAssessment.safety.level === 'CRITICAL' || riskAssessment.safety.level === 'HIGH') {
      return {
        conclusion: 'NOT_RECOMMEND',
        score: 0.2,
        summary: '安全风险过高，不建议选择',
      };
    }

    // 计算综合评分
    const existenceScore = existenceJudgment.existence.score;
    const riskScore = 1 - riskAssessment.overallScore; // 风险越低，分数越高
    const rhythmScore = rhythmMatching.scores.overallMatch;

    const overallScore = existenceScore * 0.4 + riskScore * 0.3 + rhythmScore * 0.3;

    // 判断结论
    let conclusion: 'RECOMMEND' | 'CONDITIONAL_RECOMMEND' | 'NOT_RECOMMEND';
    if (overallScore >= 0.7) {
      conclusion = 'RECOMMEND';
    } else if (overallScore >= 0.4) {
      conclusion = 'CONDITIONAL_RECOMMEND';
    } else {
      conclusion = 'NOT_RECOMMEND';
    }

    // 生成摘要
    const summaryParts: string[] = [];
    if (existenceJudgment.existence.status === 'EXISTS') {
      summaryParts.push('路线可行');
    } else {
      summaryParts.push('路线条件可行');
    }

    if (riskAssessment.overallLevel === 'LOW' || riskAssessment.overallLevel === 'MEDIUM') {
      summaryParts.push('风险可控');
    } else {
      summaryParts.push('需要注意风险');
    }

    summaryParts.push(`推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`);

    return {
      conclusion,
      score: overallScore,
      summary: summaryParts.join('，'),
    };
  }

  /**
   * 生成增强的三层解释
   */
  private async generateEnhancedExplanation(
    route: RouteDirectionData,
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
  ): Promise<ThreeLayerExplanation> {
    // 使用现有的三层解释服务，但增强内容
    // 简化实现：手动构建三层解释
    return {
      layer1_conclusion: {
        statement: this.generateConclusionStatement(existenceJudgment, riskAssessment, rhythmMatching),
        confidence: this.calculateConfidence(existenceJudgment, riskAssessment, rhythmMatching),
      },
      layer2_reason: {
        primaryFactors: [
          `存在性：${existenceJudgment.existence.status}`,
          `风险等级：${riskAssessment.overallLevel}`,
          `推荐节奏：${this.getRhythmName(rhythmMatching.recommendedRhythm)}`,
        ],
        contributingFactors: [
          `可行性：${existenceJudgment.feasibility.level}`,
          `适时性：${existenceJudgment.timeliness.level}`,
          `匹配性：${existenceJudgment.matching.overallMatch}`,
        ],
        explanation: this.generateReasonExplanation(existenceJudgment, riskAssessment, rhythmMatching),
      },
      layer3_evidence: {
        dataSources: [],
        calculationMethod: '综合评估（存在性判断 + 风险评估 + 节奏匹配）',
        assumptions: [
          '用户提供的信息准确',
          '环境条件在预测范围内',
          '路线数据可靠',
        ],
        limitations: [
          '预测基于历史数据和当前信息，实际结果可能有所不同',
          '天气和交通状况可能实时变化',
        ],
        evidenceChain: [
          {
            step: 1,
            operation: '路线存在性判断',
            input: '路线数据、用户信息、上下文',
            output: existenceJudgment.existence.status,
            method: 'RouteJudgmentService',
          },
          {
            step: 2,
            operation: '综合风险评估',
            input: '路线数据、上下文',
            output: riskAssessment.overallLevel,
            method: 'EnhancedRiskAssessmentService',
          },
          {
            step: 3,
            operation: '节奏匹配计算',
            input: '路线数据、用户画像',
            output: rhythmMatching.recommendedRhythm,
            method: 'RhythmMatchingService',
          },
        ],
      },
    };
  }

  /**
   * 生成结论陈述
   */
  private generateConclusionStatement(
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
  ): string {
    if (existenceJudgment.existence.status === 'NOT_EXISTS') {
      return '这条路线目前不建议';
    }

    if (riskAssessment.overallLevel === 'CRITICAL' || riskAssessment.overallLevel === 'HIGH') {
      return '这条路线存在较高风险，需要谨慎考虑';
    }

    return `这条路线可行，推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
  ): number {
    const existenceConfidence = existenceJudgment.existence.score;
    const riskConfidence = 1 - riskAssessment.overallScore;
    const rhythmConfidence = rhythmMatching.scores.overallMatch;

    return (existenceConfidence + riskConfidence + rhythmConfidence) / 3;
  }

  /**
   * 生成原因解释
   */
  private generateReasonExplanation(
    existenceJudgment: RouteExistenceJudgment,
    riskAssessment: ComprehensiveRiskAssessment,
    rhythmMatching: RhythmMatchResult,
  ): string {
    const parts: string[] = [];

    parts.push(`路线${existenceJudgment.existence.status === 'EXISTS' ? '存在' : '条件存在'}`);
    parts.push(`风险等级为${riskAssessment.overallLevel}`);
    parts.push(`推荐${this.getRhythmName(rhythmMatching.recommendedRhythm)}节奏`);

    return parts.join('，');
  }

  /**
   * 构建拒绝结果
   */
  private buildRejectionResult(
    existenceJudgment: RouteExistenceJudgment,
    route: RouteDirectionData,
    riskAssessment?: ComprehensiveRiskAssessment,
  ): IntegratedJudgmentResult {
    const overallRecommendation = {
      conclusion: 'NOT_RECOMMEND' as const,
      score: 0,
      summary: existenceJudgment.existence.reason || '路线不可行',
    };

    const explanation: ThreeLayerExplanation = {
      layer1_conclusion: {
        statement: '这条路线不建议',
        confidence: 0.9,
      },
      layer2_reason: {
        primaryFactors: [existenceJudgment.existence.reason],
        explanation: existenceJudgment.explanation,
      },
      layer3_evidence: {
        dataSources: [],
        assumptions: [],
        limitations: [],
        evidenceChain: [],
      },
    };

    const formattedOutput = this.formatResultOutput(
      route,
      existenceJudgment,
      riskAssessment || ({} as ComprehensiveRiskAssessment),
      {} as RhythmMatchResult,
      overallRecommendation,
      [],
    );

    return {
      existenceJudgment,
      riskAssessment: riskAssessment || ({} as ComprehensiveRiskAssessment),
      rhythmMatching: {} as RhythmMatchResult,
      overallRecommendation,
      explanation,
      alternatives: [],
      formattedOutput,
    };
  }

  /**
   * 推断路线强度
   */
  private inferRouteIntensity(route: RouteDirectionData): number {
    const constraints = route.constraints || {};
    let intensity = 0.5;

    if (constraints.hard?.maxElevationM && constraints.hard.maxElevationM > 3000) {
      intensity += 0.2;
    }
    if (constraints.hard?.maxSlopePct && constraints.hard.maxSlopePct > 20) {
      intensity += 0.2;
    }

    return Math.min(1.0, intensity);
  }

  /**
   * 获取节奏名称
   */
  private getRhythmName(rhythm: string): string {
    const rhythmNameMap: Record<string, string> = {
      INTENSIVE: '紧凑型',
      RELAXED: '舒缓型',
      FLEXIBLE: '弹性型',
      THEMED: '主题型',
      HYBRID: '混合型',
    };

    return rhythmNameMap[rhythm] || rhythm;
  }
}
